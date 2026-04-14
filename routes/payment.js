const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { orderOps, taskOps } = require('../models/db');
const { requireAuth } = require('./auth');

// 支付宝配置
const ALIPAY_CONFIG = {
  appId: process.env.ALIPAY_APP_ID || '',
  privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || '',
  gateway: process.env.ALIPAY_SANDBOX === 'true' 
    ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
    : 'https://openapi.alipay.com/gateway.do',
  notifyUrl: process.env.ALIPAY_NOTIFY_URL || ''
};

// RSA2签名
function alipaySign(params, privateKey) {
  const signString = Object.keys(params)
    .filter(key => params[key] !== '' && params[key] !== null && key !== 'sign' && key !== 'sign_type')
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  const sign = crypto.sign('RSA-SHA256', Buffer.from(signString), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING
  });
  return sign.toString('base64');
}

// 验证签名
function verifySign(params, publicKey) {
  const signString = Object.keys(params)
    .filter(key => params[key] !== '' && params[key] !== null && key !== 'sign' && key !== 'sign_type')
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  return crypto.verify('RSA-SHA256', Buffer.from(signString), publicKey, Buffer.from(params.sign, 'base64'));
}

// 创建支付订单
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { taskId, amount, currency = 'cny' } = req.body;
    const userId = req.user.userId;

    let task = null;
    let finalAmount = parseFloat(amount);

    if (taskId) {
      task = taskOps.findById(taskId);
      if (!task) {
        return res.status(404).json({ error: '任务不存在' });
      }
      // 任务金额 = 报酬 + 5%服务费
      finalAmount = parseFloat((task.reward * 1.05).toFixed(2));
    }

    if (!finalAmount || finalAmount <= 0) {
      return res.status(400).json({ error: '金额必须大于0' });
    }

    // 生成订单号
    const orderNo = `AIB${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // 创建订单记录
    orderOps.create(orderNo, userId, finalAmount, currency);

    // 未配置支付宝时，返回模拟支付信息
    if (!ALIPAY_CONFIG.appId || !ALIPAY_CONFIG.privateKey) {
      return res.json({
        orderNo,
        amount: finalAmount.toFixed(2),
        currency,
        mockPay: true,
        message: '支付宝未配置，请先设置环境变量 ALIPAY_APP_ID 和 ALIPAY_PRIVATE_KEY'
      });
    }

    // 支付宝当面付参数
    const bizContent = {
      outTradeNo: orderNo,
      totalAmount: finalAmount.toFixed(2),
      subject: task ? `AIBoss任务发布:${task.title}` : 'AIBoss充值',
      productCode: 'FAST_INSTANT_TRADE_PAY'
    };

    // 构建签名参数
    const params = {
      app_id: ALIPAY_CONFIG.appId,
      method: 'alipay.trade.pay',
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
      version: '1.0',
      biz_content: JSON.stringify(bizContent),
      notify_url: ALIPAY_CONFIG.notifyUrl
    };

    // 生成签名
    params.sign = alipaySign(params, ALIPAY_CONFIG.privateKey);

    // 返回支付表单（HTML自动提交）
    const payForm = `
<form id="alipay-form" action="${ALIPAY_CONFIG.gateway}" method="POST">
${Object.keys(params).map(k => `<input type="hidden" name="${k}" value="${params[k]}">`).join('\n')}
</form>
<script>document.getElementById('alipay-form').submit();</script>
    `;

    res.json({
      orderNo,
      amount: finalAmount.toFixed(2),
      currency,
      payForm,
      message: '请提交支付'
    });
  } catch (error) {
    console.error('创建支付订单错误:', error);
    res.status(500).json({ error: '创建订单失败' });
  }
});

// 模拟支付成功（MVP测试用）
router.post('/mock-pay', requireAuth, (req, res) => {
  try {
    const { orderNo } = req.body;

    const order = orderOps.findByOrderNo(orderNo);
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    if (order.status === 'paid') {
      return res.status(400).json({ error: '订单已支付' });
    }

    // 更新订单状态
    orderOps.updateStatus(orderNo, 'paid', `MOCK${Date.now()}`);

    // 如果是任务订单，激活任务
    if (order.task_id) {
      taskOps.updateStatus(order.task_id, 'active');
      
      // 回调通知任务发布者
      const task = taskOps.findById(order.task_id);
      if (task && task.callback_url) {
        console.log('任务已激活，通知:', task.callback_url);
      }
    }

    res.json({ message: '模拟支付成功', orderNo });
  } catch (error) {
    console.error('模拟支付错误:', error);
    res.status(500).json({ error: '支付失败' });
  }
});

// 支付宝异步回调
router.post('/notify', (req, res) => {
  try {
    const params = req.body;
    console.log('支付宝回调 params:', JSON.stringify(params));

    const { out_trade_no, trade_no, trade_status } = params;

    // 验证签名
    if (ALIPAY_CONFIG.alipayPublicKey && params.sign) {
      if (!verifySign(params, ALIPAY_CONFIG.alipayPublicKey)) {
        console.error('签名验证失败');
        return res.send('fail');
      }
    }

    if (trade_status === 'TRADE_SUCCESS' || trade_status === 'TRADE_FINISHED') {
      const order = orderOps.findByOrderNo(out_trade_no);
      if (order && order.status === 'pending') {
        orderOps.updateStatus(out_trade_no, 'paid', trade_no);

        if (order.task_id) {
          taskOps.updateStatus(order.task_id, 'active');

          const task = taskOps.findById(order.task_id);
          if (task && task.callback_url) {
            // 发送回调通知
            const notifyData = {
              task_id: task.id,
              status: 'active',
              order_no: out_trade_no
            };
            console.log('发送回调到:', task.callback_url, notifyData);
          }
        }
      }
    }

    res.send('success');
  } catch (error) {
    console.error('支付宝回调处理错误:', error);
    res.send('fail');
  }
});

// 查询订单
router.get('/query/:orderNo', requireAuth, (req, res) => {
  try {
    const order = orderOps.findByOrderNo(req.params.orderNo);
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }
    res.json({ order });
  } catch (error) {
    console.error('查询订单错误:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

// 获取用户订单列表
router.get('/my-orders', requireAuth, (req, res) => {
  try {
    const orders = orderOps.findByUserId(req.user.userId);
    res.json({ orders });
  } catch (error) {
    console.error('获取订单列表错误:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

module.exports = router;