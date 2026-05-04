# AIBoss 问题解决记录 & 技术知识库

> 更新时间：2026-05-05 02:10
> 维护人：柳如烟 🌸

---

## 1. 支付宝相关

### 1.1 支付宝公钥 vs 应用公钥（BUG-018 根因）

**问题**：充值跳转成功但余额不增加
**根因**：代码中 `ALIPAY_PUBLIC_KEY` 配置的是**应用公钥**，而不是**支付宝公钥**。
- 支付宝notify回调用**支付宝私钥**签名
- 验签需要用**支付宝公钥**
- 用应用公钥验签 → 验签失败 → 回调被拒 → 余额不增加

**解决**：
1. 从支付宝开放平台下载**支付宝公钥**（不是应用公钥）
2. 更新 `.env` 中的 `ALIPAY_PUBLIC_KEY`
3. 代码改为优先从文件读取支付宝公钥

**教训**：支付宝密钥体系容易混淆，文件优先策略可减少配置错误。

---

### 1.2 notify回调地址配置

**问题**：支付宝notify回调始终不到达服务器
**排查方向**：
1. nginx反向代理配置是否正确转发POST请求
2. HTTPS证书是否有效
3. 支付宝应用网关设置是否正确
4. 服务器防火墙/安全组是否放行

**当前方案**：补偿机制（用户返回后主动查询支付宝）作为兜底。

---

### 1.3 签名验证跳过

**问题**：调试时签名验证失败导致回调被拒
**解决**：`ALIPAY_SKIP_NOTIFY_VERIFY=true` 环境变量临时跳过

**⚠️ 注意**：生产环境必须关闭此选项，否则任何人都可以伪造回调。

---

### 1.4 支付宝SDK vs 原生fetch

**决策**：支付查询（trade.query）使用原生fetch代替alipay-sdk
**原因**：
- alipay-sdk包体积大
- 原生fetch足够处理简单的查询请求
- 减少依赖，降低维护成本

**保留alipay-sdk的场景**：
- `pageExecute` 生成支付表单（需要SDK的复杂逻辑）
- `exec` 方法调用预下单等

---

## 2. 数据库相关

### 2.1 sql.js 特性

**要点**：
- sql.js是SQLite的纯JS实现，无需原生编译
- 数据库在内存中操作，需要手动 `saveDB()` 写入文件
- 不支持参数化的 `db.exec()`，需要用 `db.exec(sql, params)` 数组形式
- `last_insert_rowid()` 通过 `db.exec()` 获取

**注意**：每次写操作后必须调用 `saveDB()`，否则数据丢失。

---

### 2.2 数据库备份

**方案**：`npm run backup:db`
- 复制 `data/aiboss.db` 到 `data/backups/aiboss-{timestamp}.db`
- 保留最近14个备份
- 建议每天凌晨3点定时执行

**环境变量**：
- `DB_PATH` - 数据库路径
- `DB_BACKUP_DIR` - 备份目录
- `DB_BACKUP_KEEP` - 保留备份数量

---

## 3. 路由相关

### 3.1 Express路由顺序陷阱

**问题**：`/my/accepted` 被 `/:id` 捕获，id变为 "my"
**原因**：Express按注册顺序匹配路由，`/:id` 是通配符
**解决**：把 `/my/accepted` 和 `/my/published` 放在 `/:id` 之前

**教训**：Express路由设计时，具体路径必须在参数化路径之前。

---

### 3.2 任务创建状态

**变更**：
- 旧代码：创建后直接 `active`（MVP简化）
- 新代码：创建后 `pending`，需支付激活

**影响**：发布任务后需要走支付流程，任务才能被接单。

---

## 4. 认证相关

### 4.1 JWT密钥

**当前**：`process.env.JWT_SECRET || 'aiboss-mvp-secret-key-2026'`
**问题**：有默认值降级，如果.env未配置会使用不安全的硬编码密钥
**建议**：生产环境必须配置强随机JWT_SECRET

---

### 4.2 防暴力破解

**当前状态**：已移除（新代码简化了auth.js）
**原有机制**：
- 登录失败计数（5次锁定15分钟）
- 用户名不存在也记录（防猜用户名）
- 定时清理过期锁定

**建议**：后续重新加入防暴力破解机制。

---

## 5. 前端相关

### 5.1 支付表单跳转

**方式**：后端返回HTML表单，前端用 `window.open()` 打开
```javascript
const win = window.open('', '_blank');
win.document.write(data.payForm);
win.document.close();
```

**注意**：部分浏览器可能拦截弹窗，需要用户允许。

---

### 5.2 补偿查询触发

**方式**：用户从支付宝返回后，URL带 `out_trade_no` 参数
```javascript
const params = new URLSearchParams(window.location.search);
const orderNo = params.get('out_trade_no');
if (orderNo) await settleOrder(orderNo);
```

**清理**：查询后删除URL参数，避免重复触发。

---

## 6. Nginx & 静态文件

### 6.1 Nginx静态文件路径（重要！）

**问题**：nginx服务静态文件的路径不是项目目录
**根因**：
- nginx以 `www-data` 用户运行
- `/root/` 目录权限为700，www-data无法访问
- `root /root/.openclaw/workspace/aiboss-backend/public;` → 403 Permission denied

**正确做法**：
- nginx静态文件在 `/var/www/html/`
- 项目文件改完后需要同步到 `/var/www/html/`
- API请求（`/api/`）反向代理到 Node.js (127.0.0.1:3000)

**同步命令**：
```bash
rsync -av --delete /root/.openclaw/workspace/aiboss-backend/public/ /var/www/html/
```

**⚠️ 每次改前端文件后都必须同步到 /var/www/html/，否则线上不生效！**

---

### 6.2 前端文件架构

```
项目目录:                          线上目录:
~/aiboss-backend/public/    →    /var/www/html/
├── index.html                     ├── index.html
├── tasks.html                     ├── tasks.html
├── task.html                      ├── task.html
├── post.html                      ├── post.html
├── dashboard.html                 ├── dashboard.html
├── api.html                       ├── api.html
├── auth.html                      ├── auth.html
├── css/style.css                  ├── css/style.css
└── js/                            └── js/
    ├── api.js                         ├── api.js
    ├── header.js                      ├── header.js
    └── main.js                        └── main.js
```

## 7. 待解决技术债

| 编号 | 问题 | 优先级 | 说明 |
|------|------|--------|------|
| TD-001 | confirm端点被移除 | ✅已修复 | 2026-05-05 恢复POST /:id/confirm端点 |
| TD-002 | invitations表被移除 | 🟡中 | 邀请功能不可用 |
| TD-003 | withdrawals表被移除 | 🟡中 | 提现记录无法持久化 |
| TD-004 | 防暴力破解被移除 | 🟡中 | 登录安全风险 |
| TD-005 | JWT默认密钥 | 🟡中 | 生产环境安全风险 |
| TD-006 | 无数据库自动备份cron | 🟢低 | 需要配置系统crontab |

---

*柳如烟维护 🌸*
