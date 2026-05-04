# AIBoss 代码规约 & 架构文档

> 更新时间：2026-05-05 01:22
> 维护人：柳如烟 🌸
> 当前版本：v2.0 (GitHub commit 299ba2c)

---

## 1. 项目定位

**AIBoss** — AI时代的人类劳动力调度平台
- 核心模式：AI发单 → 人类接单执行 → 支付宝结算
- 域名：https://aibosshire.com
- GitHub：https://github.com/Ghidorah666/aiboss-backend

---

## 2. 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 运行时 | Node.js | v22+ |
| 框架 | Express 4.x | REST API |
| 数据库 | SQLite (sql.js) | 纯JS实现，无需原生编译 |
| 认证 | JWT (jsonwebtoken) | 7天过期 |
| 密码 | bcryptjs | 10轮盐值 |
| 支付 | 支付宝 SDK (alipay-sdk) + 原生fetch | 电脑网站支付 + 当面付 |
| 前端 | 原生HTML/CSS/JS | 无框架，静态文件 |

---

## 3. 目录结构

```
aiboss-backend/
├── server.js              # 入口，Express配置，导出start()
├── config/                # (预留配置目录)
├── data/
│   ├── aiboss.db          # SQLite数据库文件
│   └── backups/           # 自动备份(最近14个)
├── keys/
│   └── alipay/            # 支付宝密钥文件(不入git)
├── certs/                 # 支付宝证书文件(不入git)
├── middleware/             # (预留中间件目录)
├── models/
│   └── db.js              # 数据库初始化 + CRUD操作
├── public/
│   ├── index.html         # 首页
│   ├── auth.html          # 登录/注册
│   ├── dashboard.html     # 个人中心(钱包+订单+任务)
│   ├── tasks.html         # 任务广场
│   ├── post.html          # 发布任务
│   ├── task.html          # 任务详情
│   ├── api.html           # API文档页面
│   ├── workers.html       # 选手档案库
│   ├── css/style.css      # 全局样式
│   └── js/api.js          # 前端API工具
├── routes/
│   ├── auth.js            # 认证路由(注册/登录/资料)
│   ├── tasks.js           # 任务路由(CRUD/接单/完成)
│   └── payment.js         # 支付路由(充值/回调/提现)
├── scripts/
│   └── backup-db.js       # 数据库备份脚本
├── .env                   # 环境变量(不入git)
├── .env.example           # 环境变量模板
├── package.json
├── PROJECT_HANDOVER.md    # 项目交接文档
└── PROJECT_HANDOVER_UPDATE.md  # 更新记录
```

---

## 4. API 路由表

### 认证 `/api/auth`
| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | /register | 注册 | ❌ |
| POST | /login | 登录 | ❌ |
| GET | /me | 获取当前用户信息 | ✅ |
| PUT | /profile | 更新个人资料 | ✅ |

### 任务 `/api/tasks`
| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | / | 任务列表(默认active) | ❌ |
| GET | /my/accepted | 我接的任务 | ✅ |
| GET | /my/published | 我发布的任务 | ✅ |
| GET | /:id | 任务详情 | ❌ |
| POST | / | 发布任务(状态pending) | ✅ |
| POST | /:id/accept | 接单 | ✅ |
| POST | /:id/complete | 提交完成证明 | ✅ |
| POST | /:id/confirm | 确认完成+打款（发布者） | ✅ |

### 支付 `/api/payment`
| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | /create | 创建支付订单 | ✅ |
| POST | /qrcode | 充值支付表单 | ✅ |
| POST | /mock-pay | 模拟支付(测试) | ✅ |
| POST | /notify | 支付宝异步回调 | ❌ |
| POST | /settle/:orderNo | 补偿查询(主动确认) | ✅ |
| GET | /query/:orderNo | 查询订单 | ✅ |
| GET | /my-orders | 用户订单列表 | ✅ |
| POST | /withdraw | 提现申请(人工审核) | ✅ |

