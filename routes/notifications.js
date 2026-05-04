const express = require('express');
const router = express.Router();
const { notificationOps } = require('../models/db');
const { requireAuth } = require('./auth');

// ========== 我的通知列表 ==========
router.get('/', requireAuth, (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit, 10) || 50;
    const notifications = notificationOps.findByUser(req.user.userId, limit);
    const unreadCount = notificationOps.countUnread(req.user.userId);
    return res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('List notifications error:', error);
    return res.status(500).json({ error: 'Failed to list notifications' });
  }
});

// ========== 未读数量 ==========
router.get('/unread-count', requireAuth, (req, res) => {
  try {
    const count = notificationOps.countUnread(req.user.userId);
    return res.json({ count });
  } catch (error) {
    console.error('Count unread error:', error);
    return res.status(500).json({ error: 'Failed to count unread' });
  }
});

// ========== 标记单条已读 ==========
router.post('/:id/read', requireAuth, (req, res) => {
  try {
    notificationOps.markRead(Number.parseInt(req.params.id, 10));
    return res.json({ ok: true });
  } catch (error) {
    console.error('Mark read error:', error);
    return res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ========== 全部标记已读 ==========
router.post('/read-all', requireAuth, (req, res) => {
  try {
    notificationOps.markAllRead(req.user.userId);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Mark all read error:', error);
    return res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

module.exports = router;
