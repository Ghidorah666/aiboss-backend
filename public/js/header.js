/**
 * AIBoss 共享Header组件
 * 自动渲染一致的导航栏，处理登录状态 + 通知铃铛
 */
(function() {
  'use strict';

  const NAV_ITEMS = [
    { href: 'index.html', label: '首页', i18n: 'nav_home' },
    { href: 'tasks.html', label: '任务广场', i18n: 'nav_tasks' },
    { href: 'post.html', label: '发布任务', i18n: 'nav_post' },
    { href: 'api.html', label: 'API文档', i18n: 'nav_api' },
  ];

  function getCurrentPage() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    return path || 'index.html';
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  }

  function renderHeader() {
    const currentPage = getCurrentPage();
    const user = AIBossAPI.getUser();
    const loggedIn = AIBossAPI.isLoggedIn();

    const navLinks = NAV_ITEMS.map(item => {
      const isActive = item.href === currentPage ? ' class="active"' : '';
      return `<li><a href="${item.href}"${isActive} data-i18n="${item.i18n}">${item.label}</a></li>`;
    }).join('');

    let authHtml = '';
    if (loggedIn && user) {
      const displayName = user.nickname || user.username;
      authHtml = `
        <div class="header-notification" id="notification-bell">
          <button class="notification-trigger" onclick="toggleNotifPanel()" title="通知">
            🔔
            <span class="notification-badge" id="notif-badge" style="display:none;">0</span>
          </button>
          <div class="notification-panel" id="notif-panel" style="display:none;">
            <div class="notif-header">
              <strong>通知</strong>
              <button class="notif-mark-all" onclick="markAllRead()">全部已读</button>
            </div>
            <div class="notif-list" id="notif-list">
              <p class="notif-empty">加载中...</p>
            </div>
            <div class="notif-footer">
              <a href="notifications.html">查看全部通知</a>
            </div>
          </div>
        </div>
        <a href="dashboard.html" class="btn btn-outline btn-sm" style="text-decoration:none;">👤 ${escapeHtml(displayName)}</a>
        <button class="btn btn-secondary btn-sm" id="header-logout-btn">退出</button>
      `;
    } else {
      authHtml = `
        <a href="auth.html" class="btn btn-outline btn-sm">登录</a>
        <a href="auth.html" class="btn btn-primary btn-sm">注册</a>
      `;
    }

    const headerEl = document.querySelector('.header');
    if (!headerEl) return;

    headerEl.innerHTML = `
      <div class="header-inner">
        <a href="index.html" class="logo">
          <div class="logo-icon">AI</div>
          <span>AIBoss</span>
        </a>
        <nav class="nav">
          <ul class="nav-links">${navLinks}</ul>
          <div class="header-actions">
            <div class="lang-switch">
              <button class="lang-btn active" data-lang="cn">中文</button>
              <button class="lang-btn" data-lang="en">EN</button>
            </div>
            ${authHtml}
          </div>
        </nav>
      </div>
    `;

    // 绑定退出按钮
    const logoutBtn = document.getElementById('header-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        AIBossAPI.auth.logout();
      });
    }

    // 加载通知
    if (loggedIn) {
      loadNotifications();
    }
  }

  // ========== 通知系统 ==========
  let notifPanelOpen = false;

  async function loadNotifications() {
    try {
      const data = await AIBossAPI.notifications.list(20);
      const unreadCount = data.unreadCount || 0;
      const notifications = data.notifications || [];

      // 更新badge
      const badge = document.getElementById('notif-badge');
      if (badge) {
        if (unreadCount > 0) {
          badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      }

      // 渲染列表
      renderNotifList(notifications);
    } catch (err) {
      console.error('Load notifications error:', err);
    }
  }

  function renderNotifList(notifications) {
    const list = document.getElementById('notif-list');
    if (!list) return;

    if (!notifications.length) {
      list.innerHTML = '<p class="notif-empty">暂无通知</p>';
      return;
    }

    const typeIcons = {
      'task_accepted': '🤝',
      'task_submitted': '📤',
      'task_confirmed': '✅',
      'task_rejected': '❌',
      'withdraw_approved': '✅',
      'withdraw_rejected': '❌',
      'withdraw_paid': '💰'
    };

    list.innerHTML = notifications.slice(0, 10).map(n => {
      const icon = typeIcons[n.type] || '📌';
      const unreadClass = n.is_read ? '' : ' unread';
      return `
        <div class="notif-item${unreadClass}" onclick="clickNotif(${n.id}, '${escapeHtml(n.link || '')}')">
          <span class="notif-icon">${icon}</span>
          <div class="notif-content">
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-body">${escapeHtml(n.body || '')}</div>
            <div class="notif-time">${timeAgo(n.created_at)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  window.toggleNotifPanel = function() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    notifPanelOpen = !notifPanelOpen;
    panel.style.display = notifPanelOpen ? 'block' : 'none';
    if (notifPanelOpen) loadNotifications();
  };

  window.clickNotif = async function(id, link) {
    try {
      await AIBossAPI.notifications.markRead(id);
    } catch(e) {}
    if (link) {
      window.location.href = link;
    }
  };

  window.markAllRead = async function() {
    try {
      await AIBossAPI.notifications.markAllRead();
      loadNotifications();
    } catch(e) {}
  };

  // 点击外部关闭通知面板
  document.addEventListener('click', (e) => {
    if (notifPanelOpen && !e.target.closest('#notification-bell')) {
      notifPanelOpen = false;
      const panel = document.getElementById('notif-panel');
      if (panel) panel.style.display = 'none';
    }
  });

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderHeader);
  } else {
    renderHeader();
  }
})();
