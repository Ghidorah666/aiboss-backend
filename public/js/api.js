/**
 * AIBoss API 客户端
 */
const API_BASE = '/api';

// 存储token
const AUTH_TOKEN_KEY = 'aiboss_token';
const AUTH_USER_KEY = 'aiboss_user';

// 获取token
function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

// 获取用户信息
function getUser() {
  const userStr = localStorage.getItem(AUTH_USER_KEY);
  return userStr ? JSON.parse(userStr) : null;
}

// 保存登录信息
function saveAuth(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

// 清除登录信息
function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

// 检查是否已登录
function isLoggedIn() {
  return !!getToken();
}

// API请求封装
async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = getToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };
  
  try {
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || '请求失败');
    }
    
    return data;
  } catch (error) {
    console.error('API请求错误:', error);
    throw error;
  }
}

// 认证API
const authAPI = {
  // 注册
  async register(username, password, nickname, phone) {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, nickname, phone })
    });
    if (data.token && data.user) {
      saveAuth(data.token, data.user);
    }
    return data;
  },
  
  // 登录
  async login(username, password) {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (data.token && data.user) {
      saveAuth(data.token, data.user);
    }
    return data;
  },
  
  // 获取当前用户
  async getMe() {
    return api('/auth/me');
  },
  
  // 更新资料
  async updateProfile(data) {
    return api('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },
  
  // 退出登录
  logout() {
    clearAuth();
    window.location.href = 'auth.html';
  }
};

// 任务API
const taskAPI = {
  // 获取任务列表
  async list(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return api(`/tasks${query ? '?' + query : ''}`);
  },
  
  // 获取单个任务
  async get(id) {
    return api(`/tasks/${id}`);
  },
  
  // 发布任务
  async create(taskData) {
    return api('/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData)
    });
  },
  
  // 接单
  async accept(taskId) {
    return api(`/tasks/${taskId}/accept`, { method: 'POST' });
  },
  
  // 完成任务
  async complete(taskId, proof, notes) {
    return api(`/tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ proof, notes })
    });
  },
  
  // 获取我接的任务
  async getMyAccepted() {
    return api('/tasks/my/accepted');
  },
  
  // 获取我发布的任务
  async getMyPublished() {
    return api('/tasks/my/published');
  },
  
  // 审核通过（发布者确认+打款）
  async confirm(taskId) {
    return api(`/tasks/${taskId}/confirm`, { method: 'POST' });
  },
  
  // 审核拒绝（发布者操作）
  async reject(taskId, reason) {
    return api(`/tasks/${taskId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }
};

// 支付API
const paymentAPI = {
  // 创建支付订单
  async create(orderData) {
    return api('/payment/create', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });
  },
  
  // 模拟支付（测试用）
  async mockPay(orderNo) {
    return api('/payment/mock-pay', {
      method: 'POST',
      body: JSON.stringify({ orderNo })
    });
  },
  
  // 查询订单
  async query(orderNo) {
    return api(`/payment/query/${orderNo}`);
  },
  
  // 获取我的订单
  async getMyOrders() {
    return api('/payment/my-orders');
  },
  
  // 提现申请
  async withdraw(amount, currency, alipayId) {
    return api('/payment/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, currency, alipayId })
    });
  },
  
  // 我的提现记录
  async getMyWithdrawals() {
    return api('/payment/my-withdrawals');
  }
};

// 页面初始化：检查登录状态
function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = 'auth.html?redirect=' + encodeURIComponent(window.location.href);
    return false;
  }
  return true;
}

// 更新header登录状态
function updateAuthUI() {
  const user = getUser();
  const loggedIn = isLoggedIn();
  
  document.querySelectorAll('.header-actions').forEach(container => {
    const loginBtn = container.querySelector('a[href="auth.html"]');
    const registerBtn = container.querySelectorAll('a[href="auth.html"]')[1];
    
    if (loggedIn && user) {
      if (loginBtn) loginBtn.textContent = user.nickname || user.username;
      if (registerBtn) registerBtn.textContent = '退出';
      if (registerBtn) registerBtn.href = '#';
      if (registerBtn) registerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        authAPI.logout();
      });
    }
  });
}

// 导出到全局
window.AIBossAPI = {
  auth: authAPI,
  tasks: taskAPI,
  payment: paymentAPI,
  isLoggedIn,
  getUser,
  requireAuth,
  updateAuthUI
};