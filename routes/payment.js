const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { orderOps, taskOps, userOps, withdrawOps, notificationOps } = require('../models/db');
const { requireAuth } = require('./auth');

const ALIPAY_CONFIG = {
  appId: process.env.ALIPAY_APP_ID || '',
  privateKey: process.env.ALIPAY_PRIVATE_KEY || readKey([
    'keys/alipay/appPrivateKey.txt'
  ]),
  alipayPublicKey: readKey([
    'keys/alipay/alipayPublicKey_RSA2.txt',
    'keys/alipay/alipayCertPublicKey_RSA2.crt',
    'certs/alipay_cert.crt'
  ]) || process.env.ALIPAY_ALIPAY_PUBLIC_KEY || process.env.ALIPAY_PUBLIC_KEY || '',
  gateway: process.env.ALIPAY_SANDBOX === 'true'
    ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
    : 'https://openapi.alipay.com/gateway.do',
  notifyUrl: process.env.ALIPAY_NOTIFY_URL || '',
  returnUrl: process.env.ALIPAY_RETURN_URL || 'https://aibosshire.com/dashboard.html',
  skipNotifyVerify: process.env.ALIPAY_SKIP_NOTIFY_VERIFY === 'true'
};

function readKey(candidates) {
  for (const candidate of candidates) {
    const filePath = path.join(__dirname, '..', candidate);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8').trim();
    }
  }
  return '';
}

function formatKey(raw, type) {
  if (!raw) return '';
  const trimmed = raw.replace(/\\n/g, '\n').trim();
  if (trimmed.includes('-----BEGIN')) return trimmed;

  const label = type === 'private' ? 'PRIVATE KEY' : 'PUBLIC KEY';
  const body = trimmed.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') || trimmed;
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

function signContent(params) {
  return Object.keys(params)
    .filter(key => key !== 'sign' && key !== 'sign_type')
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
}

function alipaySign(params) {
  const privateKey = formatKey(ALIPAY_CONFIG.privateKey, 'private');
  return crypto.sign('RSA-SHA256', Buffer.from(signContent(params), 'utf8'), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING
  }).toString('base64');
}

function verifySign(params) {
  if (!ALIPAY_CONFIG.alipayPublicKey || !params.sign) {
    return false;
  }

  try {
    const publicKey = formatKey(ALIPAY_CONFIG.alipayPublicKey, 'public');
    return crypto.verify(
      'RSA-SHA256',
      Buffer.from(signContent(params), 'utf8'),
      publicKey,
      Buffer.from(params.sign, 'base64')
    );
  } catch (error) {
    console.error('Alipay notify signature verify error:', error.message);
    return false;
  }
}

