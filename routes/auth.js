const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { userOps } = require('../models/db');

const JWT_SECRET = process.env.JWT_SECRET || 'aiboss-mvp-secret-key-2026';
const JWT_EXPIRES = '7d';

// 注册（无验证码MVP版）
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname, phone } = req.body;

    // 验证必填字段
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    // 密码长度检查
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }

    // 检查用户名是否存在
    const existing = userOps.findByUsername(username);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    // 密码加密
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户
    const result = userOps.create(username, passwordHash);
    const userId = result.lastInsertRowid;

    // 生成JWT
    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.status(201).json({
      message: '注册成功',
      token,
      user: {
        id: userId,
        username,
        nickname: nickname || username,
        phone: phone || null
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    // 查找用户
    const user = userOps.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 验证密码
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 生成JWT
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        phone: user.phone,
        alipay_id: user.alipay_id
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

// 获取用户信息
router.get('/me', requireAuth, (req, res) => {
  const user = userOps.findById(req.user.userId);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ user });
});

// 更新个人资料
router.put('/profile', requireAuth, (req, res) => {
  try {
    const { nickname, phone, alipay_id } = req.body;
    userOps.updateProfile(req.user.userId, { nickname, phone, alipay_id });
    const user = userOps.findById(req.user.userId);
    res.json({ message: '更新成功', user });
  } catch (error) {
    console.error('更新资料错误:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 中间件：验证JWT
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: '登录已过期' });
  }
}

module.exports = router;
module.exports.requireAuth = requireAuth;