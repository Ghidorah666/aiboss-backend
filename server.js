require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const paymentRoutes = require('./routes/payment');
const { initDB } = require('./models/db');

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化数据库
initDB().then(() => {
  console.log('✅ 数据库初始化完成');
}).catch(err => {
  console.error('❌ 数据库初始化失败:', err);
  process.exit(1);
});

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务（前端页面）
app.use(express.static(path.join(__dirname, 'public')));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/payment', paymentRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 前端路由 - 所有非API请求都返回index.html
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║         AIBoss 后端服务已启动              ║
╠═══════════════════════════════════════════╣
║  本地:  http://localhost:${PORT}              ║
║  API:   http://localhost:${PORT}/api         ║
╚═══════════════════════════════════════════╝
  `);
});