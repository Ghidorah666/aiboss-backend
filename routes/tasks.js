const express = require('express');
const router = express.Router();
const { taskOps, recordOps, userOps } = require('../models/db');
const { requireAuth } = require('./auth');

router.get('/', (req, res) => {
  try {
    const { category, publisher_type, status, limit, offset } = req.query;
    const tasks = taskOps.list({
      category,
      publisher_type,
      status: status || 'active',
      limit: Number.parseInt(limit, 10) || 50,
      offset: Number.parseInt(offset, 10) || 0
    });

    res.json({ tasks, total: tasks.length });
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

router.get('/my/accepted', requireAuth, (req, res) => {
  try {
    const records = recordOps.findByWorker(req.user.userId);
    res.json({ records });
  } catch (error) {
    console.error('List accepted tasks error:', error);
    res.status(500).json({ error: 'Failed to list accepted tasks' });
  }
});

router.get('/my/published', requireAuth, (req, res) => {
  try {
    const tasks = taskOps.list({
      publisher_id: req.user.userId,
      status: null,
      limit: 100,
      offset: 0
    });
    res.json({ tasks });
  } catch (error) {
    console.error('List published tasks error:', error);
    res.status(500).json({ error: 'Failed to list published tasks' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const task = taskOps.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    return res.json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    return res.status(500).json({ error: 'Failed to get task' });
  }
});

router.post('/', requireAuth, (req, res) => {
  try {
    const { title, description, category, location, reward, currency, callback_url, publisher_type } = req.body;
    const finalReward = Number.parseFloat(reward);

    if (!title || !category || !Number.isFinite(finalReward) || finalReward <= 0) {
      return res.status(400).json({ error: 'Title, category and a positive reward are required' });
    }

    const fee = Number.parseFloat((finalReward * 0.05).toFixed(2));
    const total = Number.parseFloat((finalReward + fee).toFixed(2));
    const result = taskOps.create({
      title,
      description,
      category,
      publisher_type: publisher_type === 'ai' ? 'ai' : 'human',
      publisher_id: Number.parseInt(req.user.userId, 10),
      location,
      reward: finalReward,
      currency: currency || 'cny',
      callback_url
    });

    return res.status(201).json({
      message: 'Task created. Please pay to activate it.',
      task: {
        id: result.lastInsertRowid,
        title,
        reward: finalReward,
        fee,
        total,
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('Create task error:', error);
    return res.status(500).json({ error: `Failed to create task: ${error.message}` });
  }
});

router.post('/:id/accept', requireAuth, (req, res) => {
  try {
    const taskId = Number.parseInt(req.params.id, 10);
    const workerId = req.user.userId;
    const task = taskOps.findById(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.status !== 'active') {
      return res.status(400).json({ error: 'Task is not active' });
    }

    const existing = recordOps.findByWorker(workerId).find(record => record.task_id === taskId);
    if (existing) {
      return res.status(400).json({ error: 'You have already accepted this task' });
    }

    const result = recordOps.accept(taskId, workerId);
    return res.status(201).json({
      message: 'Task accepted',
      record: { id: result.lastInsertRowid, task_id: taskId }
    });
  } catch (error) {
    console.error('Accept task error:', error);
    return res.status(500).json({ error: 'Failed to accept task' });
  }
});

router.post('/:id/complete', requireAuth, (req, res) => {
  try {
    const taskId = Number.parseInt(req.params.id, 10);
    const { proof, notes } = req.body;
    const records = recordOps.findByWorker(req.user.userId);
    const record = records.find(item => item.task_id === taskId);

    if (!record) {
      return res.status(404).json({ error: 'You have not accepted this task' });
    }
    if (record.status === 'completed') {
      return res.status(400).json({ error: 'Task already completed' });
    }

    recordOps.complete(record.id, proof, notes);
    return res.json({ message: 'Completion submitted, waiting for publisher review' });
  } catch (error) {
    console.error('Complete task error:', error);
    return res.status(500).json({ error: 'Failed to submit completion' });
  }
});

// 确认完成（发布者操作，触发打款）
router.post('/:id/confirm', requireAuth, (req, res) => {
  try {
    const taskId = Number.parseInt(req.params.id, 10);
    const task = taskOps.findById(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.publisher_id !== req.user.userId) {
      return res.status(403).json({ error: 'Only the publisher can confirm completion' });
    }

    // 找到已提交完成的接单记录
    const records = recordOps.findByTask(taskId);
    const completedRecord = records.find(r => r.status === 'completed');

    if (!completedRecord) {
      return res.status(400).json({ error: 'No completion submission to confirm' });
    }

    // 更新任务状态为已完成
    taskOps.updateStatus(taskId, 'completed');

    // 给接单者打款（增加余额）
    userOps.updateBalance(completedRecord.worker_id, task.reward, task.currency || 'cny');

    return res.json({
      message: `Task confirmed. Worker paid ¥${task.reward}`,
      reward: task.reward,
      worker_id: completedRecord.worker_id
    });
  } catch (error) {
    console.error('Confirm task error:', error);
    return res.status(500).json({ error: 'Failed to confirm task' });
  }
});

module.exports = router;
