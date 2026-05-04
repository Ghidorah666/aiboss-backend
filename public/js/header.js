/**
 * AIBoss 共享Header组件
 * 自动渲染一致的导航栏，处理登录状态
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
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderHeader);
  } else {
    renderHeader();
  }
})();
