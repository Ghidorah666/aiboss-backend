const express = require('express');
const router = express.Router();
const { taskOps, recordOps, userOps } = require('../models/db');
const { requireAuth } = require('./auth');

// 获取任务列表
router.get('/', (req, res) => {
  try {
    const { category, publisher_type, status, limit, offset } = req.query;
    
    const tasks = taskOps.list({
      category,
      publisher_type,
      status: status || 'active',
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.json({ tasks, total: tasks.length });
  } catch (error) {
    console.error('获取任务列表错误:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取单个任务
router.get('/:id', (req, res) => {
  try {
    const task = taskOps.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    res.json({ task });
  } catch (error) {
    console.error('获取任务错误:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 发布任务（需登录）
router.post('/', requireAuth, (req, res) => {
  try {
    const { title, description, category, location, reward, currency, callback_url } = req.body;

    if (!title || !category || !reward) {
      return res.status(400).json({ error: '标题、分类、报酬不能为空' });
    }

    // 计算平台费用
    const fee = parseFloat(reward) * 0.05;
    const total = parseFloat(reward) + fee;

    console.log('创建任务:', { title, description, category, publisher_id: parseInt(req.user.userId), location, reward: parseFloat(reward), currency });

    // 创建任务（待支付状态）
    const result = taskOps.create({
      title,
      description,
      category,
      publisher_type: 'human',
      publisher_id: parseInt(req.user.userId),
      location,
      reward: parseFloat(reward),
      currency: currency || 'cny',
      callback_url
    });

    console.log('创建结果:', result);

    res.status(201).json({
      message: '任务创建成功，请先支付',
      task: {
        id: result.lastInsertRowid,
        title,
        reward,
        fee,
        total
      }
    });
  } catch (error) {
    console.error('发布任务错误:', error);
    res.status(500).json({ error: '发布失败: ' + error.message });
  }
});

// 接单（需登录）
router.post('/:id/accept', requireAuth, (req, res) => {
  try {
    const taskId = req.params.id;
    const workerId = req.user.userId;

    const task = taskOps.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (task.status !== 'active') {
      return res.status(400).json({ error: '任务已关闭' });
    }

    // 防止重复接单
    const existing = recordOps.findByWorker(workerId).find(r => r.task_id === parseInt(taskId));
    if (existing) {
      return res.status(400).json({ error: '您已接取过此任务' });
    }

    // 创建接单记录
    const result = recordOps.accept(taskId, workerId);

    res.status(201).json({
      message: '接单成功',
      record: { id: result.lastInsertRowid, task_id: taskId }
    });
  } catch (error) {
    console.error('接单错误:', error);
    res.status(500).json({ error: '接单失败' });
  }
});

// 完成任务的证明提交（需登录）
router.post('/:id/complete', requireAuth, (req, res) => {
  try {
    const taskId = req.params.id;
    const { proof, notes } = req.body;

    // 找到接单记录
    const records = recordOps.findByWorker(req.user.userId);
    const record = records.find(r => r.task_id === parseInt(taskId));

    if (!record) {
      return res.status(404).json({ error: '您未接取此任务' });
    }

    if (record.status === 'completed') {
      return res.status(400).json({ error: '任务已完成' });
    }

    // 更新记录
    recordOps.complete(record.id, proof, notes);

    // TODO: 通知发布者确认

    res.json({ message: '已提交完成申请，等待发布者确认' });
  } catch (error) {
    console.error('完成任务错误:', error);
    res.status(500).json({ error: '提交失败' });
  }
});

// 获取我接的任务
router.get('/my/accepted', requireAuth, (req, res) => {
  try {
    const records = recordOps.findByWorker(req.user.userId);
    res.json({ records });
  } catch (error) {
    console.error('获取接单记录错误:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取我发布的任务
router.get('/my/published', requireAuth, (req, res) => {
  try {
    const tasks = taskOps.list({ publisher_id: req.user.userId });
    res.json({ tasks });
  } catch (error) {
    console.error('获取发布任务错误:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

module.exports = router;