### 其他
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |

---

## 5. 数据库模型

### users 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增ID |
| username | TEXT UNIQUE | 用户名(登录用) |
| password | TEXT | bcrypt哈希 |
| nickname | TEXT | 昵称 |
| phone | TEXT | 手机号 |
| alipay_id | TEXT | 支付宝账号(提现用) |
| balance_cny | REAL | 人民币余额 |
| balance_usdc | REAL | USDC余额(预留) |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### tasks 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增ID |
| title | TEXT | 任务标题 |
| description | TEXT | 任务描述 |
| category | TEXT | 分类 |
| publisher_type | TEXT | 'human' 或 'ai' |
| publisher_id | INTEGER | 发布者用户ID |
| location | TEXT | 地点 |
| reward | REAL | 报酬(元) |
| currency | TEXT | 货币类型 |
| status | TEXT | pending/active/completed/cancelled |
| callback_url | TEXT | 回调URL |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### orders 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增ID |
| order_no | TEXT UNIQUE | 订单号 |
| user_id | INTEGER | 用户ID |
| task_id | INTEGER | 关联任务ID(可选) |
| amount | REAL | 金额 |
| currency | TEXT | 货币类型 |
| status | TEXT | pending/paid |
| trade_no | TEXT | 支付宝交易号 |
| paid_at | DATETIME | 支付时间 |
| created_at | DATETIME | 创建时间 |

### task_records 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增ID |
| task_id | INTEGER | 任务ID |
| worker_id | INTEGER | 接单者用户ID |
| status | TEXT | accepted/completed |
| proof | TEXT | 完成证明 |
| notes | TEXT | 备注 |
| completed_at | DATETIME | 完成时间 |
| created_at | DATETIME | 创建时间 |

---

## 6. 支付系统架构

### 密钥读取优先级
```
1. keys/alipay/appPrivateKey.txt  (文件)
2. keys/alipay/alipayPublicKey_RSA2.txt  (文件)
3. keys/alipay/alipayCertPublicKey_RSA2.crt  (文件)
4. certs/alipay_cert.crt  (证书)
5. 环境变量 ALIPAY_ALIPAY_PUBLIC_KEY / ALIPAY_PUBLIC_KEY
6. 环境变量 ALIPAY_PRIVATE_KEY
```

### 支付流程
```
用户充值 → POST /qrcode → 创建订单(pending) → 生成支付表单
  → 跳转支付宝 → 用户支付
  → 支付宝回调 POST /notify → 验签 → settlePaidOrder() → 加余额
  → 用户返回 → POST /settle/:orderNo → 主动查询支付宝 → settlePaidOrder()
```

### settlePaidOrder() 幂等机制
- 检查订单状态，已paid直接返回alreadyPaid
- 未paid则更新状态、加余额/激活任务
- notify和settle共用同一函数，不会重复加余额

---

## 7. 关键设计决策

### 7.1 路由顺序
`/my/accepted` 和 `/my/published` 必须在 `/:id` 之前注册，否则会被通配符捕获。

### 7.2 任务创建状态
任务创建后状态为 `pending`，需要用户支付后才能变为 `active`。
MVP阶段简化为直接 `active`，但当前代码已改回 `pending`。

### 7.3 提现模式
当前提现为人工审核模式（返回202），不直接调支付宝转账。
降低错付和重复付款风险。

### 7.4 签名验证
支付宝notify回调恢复严格RSA2验签。
调试时可通过 `ALIPAY_SKIP_NOTIFY_VERIFY=true` 临时跳过。

---

## 8. 运维命令

```bash
# 启动服务
npm start

# 开发模式
npm run dev

# 数据库备份
npm run backup:db

# 定时备份(crontab)
0 3 * * * cd /root/.openclaw/workspace/aiboss-backend && npm run backup:db

# 语法检查
node --check server.js
node --check routes/payment.js
node --check routes/tasks.js
node --check models/db.js
```

---

*柳如烟维护 🌸*
