# AIBoss 项目交接文档

> 更新时间：2026-05-04 16:29
> 负责人：柳如烟 🌸

---

## 1. 项目概述

**AIBoss** - AI时代的人类劳动力调度平台
- **定位**：AI发单，人类接单执行，支付宝结算
- **域名**：https://aibosshire.com
- **GitHub**：https://github.com/Ghidorah666/aiboss-backend
- **技术栈**：Node.js + Express + sql.js + nginx + 支付宝当面付/电脑网站支付

---

## 2. 核心账号

### 服务器
| 项目 | 内容 |
|------|------|
| 服务器 | 腾讯云CVM（VM-0-15-ubuntu） |
| SSH | 直接在服务器上操作，已安装OpenClaw |
| 项目路径 | /root/.openclaw/workspace/aiboss-backend/ |

### GitHub
| 项目 | 内容 |
|------|------|
| 账号 | Ghidorah666 |
| 仓库 | https://github.com/Ghidorah666/aiboss-backend |
| 权限 | AI已获得直接协作授权 |

### 数据库
| 项目 | 内容 |
|------|------|
| 路径 | /root/.openclaw/workspace/aiboss-backend/data/aiboss.db |
| 类型 | SQLite（sql.js） |

### 支付宝
| 项目 | 内容 |
|------|------|
| APP ID | 2021006145693622 |
| 密钥类型 | RSA2（公钥模式） |
| 网关 | https://openapi.alipay.com/gateway.do |
| 应用网关 | https://aibosshire.com/api/payment/notify |
| 沙箱 | 已关闭（生产环境） |

---

## 3. 环境变量（.env）

```env
PORT=3000
JWT_SECRET=464ec3bed156061f1777e78331886fd8c8d8bf2be400b016610cab992a9d8ad0
ALIPAY_APP_ID=2021006145693622
ALIPAY_PRIVATE_KEY=MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCPJifsSG9aG8A86p50wU8h3ZFGNJm60y6nm84BusM2UN88ztqBW87INTlaK4AMgbuY+T5Gl4LG6qkKPz+ngi6UJMrUYf0THfVg8XeFNaYV1s+Q/PpKjydYk52DOrKI2zkdI1ygkonV9OTei9vyTPx2cHcDMCqgcP/O+Vcks3mizD7d33TexN6qxn4M7sdPA10dEeqgZoLBGB21NIicPBl9oaySJM55OcVpM8kufUjJWFSfNkaI71Xp1Mp4i3/SdDUsQWr8BlIR9dONavvE/NDVVmoZEU7F3gcpz1g8Kz4BiD1sMcvzmra9bENZcYtl43ngimv7SRezhqa2c9lEPwCLAgMBAAECggEAYOkj/gLL3+UJsDPmMoTsXbDyuOTDboep/i6suN8Haa42c6RWqVzOERx3R2RLvCvYJSgX0RKhpqkW56kKHw0zG3gNGNt9yYNuq8LNd5Fqbz6OJ0oc6H0h1gWZjU4fsCc581ANVWffiMnSaBenP9J+2HArIi1prlTR2f1T0bTvlBZI4dROUCKANXuSPrbD4YSQHNGofdjLSZjUmfXexbsyfixnVaQqEDfz3Io8psxDRRptKm2X6LJNfabNMbAxq81Vw1bD8OEiArQBbz1STRV83VR349yRa7NhMdIPjNy1Sr2DU1gvVBelGkl1cI7MEIERNU7Gy4NmVYhHlA5HQhO6AQKBgQDt46FEplheIOgVkjq1ghyNFD1Da70af+iD/gPgJsDjGZEYs8kxVOQ1Z7cd8aS2WmCkUSMqL6aepsBzg1jpPU3qRY6xNJbRN98dlm3Xkmtq/Y0EDDL0Sbx5JamaSXMVWM5kcSsxnPol1P46MPGJf3oNjvWBV7cChxYbwDFnGooqmwKBgQCaDBOg6oCIhjNL/Fv7gPeDT0J7W22f0RZQxIQQV8oY+rxCPznrT4cdOkYl1MBTjnYm/7nq1GDeIOWQVMM7fLDaozuvTYuk1YfHBmnKrjruFtUvcRneXFiAmZe/bnK5ALCI18kyCiWi/cOGSOElcmI2XiMcJ564P9WmCFH7h/4o0QKBgB+yIJ6g+00vXTziiuf8OgmiFLeS91M8j6JmieWnxDN+CJMeAUSNZwqmkwNuWt/hEtdR6DmKt8yTsziw23vYKzV3pxd9RksCArxSergqTh2nQs6zQWbDHFWX6w0flDHX70f6vCKUI9A+nNDsDIKhdYWw8o0VPtEbZpqz9OEj7BzZAoGAEKRNWoz65cTZtdPFfB4qnxzo6bqu1R0ZdBBG1B0n0BsGS4HZF/q3dgjdmyiovl4dlYj65Mucy2Jyam09yidmU7heskmGVIBc8rtWonbAFwiQb1egm80OIpZ1NlEQQ7w3VhE5wxYlir4vaUpmSE1bHtR8poYBN5Zt1kn/0VSXuIECgYEA6JmZjNJPXt4gWmI+ruJsq5zirLxDcRHVQB5l4iGQR38zCUTP9+2bReSo9OaSwm+td2Js0kdO6XgvtCQnjehagreqaQzUHQQQaOYgXUq5y0ApYcm89MERIf+Fb5BXVx9GqogROqe3IrYHT+quyauA3ySr/3dN+MDdh+JrKLkDqyQ=
ALIPAY_PUBLIC_KEY=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjyYn7EhvWhvAPOqedMFPId2RRjSZutMup5vOAbrDNlDfPM7agVvOyDU5WiuADIG7mPk+RpeCxuqpCj8/p4IulCTK1GH9Ex31YPF3hTWmFdbPkPz6So8nWJOdgzqyiNs5HSNcoJKJ1fTk3ovb8kz8dnB3AzAqoHD/zvlXJLN5osw+3d903sTeqsZ+DO7HTwNdHRHqoGaCwRgdtTSInDwZfaGskiTOeTnFaTPJLn1IyVhUnzZGiO9V6dTKeIt/0nQ1LEFq/AZSEfXTjWr7xPzQ1VZqGRFOxd4HKc9YPCs+AYg9bDHL85q2vWxDXGLZeN54Ipr+0kXs4amtnPZRD8AiwIDAQAB
ALIPAY_NOTIFY_URL=https://aibosshire.com/api/payment/notify
ALIPAY_SANDBOX=false
```

