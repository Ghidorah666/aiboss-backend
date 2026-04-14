# AIBoss - AI任务平台后端

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v22+-green.svg" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-4.18-blue.svg" alt="Express">
  <img src="https://img.shields.io/badge/SQLite-sql.js-orange.svg" alt="SQLite">
</p>

## 🚀 快速开始

### 方式一：GitHub Codespaces（推荐，5分钟搞定）

1. 点击本仓库的 **Code** → **Codespaces** → **New codespace**
2. 等待环境创建完成（约3分钟）
3. 自动安装依赖并启动服务
4. 点击 "Open in Browser" 预览

> 🎉 无需本地安装任何东西，浏览器里直接跑！

### 方式二：本地运行

```bash
# 克隆项目
git clone https://github.com/Ghidorah666/aiboss-backend.git
cd aiboss-backend

# 安装依赖
npm install

# 启动服务
npm start

# 访问 http://localhost:3000
```

## 📁 项目结构

```
aiboss-backend/
├── server.js           # Express 入口
├── package.json        # 依赖配置
├── .env.example         # 环境变量模板
├── models/
│   └── db.js          # SQLite 数据库
├── routes/
│   ├── auth.js        # 认证 API
│   ├── tasks.js       # 任务 API
│   └── payment.js     # 支付 API
└── public/             # 前端页面
```

## 🔧 环境变量配置

复制 `.env.example` 为 `.env` 并填写：

```bash
cp .env.example .env
```

| 变量 | 说明 | 必填 |
|------|------|------|
| `PORT` | 服务端口 | ✅ 默认3000 |
| `JWT_SECRET` | JWT密钥 | ✅ |
| `ALIPAY_APP_ID` | 支付宝App ID | ❌ |
| `ALIPAY_PRIVATE_KEY` | 支付宝私钥 | ❌ |
| `ALIPAY_PUBLIC_KEY` | 支付宝公钥 | ❌ |
| `ALIPAY_NOTIFY_URL` | 支付回调地址 | ❌ |
| `ALIPAY_SANDBOX` | 沙箱环境 | ❌ |

## 💰 支付宝配置

1. 登录 [支付宝开放平台](https://open.alipay.com/)
2. 创建应用 → 开通 **当面付**
3. 生成 RSA2 密钥对
4. 填入 `.env` 对应字段
5. 沙箱测试：设置 `ALIPAY_SANDBOX=true`

## 🔌 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth/register` | 用户注册 |
| `POST` | `/api/auth/login` | 用户登录 |
| `GET` | `/api/auth/me` | 获取当前用户 |
| `GET` | `/api/tasks` | 获取任务列表 |
| `POST` | `/api/tasks` | 发布任务（需登录） |
| `POST` | `/api/tasks/:id/accept` | 接单（需登录） |
| `POST` | `/api/payment/create` | 创建支付订单 |
| `POST` | `/api/payment/mock-pay` | 模拟支付（测试用） |
| `POST` | `/api/payment/notify` | 支付宝回调 |

## 🧪 测试支付（无需配置支付宝）

```bash
# 注册用户
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"123456"}'

# 创建任务
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"title":"测试任务","category":"signin","reward":10}'

# 模拟支付
curl -X POST http://localhost:3000/api/payment/mock-pay \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"orderNo":"AIBxxx"}'
```

## 📱 前端页面

| 页面 | 地址 |
|------|------|
| 首页 | `/index.html` |
| 任务广场 | `/tasks.html` |
| 发布任务 | `/post.html` |
| 登录/注册 | `/auth.html` |
| 个人中心 | `/dashboard.html` |
| API文档 | `/api.html` |

## 🛠️ 开发

```bash
# 开发模式（热重载）
npm run dev

# 运行测试
npm test
```

## 📄 License

MIT