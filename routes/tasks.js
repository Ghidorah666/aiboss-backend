const express = require('express');
const router = express.Router();
const { taskOps, recordOps, userOps, orderOps } = require('../models/db');
const { requireAuth } = require('./auth');

// ========== 任务列表 ==========
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

// ========== 我接的任务 ==========
router.get('/my/accepted', requireAuth, (req, res) => {
  try {
    const records = recordOps.findByWorker(req.user.userId);
    res.json({ records });
  } catch (error) {
    console.error('List accepted tasks error:', error);
    res.status(500).json({ error: 'Failed to list accepted tasks' });
  }
});

// ========== 我发布的任务 ==========
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

// ========== 任务详情 ==========
router.get('/:id', (req, res) => {
  try {
    const task = taskOps.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    // 获取接单记录
    const records = recordOps.findByTask(task.id);
    return res.json({ task, records });
  } catch (error) {
    console.error('Get task error:', error);
    return res.status(500).json({ error: 'Failed to get task' });
  }
});

// ========== 发布任务 ==========
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

// ========== 接单 ==========
router.post('/:id/accept', requireAuth, (req, res) => {
  try {
    const taskId = Number.parseInt(req.params.id, 10);
    const workerId = req.user.userId;
    const task = taskOps.findById(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.status !== 'active') {
      return res.status(400).json({ error: 'Task is not available for acceptance' });
    }
    if (task.publisher_id === workerId) {
      return res.status(400).json({ error: 'Cannot accept your own task' });
    }

    // 检查是否已接单
    const existing = recordOps.findByTaskAndWorker(taskId, workerId);
    if (existing) {
      return res.status(400).json({ error: 'You have already accepted this task' });
    }

    // 检查接单人数限制
    if (task.accepted_count >= task.max_workers) {
      return res.status(400).json({ error: 'Task has reached maximum workers' });
    }

    const result = recordOps.accept(taskId, workerId);
    taskOps.incrementAcceptedCount(taskId);

    return res.status(201).json({
      message: 'Task accepted successfully',
      record: { id: result.lastInsertRowid, task_id: taskId, status: 'accepted' }
    });
  } catch (error) {
    console.error('Accept task error:', error);
    return res.status(500).json({ error: 'Failed to accept task' });
  }
});

// ========== 提交完成证明 ==========
router.post('/:id/complete', requireAuth, (req, res) => {
  try {
    const taskId = Number.parseInt(req.params.id, 10);
    const { proof, notes } = req.body;

    if (!proof || !proof.trim()) {
      return res.status(400).json({ error: 'Completion proof is required' });
    }

    const record = recordOps.findByTaskAndWorker(taskId, req.user.userId);

    if (!record) {
      return res.status(404).json({ error: 'You have not accepted this task' });
    }
    if (record.status === 'submitted' || record.status === 'completed') {
      return res.status(400).json({ error: 'Already submitted or completed' });
    }

    recordOps.complete(record.id, proof, notes);

    // 更新任务状态为submitted
    taskOps.updateStatus(taskId, 'submitted');

    return res.json({ message: 'Completion proof submitted, waiting for publisher review' });
  } catch (error) {
    console.error('Complete task error:', error);
    return res.status(500).json({ error: 'Failed to submit completion' });
  }
});

// ========== 审核通过（发布者操作，触发打款）==========
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
    const submittedRecord = records.find(r => r.status === 'submitted');

    if (!submittedRecord) {
      return res.status(400).json({ error: 'No completion submission to confirm' });
    }

    // 更新接单记录为已完成
    recordOps.updateStatus(submittedRecord.id, 'completed');

    // 更新任务状态为已完成
    taskOps.updateStatus(taskId, 'completed');

    // 给接单者打款（增加余额）
    userOps.updateBalance(submittedRecord.worker_id, task.reward, task.currency || 'cny');

    return res.json({
      message: `Task confirmed. Worker paid ¥${task.reward}`,
      reward: task.reward,
      worker_id: submittedRecord.worker_id
    });
  } catch (error) {
    console.error('Confirm task error:', error);
    return res.status(500).json({ error: 'Failed to confirm task' });
  }
});

// ========== 审核拒绝（发布者操作）==========
router.post('/:id/reject', requireAuth, (req, res) => {
  try {
    const taskId = Number.parseInt(req.params.id, 10);
    const { reason } = req.body;
    const task = taskOps.findById(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.publisher_id !== req.user.userId) {
      return res.status(403).json({ error: 'Only the publisher can reject' });
    }

    const records = recordOps.findByTask(taskId);
    const submittedRecord = records.find(r => r.status === 'submitted');

    if (!submittedRecord) {
      return res.status(400).json({ error: 'No submission to reject' });
    }

    // 拒绝接单记录，工作者可以重新提交
    recordOps.updateStatus(submittedRecord.id, 'rejected');

    // 任务恢复为active，等工作者重新提交
    taskOps.updateStatus(taskId, 'accepted');

    return res.json({
      message: 'Submission rejected. Worker can re-submit.',
      reason: reason || 'No reason provided'
    });
  } catch (error) {
    console.error('Reject task error:', error);
    return res.status(500).json({ error: 'Failed to reject submission' });
  }
});

module.exports = router;
