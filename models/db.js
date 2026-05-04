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
  
  // 创建表
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
      trade_no TEXT,
      paid_at DATETIME,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 索引
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)`);

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
  if (!fs.existsSync(DB_PATH)) {
    return null;
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `aiboss-${stamp}.db`);
  fs.copyFileSync(DB_PATH, backupPath);
  return backupPath;
}

function getDB() {
  return db;
}

// 用户操作
const userOps = {
  create: (username, passwordHash) => {
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, passwordHash]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDB();
    return { lastInsertRowid: result[0]?.values[0]?.[0] };
  },
  
  findByUsername: (username) => {
    const result = db.exec('SELECT * FROM users WHERE username = ?', [username]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const columns = result[0].columns;
    const values = result[0].values[0];
    return columns.reduce((obj, col, i) => ({ ...obj, [col]: values[i] }), {});
  },
  
  findById: (id) => {
    const result = db.exec(
      'SELECT id, username, nickname, phone, alipay_id, balance_cny, balance_usdc, created_at FROM users WHERE id = ?',
      [id]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    const columns = result[0].columns;
    const values = result[0].values[0];
    return columns.reduce((obj, col, i) => ({ ...obj, [col]: values[i] }), {});
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
  }
};

// 任务操作
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
    if (result.length === 0 || result[0].values.length === 0) return null;
    const columns = result[0].columns;
    const values = result[0].values[0];
    return columns.reduce((obj, col, i) => ({ ...obj, [col]: values[i] }), {});
  },
  
  list: (filters = {}) => {
    let sql = 'SELECT t.*, u.username as publisher_name FROM tasks t JOIN users u ON t.publisher_id = u.id WHERE 1=1';
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
    if (result.length === 0) return [];
    
    const columns = result[0].columns;
    return result[0].values.map(row => 
      columns.reduce((obj, col, i) => ({ ...obj, [col]: row[i] }), {})
    );
  },
  
  updateStatus: (id, status) => {
    db.run('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
    saveDB();
  }
};

// 订单操作
const orderOps = {
  create: (orderNo, userId, amount, currency, taskId = null) => {
    db.run('INSERT INTO orders (order_no, user_id, task_id, amount, currency) VALUES (?, ?, ?, ?, ?)', [orderNo, userId, taskId, amount, currency]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDB();
    return { lastInsertRowid: result[0]?.values[0]?.[0] };
  },
  
  findByOrderNo: (orderNo) => {
    const result = db.exec('SELECT * FROM orders WHERE order_no = ?', [orderNo]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const columns = result[0].columns;
    const values = result[0].values[0];
    return columns.reduce((obj, col, i) => ({ ...obj, [col]: values[i] }), {});
  },
  
  findByUserId: (userId) => {
    const result = db.exec('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    if (result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => 
      columns.reduce((obj, col, i) => ({ ...obj, [col]: row[i] }), {})
    );
  },
  
  updateStatus: (orderNo, status, tradeNo) => {
    db.run('UPDATE orders SET status = ?, trade_no = ?, paid_at = CURRENT_TIMESTAMP WHERE order_no = ?', [status, tradeNo, orderNo]);
    saveDB();
  }
};

// 任务接单记录
const recordOps = {
  accept: (taskId, workerId) => {
    db.run('INSERT INTO task_records (task_id, worker_id) VALUES (?, ?)', [taskId, workerId]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDB();
    return { lastInsertRowid: result[0]?.values[0]?.[0] };
  },
  
  findByWorker: (workerId) => {
    const result = db.exec(`
      SELECT tr.*, t.title, t.reward, t.currency, t.location 
      FROM task_records tr 
      JOIN tasks t ON tr.task_id = t.id 
      WHERE tr.worker_id = ? 
      ORDER BY tr.created_at DESC
    `, [workerId]);
    if (result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => 
      columns.reduce((obj, col, i) => ({ ...obj, [col]: row[i] }), {})
    );
  },
  
  complete: (id, proof, notes) => {
    db.run('UPDATE task_records SET status = ?, proof = ?, notes = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', ['completed', proof, notes, id]);
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
  recordOps
};
