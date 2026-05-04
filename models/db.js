const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'aiboss.db');
const BACKUP_DIR = process.env.DB_BACKUP_DIR || path.join(__dirname, '..', 'data', 'backups');

// 确保data目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;
let SQL = null;

async function initDB() {
  if (!SQL) {
    SQL = await initSqlJs();
  }

  // 尝试加载已有数据库
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // ========== 核心表 ==========
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT,
      phone TEXT,
      alipay_id TEXT,
      balance_cny REAL DEFAULT 0,
      balance_usdc REAL DEFAULT 0,
      role TEXT DEFAULT 'user',
      frozen_balance_cny REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      publisher_type TEXT NOT NULL,
      publisher_id INTEGER NOT NULL,
      location TEXT,
      reward REAL NOT NULL,
      currency TEXT DEFAULT 'cny',
      status TEXT DEFAULT 'pending',
      callback_url TEXT,
      proof_schema TEXT,
      deadline_at DATETIME,
      accepted_at DATETIME,
      submitted_at DATETIME,
      completed_at DATETIME,
      max_workers INTEGER DEFAULT 1,
      accepted_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      task_id INTEGER,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'cny',
      status TEXT DEFAULT 'pending',
      order_type TEXT DEFAULT 'recharge',
      provider TEXT DEFAULT 'alipay',
      trade_no TEXT,
      paid_at DATETIME,
      settled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS task_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      worker_id INTEGER NOT NULL,
      status TEXT DEFAULT 'accepted',
      proof TEXT,
      notes TEXT,
      completed_at DATETIME,
      rejected_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      withdraw_no TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'cny',
      alipay_id TEXT,
      status TEXT DEFAULT 'pending_review',
      reviewed_by INTEGER,
      reviewed_at DATETIME,
      paid_at DATETIME,
      fail_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ========== 索引 ==========
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_publisher ON tasks(publisher_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_task ON orders(task_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_no ON orders(order_no)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_task_records_task ON task_records(task_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_task_records_worker ON task_records(worker_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read)`);

  // 安全地添加新列（如果不存在则添加，已存在则忽略）
  const migrations = [
    ['tasks', 'proof_schema', 'TEXT'],
    ['tasks', 'deadline_at', 'DATETIME'],
    ['tasks', 'accepted_at', 'DATETIME'],
    ['tasks', 'submitted_at', 'DATETIME'],
    ['tasks', 'completed_at', 'DATETIME'],
    ['tasks', 'max_workers', 'INTEGER DEFAULT 1'],
    ['tasks', 'accepted_count', 'INTEGER DEFAULT 0'],
    ['orders', 'order_type', "TEXT DEFAULT 'recharge'"],
    ['orders', 'provider', "TEXT DEFAULT 'alipay'"],
    ['orders', 'settled_at', 'DATETIME'],
    ['task_records', 'rejected_at', 'DATETIME'],
    ['users', 'role', "TEXT DEFAULT 'user'"],
    ['users', 'frozen_balance_cny', 'REAL DEFAULT 0']
  ];
  for (const [table, col, type] of migrations) {
    try { db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch(e) {}
  }

  // 保存到文件
  saveDB();
  console.log('✅ 数据库初始化完成');
  return db;
}

function saveDB() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function backupDB() {
  if (!fs.existsSync(DB_PATH)) return null;
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `aiboss-${stamp}.db`);
  fs.copyFileSync(DB_PATH, backupPath);
  return backupPath;
}

function getDB() {
  return db;
}

// ========== 通用辅助 ==========
function rowToObject(result) {
  if (result.length === 0 || result[0].values.length === 0) return null;
  const columns = result[0].columns;
  const values = result[0].values[0];
  return columns.reduce((obj, col, i) => ({ ...obj, [col]: values[i] }), {});
}

function rowsToArray(result) {
  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(row =>
    columns.reduce((obj, col, i) => ({ ...obj, [col]: row[i] }), {})
  );
}

// ========== 用户操作 ==========
const userOps = {
  create: (username, passwordHash) => {
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, passwordHash]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDB();
    return { lastInsertRowid: result[0]?.values[0]?.[0] };
  },

  findByUsername: (username) => {
    const result = db.exec('SELECT * FROM users WHERE username = ?', [username]);
    return rowToObject(result);
  },

  findById: (id) => {
    const result = db.exec(
      'SELECT id, username, nickname, phone, alipay_id, balance_cny, balance_usdc, role, frozen_balance_cny, created_at FROM users WHERE id = ?',
      [id]
    );
    return rowToObject(result);
  },

  updateProfile: (id, data) => {
    db.run('UPDATE users SET nickname = ?, phone = ?, alipay_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [data.nickname, data.phone, data.alipay_id, id]);
    saveDB();
  },

  updateBalance: (id, amount, currency) => {
    const col = currency === 'usdc' ? 'balance_usdc' : 'balance_cny';
    db.run(`UPDATE users SET ${col} = ${col} + ? WHERE id = ?`, [amount, id]);
    saveDB();
  },

  freezeBalance: (id, amount) => {
    db.run('UPDATE users SET balance_cny = balance_cny - ?, frozen_balance_cny = frozen_balance_cny + ? WHERE id = ?', [amount, amount, id]);
    saveDB();
  },

  unfreezeBalance: (id, amount) => {
    db.run('UPDATE users SET frozen_balance_cny = frozen_balance_cny - ? WHERE id = ?', [amount, id]);
    saveDB();
  }
};

// ========== 任务操作 ==========
const taskOps = {
  create: (data) => {
    const currency = data.currency || 'cny';
    db.run(`
      INSERT INTO tasks (title, description, category, publisher_type, publisher_id, location, reward, currency, callback_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [data.title, data.description, data.category, data.publisher_type, data.publisher_id, data.location || null, data.reward, currency, data.callback_url || null]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDB();
    return { lastInsertRowid: result[0]?.values[0]?.[0] };
  },

  findById: (id) => {
    const result = db.exec('SELECT * FROM tasks WHERE id = ?', [id]);
    return rowToObject(result);
  },

  list: (filters = {}) => {
    let sql = 'SELECT t.*, u.username as publisher_name FROM tasks t LEFT JOIN users u ON t.publisher_id = u.id WHERE 1=1';
    const params = [];

    if (filters.status) {
      sql += ' AND t.status = ?';
      params.push(filters.status);
    }
    if (filters.category) {
      sql += ' AND t.category = ?';
      params.push(filters.category);
    }
    if (filters.publisher_type) {
      sql += ' AND t.publisher_type = ?';
      params.push(filters.publisher_type);
    }
    if (filters.publisher_id) {
      sql += ' AND t.publisher_id = ?';
      params.push(filters.publisher_id);
    }

    sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(filters.limit || 50, filters.offset || 0);

    const result = db.exec(sql, params);
    return rowsToArray(result);
  },

  updateStatus: (id, status) => {
    const timestampField = {
      'active': 'accepted_at',
      'accepted': 'accepted_at',
      'submitted': 'submitted_at',
      'completed': 'completed_at'
    }[status];
    if (timestampField) {
      db.run(`UPDATE tasks SET status = ?, ${timestampField} = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, id]);
    } else {
      db.run('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
    }
    saveDB();
  },

  incrementAcceptedCount: (id) => {
    db.run('UPDATE tasks SET accepted_count = accepted_count + 1, accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    saveDB();
  }
};

// ========== 订单操作 ==========
const orderOps = {
  create: (orderNo, userId, amount, currency, taskId = null, orderType = 'recharge') => {
    db.run('INSERT INTO orders (order_no, user_id, task_id, amount, currency, order_type) VALUES (?, ?, ?, ?, ?, ?)',
      [orderNo, userId, taskId, amount, currency, orderType]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDB();
    return { lastInsertRowid: result[0]?.values[0]?.[0] };
  },

  findByOrderNo: (orderNo) => {
    const result = db.exec('SELECT * FROM orders WHERE order_no = ?', [orderNo]);
    return rowToObject(result);
  },

  findByUserId: (userId) => {
    const result = db.exec('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    return rowsToArray(result);
  },

  updateStatus: (orderNo, status, tradeNo) => {
    db.run('UPDATE orders SET status = ?, trade_no = ?, paid_at = CURRENT_TIMESTAMP WHERE order_no = ?', [status, tradeNo, orderNo]);
    saveDB();
  },

  markSettled: (orderNo) => {
    db.run('UPDATE orders SET settled_at = CURRENT_TIMESTAMP WHERE order_no = ?', [orderNo]);
    saveDB();
  }
};

// ========== 任务接单记录 ==========
const recordOps = {
  accept: (taskId, workerId) => {
    db.run('INSERT INTO task_records (task_id, worker_id) VALUES (?, ?)', [taskId, workerId]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDB();
    return { lastInsertRowid: result[0]?.values[0]?.[0] };
  },

  findById: (id) => {
    const result = db.exec('SELECT * FROM task_records WHERE id = ?', [id]);
    return rowToObject(result);
  },

  findByWorker: (workerId) => {
    const result = db.exec(`
      SELECT tr.*, t.title, t.reward, t.currency, t.location, t.status as task_status
      FROM task_records tr
      JOIN tasks t ON tr.task_id = t.id
      WHERE tr.worker_id = ?
      ORDER BY tr.created_at DESC
    `, [workerId]);
    return rowsToArray(result);
  },

  findByTask: (taskId) => {
    const result = db.exec(`
      SELECT tr.*, u.username as worker_name
      FROM task_records tr
      LEFT JOIN users u ON tr.worker_id = u.id
      WHERE tr.task_id = ?
      ORDER BY tr.created_at DESC
    `, [taskId]);
    return rowsToArray(result);
  },

  findByTaskAndWorker: (taskId, workerId) => {
    const result = db.exec('SELECT * FROM task_records WHERE task_id = ? AND worker_id = ?', [taskId, workerId]);
    return rowToObject(result);
  },

  complete: (id, proof, notes) => {
    db.run('UPDATE task_records SET status = ?, proof = ?, notes = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['submitted', proof, notes, id]);
    saveDB();
  },

  updateStatus: (id, status) => {
    const ts = status === 'rejected' ? ', rejected_at = CURRENT_TIMESTAMP' : '';
    db.run(`UPDATE task_records SET status = ?${ts} WHERE id = ?`, [status, id]);
    saveDB();
  }
};

// ========== 提现操作 ==========
const withdrawOps = {
  create: (withdrawNo, userId, amount, currency, alipayId) => {
    db.run('INSERT INTO withdrawals (withdraw_no, user_id, amount, currency, alipay_id) VALUES (?, ?, ?, ?, ?)',
      [withdrawNo, userId, amount, currency, alipayId]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDB();
    return { lastInsertRowid: result[0]?.values[0]?.[0] };
  },

  findByNo: (withdrawNo) => {
    const result = db.exec('SELECT * FROM withdrawals WHERE withdraw_no = ?', [withdrawNo]);
    return rowToObject(result);
  },

  findByUser: (userId) => {
    const result = db.exec('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    return rowsToArray(result);
  },

  listAll: (status = null) => {
    let sql = 'SELECT w.*, u.username FROM withdrawals w LEFT JOIN users u ON w.user_id = u.id WHERE 1=1';
    const params = [];
    if (status) {
      sql += ' AND w.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY w.created_at DESC LIMIT 100';
    const result = db.exec(sql, params);
    return rowsToArray(result);
  },

  approve: (withdrawNo, reviewedBy) => {
    db.run('UPDATE withdrawals SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE withdraw_no = ?',
      ['approved', reviewedBy, withdrawNo]);
    saveDB();
  },

  reject: (withdrawNo, reviewedBy, reason) => {
    db.run('UPDATE withdrawals SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, fail_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE withdraw_no = ?',
      ['rejected', reviewedBy, reason, withdrawNo]);
    saveDB();
  },

  markPaid: (withdrawNo) => {
    db.run('UPDATE withdrawals SET status = ?, paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE withdraw_no = ?',
      ['paid', withdrawNo]);
    saveDB();
  }
};

// ========== 通知操作 ==========
const notificationOps = {
  create: (userId, type, title, body, link) => {
    db.run('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)',
      [userId, type, title, body || null, link || null]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDB();
    return { lastInsertRowid: result[0]?.values[0]?.[0] };
  },

  findByUser: (userId, limit = 50) => {
    const result = db.exec('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]);
    return rowsToArray(result);
  },

  findUnread: (userId) => {
    const result = db.exec('SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC', [userId]);
    return rowsToArray(result);
  },

  countUnread: (userId) => {
    const result = db.exec('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
    return result[0]?.values[0]?.[0] || 0;
  },

  markRead: (id) => {
    db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
    saveDB();
  },

  markAllRead: (userId) => {
    db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);
    saveDB();
  }
};

module.exports = {
  initDB,
  getDB,
  saveDB,
  backupDB,
  userOps,
  taskOps,
  orderOps,
  recordOps,
  withdrawOps,
  notificationOps
};
