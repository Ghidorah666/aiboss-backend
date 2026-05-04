# AIBoss Project Handover Update

Updated: 2026-05-05

## Completed

- Restored strict Alipay notify signature verification by default.
- Added `ALIPAY_SKIP_NOTIFY_VERIFY=true` as an explicit temporary debugging escape hatch.
- Prefer Alipay public key files before env vars to avoid accidentally verifying notify payloads with the app public key.
- Added `POST /api/payment/qrcode` for the recharge payment form route documented in the handover.
- Added `POST /api/payment/settle/:orderNo` for active Alipay trade status compensation queries.
- Made payment settlement idempotent: repeated notify calls or repeated settle queries do not add balance twice.
- Recharge orders now credit user balance after payment; task orders activate the related task after payment.
- Added `POST /api/payment/withdraw` as a manual-review withdrawal request endpoint.
- Fixed `/api/tasks/my/accepted` and `/api/tasks/my/published` route ordering so they are not captured by `/:id`.
- Rebuilt the dashboard transaction records view with order number, amount, status, time and compensation query action.
- Added dashboard recharge and withdrawal entry points.
- Added responsive dashboard styles for mobile layouts.
- Added database backup script: `npm run backup:db`, writing to `data/backups` and keeping the latest 14 backups by default.
- Refactored `server.js` to export `start()` for smoke tests while preserving normal `node server.js` startup.

## Verification

- `node --check server.js`
- `node --check routes/payment.js`
- `node --check routes/tasks.js`
- `node --check models/db.js`
- `node --check scripts/backup-db.js`
- Started Express on a random local port and requested `/api/health`; returned `status: ok`.
- Ran `npm run backup:db`; database backup was created successfully.

## Production Notes

- Confirm production `ALIPAY_PUBLIC_KEY` or `ALIPAY_ALIPAY_PUBLIC_KEY` contains the Alipay public key, not the app public key.
- Suggested server cron:

```bash
0 3 * * * cd /root/.openclaw/workspace/aiboss-backend && npm run backup:db
```

- If Alipay notify still does not arrive, continue checking nginx proxy rules, HTTPS certificate status, Alipay application gateway settings and public access logs.