---

## 4. 密钥文件（已整理）

| 文件 | 用途 |
|------|------|
| `keys/alipay/appPrivateKey.txt` | 应用私钥 |
| `keys/alipay/appPublicKey.txt` | 应用公钥 |
| `keys/alipay/alipayPublicKey_RSA2.txt` | 支付宝公钥 |
| `keys/alipay/alipayCertPublicKey_RSA2.crt` | 支付宝证书 |
| `keys/alipay/appCertPublicKey.crt` | 应用证书 |
| `keys/alipay/alipayRootCert.crt` | 根证书 |
| `certs/app_cert.crt` | 应用证书（代码引用） |
| `certs/alipay_cert.crt` | 支付宝证书（代码引用） |
| `certs/alipay_root_cert.crt` | 根证书（代码引用） |

---

## 5. 当前状态

### 支付系统
- **支付链路**：✅ 正常（跳转支付宝扫码支付可成功）
- **异步回调**：⚠️ 补偿机制已实现（主动查支付宝确认状态）
  - 原因：支付宝notify回调始终未到达服务器
  - 解决方案：`/api/payment/settle/:orderNo` 主动查询接口 + 前端跳转回来时自动调用

### 已修复BUG
| 编号 | 问题 | 状态 | 备注 |
|------|------|------|------|
| BUG-017 | 充值returnUrl为空 | ✅ 已修复 | 改为https://aibosshire.com/dashboard.html |
| BUG-018 | 充值跳转成功但余额未增加 | ✅ 已修复 | 已实现补偿机制 |

### 待优化项
- [ ] 支付回调签名验证恢复（目前临时跳过）
- [ ] 交易记录页面（前端缺失）
- [ ] 数据库自动备份
- [ ] 移动端适配

---

## 6. 关键路由

| 路由 | 方法 | 说明 |
|------|------|------|
| /api/payment/qrcode | POST | 生成充值支付表单 |
| /api/payment/notify | POST | 支付宝异步回调 |
| /api/payment/settle/:orderNo | POST | 订单状态补偿查询 |
| /api/payment/my-orders | GET | 用户订单列表 |
| /api/payment/withdraw | POST | 提现申请 |

---

## 7. 项目MD文档

| 文件 | 说明 |
|------|------|
| SPEC.md | 代码规约、框架结构、模块链路 |
| KNOWLEDGE.md | 问题解决记录、技术细节、踩坑记录 |
| REFLECTION.md | 思考方式、经验沉淀、决策复盘 |
| BUGLIST.md | BUG追踪表 |
| PRD.md | 产品需求文档 |

---

*如烟维护 🌸*