function alipayCommonParams(method, bizContent) {
  return {
    app_id: ALIPAY_CONFIG.appId,
    method,
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
    version: '1.0',
    biz_content: JSON.stringify(bizContent)
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildPayForm(params) {
  const inputs = Object.keys(params)
    .map(key => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(params[key])}">`)
    .join('\n');

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>AIBoss Pay</title></head>
<body>
<form id="alipay-form" action="${escapeHtml(ALIPAY_CONFIG.gateway)}" method="POST">
${inputs}
</form>
<script>document.getElementById('alipay-form').submit();</script>
</body>
</html>`;
}

function canUseAlipay() {
  return Boolean(ALIPAY_CONFIG.appId && ALIPAY_CONFIG.privateKey);
}

function createOrderNo() {
  return `AIB${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function validateAmount(amount) {
  const finalAmount = Number.parseFloat(amount);
  if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
    return null;
  }
  return Number.parseFloat(finalAmount.toFixed(2));
}

function settlePaidOrder(orderNo, tradeNo) {
  const order = orderOps.findByOrderNo(orderNo);
  if (!order) {
    return { ok: false, reason: 'order_not_found' };
  }

  if (order.status === 'paid') {
    return { ok: true, order, alreadyPaid: true };
  }

  orderOps.updateStatus(orderNo, 'paid', tradeNo || order.trade_no || '');

  if (order.task_id) {
    taskOps.updateStatus(order.task_id, 'active');
  } else {
    userOps.updateBalance(order.user_id, order.amount, order.currency || 'cny');
  }

  const updated = orderOps.findByOrderNo(orderNo);
  return { ok: true, order: updated, alreadyPaid: false };
}

async function queryAlipayTrade(orderNo) {
  if (!canUseAlipay()) {
    throw new Error('Alipay is not configured');
  }

  const params = alipayCommonParams('alipay.trade.query', {
    out_trade_no: orderNo
  });
  params.sign = alipaySign(params);

  const response = await fetch(ALIPAY_CONFIG.gateway, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams(params)
  });

  if (!response.ok) {
    throw new Error(`Alipay query failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  return payload.alipay_trade_query_response || payload;
}

function buildPaymentResponse(req, res) {
  const { taskId, amount, currency = 'cny' } = req.body;
  const userId = req.user.userId;

  let task = null;
  let finalAmount = validateAmount(amount);
  let orderTaskId = null;

  if (taskId) {
    task = taskOps.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    finalAmount = validateAmount(task.reward * 1.05);
    orderTaskId = task.id;
  }

  if (!finalAmount) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }

  const orderNo = createOrderNo();
  orderOps.create(orderNo, userId, finalAmount, currency, orderTaskId);

  if (!canUseAlipay()) {
    return res.json({
      orderNo,
      amount: finalAmount.toFixed(2),
      currency,
      mockPay: true,
      message: 'Alipay is not configured. Use /api/payment/mock-pay for local testing.'
    });
  }

  const params = alipayCommonParams('alipay.trade.page.pay', {
    out_trade_no: orderNo,
    total_amount: finalAmount.toFixed(2),
    subject: task ? `AIBoss task: ${task.title}` : 'AIBoss balance recharge',
    product_code: 'FAST_INSTANT_TRADE_PAY'
  });
  params.notify_url = ALIPAY_CONFIG.notifyUrl;
  params.return_url = ALIPAY_CONFIG.returnUrl;
  params.sign = alipaySign(params);

  return res.json({
    orderNo,
    amount: finalAmount.toFixed(2),
    currency,
    payForm: buildPayForm(params),
    message: 'Submit the payment form to Alipay.'
  });
}

router.post('/create', requireAuth, (req, res) => {
  try {
    return buildPaymentResponse(req, res);
  } catch (error) {
    console.error('Create payment order error:', error);
    return res.status(500).json({ error: 'Failed to create order' });
  }
});

router.post('/qrcode', requireAuth, (req, res) => {
  try {
    return buildPaymentResponse(req, res);
  } catch (error) {
    console.error('Create payment form error:', error);
    return res.status(500).json({ error: 'Failed to create payment form' });
  }
});

router.post('/mock-pay', requireAuth, (req, res) => {
  try {
    const { orderNo } = req.body;
    const order = orderOps.findByOrderNo(orderNo);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'No permission for this order' });
    }

    const result = settlePaidOrder(orderNo, `MOCK${Date.now()}`);
    return res.json({
      message: result.alreadyPaid ? 'Order was already paid' : 'Mock payment succeeded',
      orderNo,
      order: result.order
    });
  } catch (error) {
    console.error('Mock payment error:', error);
    return res.status(500).json({ error: 'Payment failed' });
  }
});

router.post('/notify', (req, res) => {
  try {
    const params = req.body || {};

    if (!ALIPAY_CONFIG.skipNotifyVerify && !verifySign(params)) {
      console.error('Alipay notify signature verification failed');
      return res.send('fail');
    }

    const { out_trade_no: orderNo, trade_no: tradeNo, trade_status: tradeStatus } = params;
    if (!orderNo) {
      return res.send('fail');
    }

    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
      const result = settlePaidOrder(orderNo, tradeNo);
      if (!result.ok) {
        console.error('Alipay notify order settle failed:', result.reason, orderNo);
        return res.send('fail');
      }
    }

    return res.send('success');
  } catch (error) {
    console.error('Alipay notify handling error:', error);
    return res.send('fail');
  }
});

router.post('/settle/:orderNo', requireAuth, async (req, res) => {
  try {
    const order = orderOps.findByOrderNo(req.params.orderNo);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'No permission for this order' });
    }
    if (order.status === 'paid') {
      return res.json({ settled: true, alreadyPaid: true, order });
    }

    const trade = await queryAlipayTrade(order.order_no);
    const paid = trade.trade_status === 'TRADE_SUCCESS' || trade.trade_status === 'TRADE_FINISHED';
    if (!paid) {
      return res.json({ settled: false, tradeStatus: trade.trade_status || trade.sub_msg || trade.msg, order });
    }

    const result = settlePaidOrder(order.order_no, trade.trade_no);
    return res.json({ settled: true, alreadyPaid: result.alreadyPaid, order: result.order, tradeStatus: trade.trade_status });
  } catch (error) {
    console.error('Settle payment order error:', error);
    return res.status(500).json({ error: 'Failed to settle order' });
  }
});

router.get('/query/:orderNo', requireAuth, (req, res) => {
  try {
    const order = orderOps.findByOrderNo(req.params.orderNo);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'No permission for this order' });
    }
    return res.json({ order });
  } catch (error) {
    console.error('Query order error:', error);
    return res.status(500).json({ error: 'Query failed' });
  }
});

router.get('/my-orders', requireAuth, (req, res) => {
  try {
    const orders = orderOps.findByUserId(req.user.userId);
    return res.json({ orders });
  } catch (error) {
    console.error('List orders error:', error);
    return res.status(500).json({ error: 'Failed to list orders' });
  }
});

// ========== 提现申请 ==========
router.post('/withdraw', requireAuth, (req, res) => {
  try {
    const { amount, currency = 'cny', alipayId } = req.body;
    const finalAmount = validateAmount(amount);

    if (!finalAmount) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }
    if (!alipayId) {
      return res.status(400).json({ error: 'Alipay account is required' });
    }

    // 检查余额
    const user = userOps.findById(req.user.userId);
    if (!user || user.balance_cny < finalAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // 冻结余额
    userOps.freezeBalance(req.user.userId, finalAmount);

    // 创建提现记录
    const withdrawNo = `W${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    withdrawOps.create(withdrawNo, req.user.userId, finalAmount, currency, alipayId);

    return res.status(201).json({
      message: 'Withdrawal request submitted. Manual review is required before payout.',
      withdrawal: {
        withdraw_no: withdrawNo,
        amount: finalAmount,
        currency,
        alipay_id: alipayId,
        status: 'pending_review'
      }
    });
  } catch (error) {
    console.error('Withdraw error:', error);
    return res.status(500).json({ error: 'Withdrawal request failed' });
  }
});

// ========== 我的提现记录 ==========
router.get('/my-withdrawals', requireAuth, (req, res) => {
  try {
    const withdrawals = withdrawOps.findByUser(req.user.userId);
    return res.json({ withdrawals });
  } catch (error) {
    console.error('List withdrawals error:', error);
    return res.status(500).json({ error: 'Failed to list withdrawals' });
  }
});

// ========== 管理员：提现申请列表 ==========
router.get('/admin/withdrawals', requireAuth, (req, res) => {
  try {
    const { status } = req.query;
    const withdrawals = withdrawOps.listAll(status);
    return res.json({ withdrawals });
  } catch (error) {
    console.error('Admin list withdrawals error:', error);
    return res.status(500).json({ error: 'Failed to list withdrawals' });
  }
});

// ========== 管理员：审核提现 ==========
router.post('/admin/withdrawals/:withdrawNo/approve', requireAuth, (req, res) => {
  try {
    const withdrawal = withdrawOps.findByNo(req.params.withdrawNo);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }
    if (withdrawal.status !== 'pending_review') {
      return res.status(400).json({ error: 'Withdrawal is not in pending_review status' });
    }

    withdrawOps.approve(withdrawal.withdraw_no, req.user.userId);
    // 扣减冻结余额
    userOps.unfreezeBalance(withdrawal.user_id, withdrawal.amount);

    // 通知用户：提现已审核通过
    notificationOps.create(
      withdrawal.user_id,
      'withdraw_approved',
      '提现审核通过',
      `你的提现申请 ¥${withdrawal.amount} 已审核通过，等待打款`,
      'dashboard.html'
    );

    return res.json({ message: 'Withdrawal approved. Please process payout manually.', withdrawal: { ...withdrawal, status: 'approved' } });
  } catch (error) {
    console.error('Approve withdrawal error:', error);
    return res.status(500).json({ error: 'Failed to approve withdrawal' });
  }
});

// ========== 管理员：拒绝提现 ==========
router.post('/admin/withdrawals/:withdrawNo/reject', requireAuth, (req, res) => {
  try {
    const { reason } = req.body;
    const withdrawal = withdrawOps.findByNo(req.params.withdrawNo);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }
    if (withdrawal.status !== 'pending_review') {
      return res.status(400).json({ error: 'Withdrawal is not in pending_review status' });
    }

    withdrawOps.reject(withdrawal.withdraw_no, req.user.userId, reason || 'Rejected by admin');
    // 退还冻结余额
    userOps.updateBalance(withdrawal.user_id, withdrawal.amount, 'cny');
    userOps.unfreezeBalance(withdrawal.user_id, -withdrawal.amount); // 减少冻结

    // 通知用户：提现被拒绝
    notificationOps.create(
      withdrawal.user_id,
      'withdraw_rejected',
      '提现被拒绝',
      `你的提现申请 ¥${withdrawal.amount} 被拒绝${reason ? '：' + reason : ''}，余额已退还`,
      'dashboard.html'
    );

    return res.json({ message: 'Withdrawal rejected. Balance refunded.', withdrawal: { ...withdrawal, status: 'rejected' } });
  } catch (error) {
    console.error('Reject withdrawal error:', error);
    return res.status(500).json({ error: 'Failed to reject withdrawal' });
  }
});

// ========== 管理员：标记已打款 ==========
router.post('/admin/withdrawals/:withdrawNo/paid', requireAuth, (req, res) => {
  try {
    const withdrawal = withdrawOps.findByNo(req.params.withdrawNo);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }
    if (withdrawal.status !== 'approved') {
      return res.status(400).json({ error: 'Withdrawal must be approved before marking as paid' });
    }

    withdrawOps.markPaid(withdrawal.withdraw_no);

    // 通知用户：已打款
    notificationOps.create(
      withdrawal.user_id,
      'withdraw_paid',
      '提现已打款',
      `你的提现申请 ¥${withdrawal.amount} 已打款到支付宝，请查收`,
      'dashboard.html'
    );

    return res.json({ message: 'Withdrawal marked as paid.', withdrawal: { ...withdrawal, status: 'paid' } });
  } catch (error) {
    console.error('Mark paid withdrawal error:', error);
    return res.status(500).json({ error: 'Failed to mark as paid' });
  }
});

module.exports = router;
