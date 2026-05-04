const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
const dbPath = process.env.DB_PATH || path.join(projectRoot, 'data', 'aiboss.db');
const backupDir = process.env.DB_BACKUP_DIR || path.join(projectRoot, 'data', 'backups');
const keepCount = Number.parseInt(process.env.DB_BACKUP_KEEP || '14', 10);

if (!fs.existsSync(dbPath)) {
  console.error(`Database file not found: ${dbPath}`);
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `aiboss-${stamp}.db`);
fs.copyFileSync(dbPath, backupPath);

if (Number.isFinite(keepCount) && keepCount > 0) {
  const backups = fs.readdirSync(backupDir)
    .filter(name => /^aiboss-.+\.db$/.test(name))
    .map(name => ({
      name,
      path: path.join(backupDir, name),
      time: fs.statSync(path.join(backupDir, name)).mtimeMs
    }))
    .sort((a, b) => b.time - a.time);

  for (const item of backups.slice(keepCount)) {
    fs.unlinkSync(item.path);
  }
}

console.log(`Database backup created: ${backupPath}`);
