export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN" id="html-root" class="theme-dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NarciPH RBAC // Cyber Control Center</title>
  <!-- 国内极速稳定 CDN 备用兜底 -->
  <script src="https://cdn.bootcdn.net/ajax/libs/vue/3.3.4/vue.global.prod.min.js"></script>
  <style>
    /* ========== 全局 CSS 重置与变量设定 ========== */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    /* 默认主题：暗黑金属朋克 (Metal Dark) */
    :root, .theme-dark {
      --bg-dark: #070913;
      --bg-card: rgba(13, 18, 36, 0.78);
      --bg-card-hover: rgba(18, 26, 51, 0.88);
      --border-cyber: rgba(0, 240, 255, 0.22);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --grid-line: rgba(0, 240, 255, 0.04);
      --table-thead: rgba(5, 7, 15, 0.9);
      --input-bg: rgba(5, 7, 15, 0.85);
      
      --cyan-neon: #00f0ff;
      --cyan-glow: rgba(0, 240, 255, 0.35);
      --purple-neon: #9d4edd;
      --purple-glow: rgba(157, 78, 221, 0.35);
      --emerald-neon: #00ff9d;
      --rose-neon: #ff0055;
      --amber-neon: #ffb703;
      
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --header-bg: rgba(7, 9, 19, 0.88);
      --pill-bg: rgba(5, 7, 15, 0.8);
      --pill-border: rgba(0, 240, 255, 0.18);
      --pill-color: #bae6fd;
      --shadow-card: 0 8px 32px rgba(0, 0, 0, 0.45);
      --orb-opacity: 1;
    }

    /* 浅白极简科技主题 (Cyber Light / Clean Slate) */
    .theme-light {
      --bg-dark: #f8fafc;
      --bg-card: rgba(255, 255, 255, 0.92);
      --bg-card-hover: #ffffff;
      --border-cyber: rgba(2, 132, 199, 0.28);
      --border-subtle: rgba(15, 23, 42, 0.08);
      --grid-line: rgba(2, 132, 199, 0.05);
      --table-thead: #f1f5f9;
      --input-bg: #ffffff;
      
      --cyan-neon: #0284c7;
      --cyan-glow: rgba(2, 132, 199, 0.25);
      --purple-neon: #7c3aed;
      --purple-glow: rgba(124, 58, 237, 0.25);
      --emerald-neon: #059669;
      --rose-neon: #e11d48;
      --amber-neon: #d97706;
      
      --text-main: #0f172a;
      --text-muted: #475569;
      --text-dim: #94a3b8;
      --header-bg: rgba(255, 255, 255, 0.92);
      --pill-bg: #f1f5f9;
      --pill-border: rgba(2, 132, 199, 0.22);
      --pill-color: #0369a1;
      --shadow-card: 0 8px 30px rgba(15, 23, 42, 0.07);
      --orb-opacity: 0.35;
    }

    [v-cloak] { display: none !important; }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
      min-height: 100vh;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      position: relative;
      overflow-x: hidden;
      transition: background-color 0.3s ease, color 0.3s ease;
    }

    /* 赛博网格几何底纹 */
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      background-size: 36px 36px;
      background-image: 
        linear-gradient(to right, var(--grid-line) 1px, transparent 1px),
        linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px);
      pointer-events: none;
      z-index: 0;
    }

    /* 深空极光光斑 */
    .glow-orb-1 {
      position: fixed;
      top: -160px;
      left: 10%;
      width: 520px;
      height: 520px;
      background: radial-gradient(circle, var(--cyan-glow) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
      opacity: var(--orb-opacity);
      transition: opacity 0.3s;
    }
    .glow-orb-2 {
      position: fixed;
      bottom: -160px;
      right: 10%;
      width: 580px;
      height: 580px;
      background: radial-gradient(circle, var(--purple-glow) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
      opacity: var(--orb-opacity);
      transition: opacity 0.3s;
    }

    /* 顶部导航条 */
    .cyber-header {
      position: sticky;
      top: 0;
      z-index: 40;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 28px;
      background: var(--header-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border-cyber);
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
      transition: background 0.3s, border-color 0.3s;
    }

    .brand-box {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brand-logo {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--cyan-neon), var(--purple-neon));
      padding: 1.5px;
      box-shadow: 0 0 16px var(--cyan-glow);
    }
    .brand-logo-inner {
      width: 100%;
      height: 100%;
      background: var(--bg-dark);
      border-radius: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 18px;
      color: var(--cyan-neon);
      font-family: ui-monospace, SFMono-Regular, monospace;
      letter-spacing: -1px;
      transition: background 0.3s;
    }

    .brand-title {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.5px;
      background: linear-gradient(90deg, var(--cyan-neon), var(--purple-neon));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .badge-online {
      font-size: 10px;
      font-family: ui-monospace, monospace;
      color: var(--cyan-neon);
      background: rgba(2, 132, 199, 0.1);
      border: 1px solid var(--border-cyber);
      padding: 2px 8px;
      border-radius: 20px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      box-shadow: 0 0 8px var(--cyan-glow);
    }

    .brand-sub {
      font-size: 11px;
      color: var(--text-dim);
      font-family: ui-monospace, monospace;
      margin-top: 2px;
    }

    /* 主题切换开关组件 */
    .theme-toggle-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 20px;
      background: var(--bg-card);
      border: 1px solid var(--border-cyber);
      color: var(--text-main);
      font-size: 12px;
      font-family: ui-monospace, monospace;
      cursor: pointer;
      transition: all 0.25s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .theme-toggle-btn:hover {
      border-color: var(--cyan-neon);
      box-shadow: 0 0 12px var(--cyan-glow);
      transform: translateY(-1px);
    }

    /* 容器布局 */
    .container {
      max-width: 1300px;
      margin: 0 auto;
      padding: 24px 20px 60px;
      position: relative;
      z-index: 10;
    }

    /* 赛博卡片面板 */
    .cyber-card {
      background: var(--bg-card);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border-cyber);
      border-radius: 16px;
      box-shadow: var(--shadow-card);
      transition: all 0.25s ease;
      position: relative;
    }
    .cyber-card:hover {
      border-color: var(--cyan-neon);
    }

    /* 统计卡片网格 */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      padding: 18px 20px;
      border-radius: 14px;
      background: var(--bg-card);
      border: 1px solid var(--border-cyber);
      box-shadow: var(--shadow-card);
      position: relative;
      overflow: hidden;
      transition: all 0.25s ease;
    }
    .stat-card:hover {
      transform: translateY(-2px);
      border-color: var(--cyan-neon);
    }
    .stat-card::after {
      content: "";
      position: absolute;
      top: 0;
      right: 0;
      width: 80px;
      height: 80px;
      background: radial-gradient(circle, var(--cyan-glow), transparent 70%);
      pointer-events: none;
    }

    .stat-label {
      font-size: 11px;
      color: var(--text-muted);
      font-family: ui-monospace, monospace;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .stat-value {
      font-size: 28px;
      font-weight: 800;
      color: var(--text-main);
      font-family: ui-monospace, monospace;
      margin-top: 4px;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .stat-value.cyan { color: var(--cyan-neon); }
    .stat-value.purple { color: var(--purple-neon); }
    .stat-value.emerald { color: var(--emerald-neon); }

    .stat-desc {
      font-size: 11px;
      color: var(--text-dim);
      font-family: ui-monospace, monospace;
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .dot-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--cyan-neon);
      box-shadow: 0 0 6px var(--cyan-neon);
    }

    /* 选项卡导航 */
    .tabs-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg-card);
      border: 1px solid var(--border-cyber);
      padding: 6px 10px;
      border-radius: 14px;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 10px;
      box-shadow: var(--shadow-card);
    }
    .tabs-nav {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tab-btn {
      padding: 9px 18px;
      font-size: 12px;
      font-family: ui-monospace, monospace;
      font-weight: 600;
      color: var(--text-muted);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .tab-btn:hover {
      color: var(--text-main);
      border-color: var(--border-subtle);
    }
    .tab-btn.active {
      color: var(--cyan-neon);
      background: rgba(2, 132, 199, 0.12);
      border-color: var(--border-cyber);
      box-shadow: 0 0 16px var(--cyan-glow);
    }

    .btn-refresh {
      padding: 8px 16px;
      font-size: 12px;
      font-family: ui-monospace, monospace;
      color: var(--cyan-neon);
      background: rgba(2, 132, 199, 0.08);
      border: 1px solid var(--border-cyber);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn-refresh:hover {
      background: rgba(2, 132, 199, 0.18);
      border-color: var(--cyan-neon);
      box-shadow: 0 0 12px var(--cyan-glow);
    }

    /* 表格区域 */
    .table-container {
      overflow-x: auto;
      border-radius: 14px;
    }
    .cyber-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }
    .cyber-table thead {
      background: var(--table-thead);
      border-bottom: 1px solid var(--border-cyber);
    }
    .cyber-table th {
      padding: 14px 18px;
      font-size: 11px;
      font-family: ui-monospace, monospace;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.8px;
      font-weight: 600;
    }
    .cyber-table tbody tr {
      border-bottom: 1px solid var(--border-subtle);
      transition: background 0.2s;
    }
    .cyber-table tbody tr:hover {
      background: rgba(2, 132, 199, 0.06);
    }
    .cyber-table td {
      padding: 14px 18px;
      color: var(--text-main);
    }

    /* 角色与状态标签样式 */
    .role-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-family: ui-monospace, monospace;
      font-weight: 600;
      border: 1px solid;
    }
    .role-badge.owner {
      background: rgba(255, 0, 85, 0.12);
      color: var(--rose-neon);
      border-color: rgba(255, 0, 85, 0.35);
    }
    .role-badge.admin {
      background: rgba(157, 78, 221, 0.15);
      color: var(--purple-neon);
      border-color: rgba(157, 78, 221, 0.4);
    }
    .role-badge.operator {
      background: rgba(2, 132, 199, 0.12);
      color: var(--cyan-neon);
      border-color: rgba(2, 132, 199, 0.35);
    }
    .role-badge.basic_user, .role-badge.basic {
      background: rgba(217, 119, 6, 0.12);
      color: var(--amber-neon);
      border-color: rgba(217, 119, 6, 0.35);
    }

    .action-btn {
      padding: 6px 12px;
      font-size: 11px;
      font-family: ui-monospace, monospace;
      border-radius: 8px;
      border: 1px solid;
      cursor: pointer;
      background: transparent;
      transition: all 0.2s;
    }
    .action-btn.cyan {
      color: var(--cyan-neon);
      border-color: var(--border-cyber);
      background: rgba(2, 132, 199, 0.08);
    }
    .action-btn.cyan:hover {
      background: rgba(2, 132, 199, 0.2);
      border-color: var(--cyan-neon);
      box-shadow: 0 0 12px var(--cyan-glow);
    }
    .action-btn.purple {
      color: var(--purple-neon);
      border-color: rgba(157, 78, 221, 0.35);
      background: rgba(157, 78, 221, 0.08);
    }
    .action-btn.purple:hover {
      background: rgba(157, 78, 221, 0.2);
      border-color: var(--purple-neon);
      box-shadow: 0 0 12px var(--purple-glow);
    }

    /* 登录表单居中卡片 */
    .login-container {
      max-width: 440px;
      margin: 70px auto 40px;
      padding: 36px 32px;
      border-radius: 20px;
      background: var(--bg-card);
      border: 1px solid var(--border-cyber);
      box-shadow: var(--shadow-card), 0 0 30px var(--cyan-glow);
      position: relative;
    }
    .login-header {
      text-align: center;
      margin-bottom: 28px;
    }
    .login-icon {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      margin: 0 auto 14px;
      background: linear-gradient(135deg, rgba(2, 132, 199, 0.2), rgba(157, 78, 221, 0.2));
      border: 1px solid var(--border-cyber);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--cyan-neon);
      font-size: 24px;
      box-shadow: 0 0 20px var(--cyan-glow);
    }

    .form-group {
      margin-bottom: 18px;
    }
    .form-label {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-family: ui-monospace, monospace;
      color: var(--text-muted);
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    .form-input {
      width: 100%;
      height: 42px;
      border-radius: 10px;
      background: var(--input-bg);
      border: 1px solid var(--border-cyber);
      padding: 0 14px;
      color: var(--text-main);
      font-family: ui-monospace, monospace;
      font-size: 13px;
      outline: none;
      transition: all 0.2s;
    }
    .form-input:focus {
      border-color: var(--cyan-neon);
      box-shadow: 0 0 16px var(--cyan-glow);
    }

    /* 按钮 */
    .btn-submit {
      width: 100%;
      height: 44px;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--cyan-neon), var(--purple-neon));
      border: none;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      font-family: ui-monospace, monospace;
      letter-spacing: 1px;
      cursor: pointer;
      box-shadow: 0 0 18px var(--cyan-glow);
      transition: all 0.25s;
      margin-top: 10px;
    }
    .btn-submit:hover {
      box-shadow: 0 0 26px var(--cyan-glow);
      transform: translateY(-1px);
    }
    .btn-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .credential-box {
      margin: 18px 0;
      padding: 14px;
      border-radius: 12px;
      background: var(--input-bg);
      border: 1px dashed var(--border-cyber);
      font-size: 12px;
      font-family: ui-monospace, monospace;
    }

    /* 弹窗遮罩 */
    .modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 50;
      background: rgba(4, 6, 12, 0.7);
      backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .modal-box {
      width: 100%;
      max-width: 520px;
      border-radius: 18px;
      background: var(--bg-card);
      border: 1px solid var(--cyan-neon);
      box-shadow: 0 0 40px var(--cyan-glow);
      padding: 24px;
      position: relative;
      transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1), max-width 0.25s cubic-bezier(0.16, 1, 0.3, 1), height 0.25s cubic-bezier(0.16, 1, 0.3, 1), max-height 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.25s ease;
    }
    .modal-box.maximized {
      width: 98vw !important;
      max-width: 98vw !important;
      height: 96vh !important;
      max-height: 96vh !important;
      border-radius: 14px !important;
      padding: 24px !important;
    }
    .modal-box.maximized .ui-tree-scroll-area {
      max-height: calc(96vh - 360px) !important;
    }
    .modal-box.maximized .raw-mode-container > div:last-child {
      max-height: calc(96vh - 360px) !important;
    }
    .modal-window-btn {
      background: var(--input-bg);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
      user-select: none;
    }
    .modal-window-btn:hover {
      background: var(--bg-card-hover);
      color: var(--cyan-neon);
      border-color: var(--border-cyber);
      transform: translateY(-1px);
    }
    .modal-window-btn.close:hover {
      color: var(--rose-neon);
      border-color: rgba(255, 0, 85, 0.4);
      background: rgba(255, 0, 85, 0.1);
    }

    /* 角色网格卡片 (Tab 2) */
    .roles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
    }
    .role-card {
      padding: 20px;
      border-radius: 14px;
      background: var(--bg-card);
      border: 1px solid var(--border-cyber);
      box-shadow: var(--shadow-card);
      transition: all 0.25s;
    }
    .role-card:hover {
      border-color: var(--cyan-neon);
    }
    .perm-pill {
      display: inline-block;
      padding: 3px 8px;
      margin: 2px 4px 2px 0;
      border-radius: 6px;
      background: var(--pill-bg);
      border: 1px solid var(--pill-border);
      color: var(--pill-color);
      font-size: 11px;
      font-family: ui-monospace, monospace;
    }

    /* ========== 权限视图模式切换器 (用户视觉模式 VS 原始模式) ========== */
    .perm-mode-switcher {
      display: flex;
      align-items: center;
      background: var(--input-bg);
      border: 1px solid var(--border-cyber);
      border-radius: 12px;
      padding: 4px;
      margin-bottom: 14px;
      gap: 6px;
    }
    .mode-tab-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .mode-tab-btn:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.04);
    }
    .mode-tab-btn.active {
      background: var(--bg-card);
      color: var(--cyan-neon);
      border: 1px solid var(--border-cyber);
      box-shadow: 0 2px 10px rgba(0, 240, 255, 0.15);
    }
    .mode-default-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(0, 240, 255, 0.15);
      color: var(--cyan-neon);
      border: 1px solid var(--border-cyber);
      font-weight: 700;
    }

    /* 视觉模式下的 Tab 快捷导航栏 */
    .ui-module-nav {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .ui-module-nav::-webkit-scrollbar {
      height: 4px;
    }
    .ui-module-nav::-webkit-scrollbar-thumb {
      background: var(--border-cyber);
      border-radius: 2px;
    }
    .ui-module-nav-btn {
      white-space: nowrap;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      background: var(--input-bg);
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ui-module-nav-btn:hover {
      border-color: var(--border-cyber);
      color: var(--text-main);
    }
    .ui-module-nav-btn.active {
      background: rgba(0, 240, 255, 0.12);
      border-color: var(--cyan-neon);
      color: var(--cyan-neon);
      box-shadow: 0 0 10px var(--cyan-glow);
    }
    .ui-nav-count {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.08);
      font-family: ui-monospace, monospace;
    }
    .ui-module-nav-btn.active .ui-nav-count {
      background: var(--cyan-neon);
      color: #000;
      font-weight: 700;
    }

    /* 视觉模块卡片与容器 */
    .ui-tree-scroll-area {
      max-height: 380px;
      overflow-y: auto;
      padding-right: 4px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ui-tab-section {
      background: var(--input-bg);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 14px;
      transition: border-color 0.2s;
    }
    .ui-tab-section:hover {
      border-color: var(--border-cyber);
    }
    .ui-tab-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px dashed var(--border-subtle);
      flex-wrap: wrap;
      gap: 8px;
    }
    .ui-tab-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 700;
      color: var(--text-main);
    }
    .ui-tab-desc {
      font-size: 11px;
      color: var(--text-dim);
      margin-top: 2px;
    }

    /* 二级 UI 分组与组件 */
    .ui-subgroup {
      margin-bottom: 12px;
    }
    .ui-subgroup:last-child {
      margin-bottom: 0;
    }
    .ui-subgroup-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--cyan-neon);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: ui-monospace, monospace;
    }
    .ui-subgroup-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 8px;
    }

    /* 单个权限控件卡片 */
    .ui-perm-card {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      cursor: pointer;
      transition: all 0.2s;
      user-select: none;
    }
    .ui-perm-card:hover {
      border-color: var(--cyan-neon);
      transform: translateY(-1px);
    }
    .ui-perm-card.checked {
      background: rgba(0, 240, 255, 0.08);
      border-color: var(--cyan-neon);
      box-shadow: 0 0 8px rgba(0, 240, 255, 0.15);
    }
    .ui-perm-card.checked.danger {
      background: rgba(255, 0, 85, 0.08);
      border-color: var(--rose-neon);
      box-shadow: 0 0 8px rgba(255, 0, 85, 0.15);
    }

    .perm-checkbox-custom {
      margin-top: 3px;
      cursor: pointer;
      accent-color: var(--cyan-neon);
      width: 16px;
      height: 16px;
    }
    .ui-position-pill {
      font-size: 10px;
      font-family: ui-monospace, monospace;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-dim);
      border: 1px solid var(--border-subtle);
    }
    .risk-tag-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 600;
    }
    .risk-tag-badge.high {
      background: rgba(255, 183, 3, 0.15);
      color: var(--amber-neon);
      border: 1px solid rgba(255, 183, 3, 0.3);
    }
    .risk-tag-badge.critical {
      background: rgba(255, 0, 85, 0.15);
      color: var(--rose-neon);
      border: 1px solid rgba(255, 0, 85, 0.3);
    }
  </style>
</head>
<body>
  <div class="glow-orb-1"></div>
  <div class="glow-orb-2"></div>

  <div id="app" v-cloak>
    <!-- 顶部导航 -->
    <header class="cyber-header">
      <div class="brand-box">
        <div class="brand-logo">
          <div class="brand-logo-inner">NX</div>
        </div>
        <div>
          <div class="brand-title">
            <span>NARCIPH // RBAC MATRIX</span>
            <span class="badge-online">CLUSTER ONLINE</span>
          </div>
          <div class="brand-sub">反指纹浏览器多租户特权控制中枢 · D1 边缘架构</div>
        </div>
      </div>

      <!-- 右侧操作区：主题切换器 + 账号态 -->
      <div style="display: flex; align-items: center; gap: 14px;">
        <!-- 主题切换按钮 -->
        <button @click="toggleTheme" class="theme-toggle-btn" :title="'当前: ' + (currentTheme === 'dark' ? '金属暗黑' : '浅白科技')">
          <span v-if="currentTheme === 'dark'">🌙 金属暗黑</span>
          <span v-else>☀️ 浅白科技</span>
        </button>

        <div v-if="adminUser" style="display: flex; align-items: center; gap: 10px;">
          <div style="background: var(--bg-card); border: 1px solid var(--border-cyber); padding: 6px 14px; border-radius: 10px; font-size: 12px; font-family: ui-monospace, monospace; display: flex; align-items: center; gap: 8px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--emerald-neon); box-shadow: 0 0 8px var(--emerald-neon);"></span>
            <span style="color: var(--text-main); font-weight: 600;">{{ adminUser.email }}</span>
            <span style="color: var(--cyan-neon); font-size: 11px;">[{{ adminUser.role_name || 'SUPER_ROOT' }}]</span>
          </div>
          <button @click="logout" style="padding: 6px 14px; border-radius: 10px; font-size: 12px; font-family: ui-monospace, monospace; color: var(--rose-neon); background: rgba(255, 0, 85, 0.1); border: 1px solid rgba(255, 0, 85, 0.3); cursor: pointer;">
            退出连接
          </button>
        </div>
      </div>
    </header>

    <div class="container">
      
      <!-- 1. 未登录形态：极客登录卡片 -->
      <div v-if="!token" class="login-container">
        <div class="login-header">
          <div class="login-icon">🔒</div>
          <h2 style="font-size: 18px; font-weight: 800; color: var(--text-main); font-family: ui-monospace, monospace; letter-spacing: 0.5px;">ADMIN AUTHORIZATION</h2>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">请输入超级所有者密钥以激活权限中枢</p>
        </div>

        <form @submit.prevent="login">
          <div class="form-group">
            <div class="form-label">
              <span>ADMINISTRATOR EMAIL</span>
              <span style="color: var(--cyan-neon);">AUTH_ID</span>
            </div>
            <input v-model="loginForm.email" type="email" required placeholder="admin@narc.com" class="form-input" />
          </div>

          <div class="form-group">
            <div class="form-label">
              <span>ENCRYPTED SECRET</span>
              <span style="color: var(--purple-neon);">PBKDF2_KEY</span>
            </div>
            <input v-model="loginForm.password" type="password" required placeholder="••••••••" class="form-input" />
          </div>

          <!-- 预置账号一键填充卡片 -->
          <div class="credential-box">
            <div style="color: var(--cyan-neon); font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
              <span>⚡ 预设超级管理员凭证</span>
              <span style="font-size: 10px; color: var(--text-dim);">OWNER_ROOT</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: var(--text-muted); font-size: 11px;">
              <span>账号：<b style="color: var(--text-main);">admin@narc.com</b></span>
              <span>密码：<b style="color: var(--text-main);">admin123456</b></span>
            </div>
            <button type="button" @click="fillDefaultAdmin" style="width: 100%; margin-top: 10px; padding: 6px; border-radius: 8px; background: rgba(2, 132, 199, 0.12); border: 1px solid var(--border-cyber); color: var(--cyan-neon); font-size: 11px; font-family: ui-monospace, monospace; cursor: pointer; font-weight: 600;">
              点击一键填入超级管理员凭据
            </button>
          </div>

          <button type="submit" :disabled="loggingIn" class="btn-submit">
            {{ loggingIn ? 'AUTHENTICATING...' : 'ESTABLISH LINK // 进入系统' }}
          </button>
        </form>
      </div>

      <!-- 2. 已登录形态：控制台仪表盘 -->
      <div v-else>
        <!-- 四大数据看板 -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">TOTAL IDENTITIES</div>
            <div class="stat-value cyan">{{ stats.usersCount }}</div>
            <div class="stat-desc">
              <span class="dot-indicator"></span> 注册用户与内部主体
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-label">TENANT WORKSPACES</div>
            <div class="stat-value purple">{{ stats.teamsCount }}</div>
            <div class="stat-desc">
              <span class="dot-indicator" style="background: var(--purple-neon); box-shadow: 0 0 6px var(--purple-neon);"></span> 隔离空间与资源池
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-label">AUDIT EVENTS</div>
            <div class="stat-value emerald">{{ stats.auditLogsCount }}</div>
            <div class="stat-desc">
              <span class="dot-indicator" style="background: var(--emerald-neon); box-shadow: 0 0 6px var(--emerald-neon);"></span> 不可篡改安全日志
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-label">DATABASE ENGINE</div>
            <div class="stat-value" style="font-size: 20px; color: var(--cyan-neon); padding-top: 6px;">CF D1 EDGE</div>
            <div class="stat-desc">
              <span class="dot-indicator" style="background: var(--cyan-neon); box-shadow: 0 0 6px var(--cyan-neon);"></span> 全球低延迟边缘副本
            </div>
          </div>
        </div>

        <!-- 选项卡切换栏 -->
        <div class="tabs-bar">
          <div class="tabs-nav">
            <button @click="currentTab = 'users'" :class="['tab-btn', currentTab === 'users' ? 'active' : '']">
              👤 用户与特权矩阵 (IDENTITIES)
            </button>
            <button @click="currentTab = 'roles'" :class="['tab-btn', currentTab === 'roles' ? 'active' : '']">
              📐 预置角色与拓扑字典 (ROLES)
            </button>
            <button @click="currentTab = 'audit'" :class="['tab-btn', currentTab === 'audit' ? 'active' : '']">
              📜 安全审计黑匣子 (AUDIT)
            </button>
          </div>

          <button @click="fetchUsers" class="btn-refresh">
            🔄 同步最新数据
          </button>
        </div>

        <!-- Tab 1: 用户列表 -->
        <div v-if="currentTab === 'users'" class="cyber-card" style="padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div>
              <h3 style="font-size: 15px; font-weight: 700; color: var(--text-main);">注册主体与权限分配矩阵</h3>
              <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">可对任意用户进行角色晋升/降级，或精准覆写 API 敏感特例</p>
            </div>
            <span style="font-size: 12px; font-family: ui-monospace, monospace; color: var(--cyan-neon);">
              共 <b style="color: var(--text-main);">{{ users.length }}</b> 个用户实体
            </span>
          </div>

          <div class="table-container">
            <table class="cyber-table">
              <thead>
                <tr>
                  <th>用户主体 / 邮箱</th>
                  <th>所属团队空间</th>
                  <th>安全角色</th>
                  <th>环境额度</th>
                  <th>并发窗口</th>
                  <th>特例覆写</th>
                  <th>状态</th>
                  <th style="text-align: right;">特权操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in users" :key="u.id">
                  <td>
                    <div style="font-weight: 600; color: var(--text-main);">{{ u.nickname }}</div>
                    <div style="font-size: 11px; font-family: ui-monospace, monospace; color: var(--cyan-neon);">{{ u.email }}</div>
                  </td>
                  <td>
                    <span style="background: var(--input-bg); border: 1px solid var(--border-subtle); padding: 3px 8px; border-radius: 6px; font-size: 11px;">
                      {{ u.team_name }}
                    </span>
                  </td>
                  <td>
                    <span :class="['role-badge', u.role_code]">
                      ● {{ u.role_name }}
                    </span>
                  </td>
                  <td style="font-family: ui-monospace, monospace; font-weight: 700; color: var(--cyan-neon);">
                    {{ u.max_profiles }} 个
                  </td>
                  <td style="font-family: ui-monospace, monospace; font-weight: 700; color: var(--purple-neon);">
                    {{ u.max_concurrent }} 窗口
                  </td>
                  <td>
                    <span v-if="u.overrides && u.overrides.length > 0" style="color: var(--amber-neon); font-family: ui-monospace, monospace; font-size: 11px; background: rgba(217, 119, 6, 0.1); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(217, 119, 6, 0.3);">
                      ⚡ {{ u.overrides.length }} 项特批
                    </span>
                    <span v-else style="color: var(--text-dim); font-size: 11px;">继承角色默认</span>
                  </td>
                  <td>
                    <span v-if="u.status === 'active'" style="color: var(--emerald-neon); font-family: ui-monospace, monospace; font-size: 11px; display: flex; align-items: center; gap: 4px;">
                      <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--emerald-neon);"></span> ACTIVE
                    </span>
                    <span v-else style="color: var(--rose-neon); font-family: ui-monospace, monospace; font-size: 11px;">
                      LOCKED
                    </span>
                  </td>
                  <td style="text-align: right; white-space: nowrap;">
                    <button @click="openRoleModal(u)" class="action-btn cyan" style="margin-right: 8px;">
                      提权/改角色
                    </button>
                    <button @click="openOverrideModal(u)" class="action-btn purple">
                      特例覆写
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Tab 2: 角色拓扑字典与动态 CRUD 管理 -->
        <div v-if="currentTab === 'roles'">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; flex-wrap: wrap; gap: 10px;">
            <div>
              <h3 style="font-size: 15px; font-weight: 700; color: var(--text-main);">系统角色与权限拓扑管理</h3>
              <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">支持灵活新建自定义安全角色、调整浏览器环境与并发配额上限，并勾选原子权限集</p>
            </div>
            <button @click="openCreateRoleModal" class="btn-refresh" style="background: rgba(0, 240, 255, 0.15); border-color: var(--cyan-neon); font-weight: 700;">
              ➕ 新建安全角色
            </button>
          </div>

          <div class="roles-grid">
            <div v-for="r in roles" :key="r.id" class="role-card">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <div>
                  <h4 style="font-size: 15px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                    {{ r.name }}
                    <span v-if="r.is_system" style="font-size: 10px; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; color: var(--text-dim);">内置受保护</span>
                  </h4>
                  <div style="font-size: 11px; font-family: ui-monospace, monospace; color: var(--cyan-neon); margin-top: 2px;">#{{ r.code }}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button @click="openEditRoleModal(r)" class="action-btn cyan" style="padding: 3px 8px; font-size: 10px;">
                    编辑配置
                  </button>
                  <button v-if="!r.is_system" @click="deleteRole(r)" class="action-btn" style="padding: 3px 8px; font-size: 10px; color: var(--rose-neon); border-color: rgba(255,0,85,0.3); background: rgba(255,0,85,0.06);">
                    删除
                  </button>
                </div>
              </div>

              <div style="font-size: 12px; font-family: ui-monospace, monospace; color: var(--text-muted); margin-bottom: 14px; background: var(--input-bg); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-subtle);">
                <span>配额：环境上限 <b style="color: var(--cyan-neon);">{{ r.max_profiles }}</b> 个</span>
                <span style="margin: 0 8px;">|</span>
                <span>并发 <b style="color: var(--purple-neon);">{{ r.max_concurrent }}</b> 窗口</span>
              </div>

              <div style="border-top: 1px solid var(--border-subtle); padding-top: 12px;">
                <div style="font-size: 11px; font-family: ui-monospace, monospace; color: var(--text-dim); margin-bottom: 8px; display: flex; justify-content: space-between;">
                  <span>原子权限集合 ({{ (r.permissions || []).length }})</span>
                </div>
                <div style="max-height: 120px; overflow-y: auto;">
                  <span v-for="p in r.permissions" :key="p" class="perm-pill">{{ p }}</span>
                  <span v-if="!r.permissions || r.permissions.length === 0" style="color: var(--text-dim); font-size: 11px;">无任何权限</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab 3: 审计日志 -->
        <div v-if="currentTab === 'audit'" class="cyber-card" style="padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div>
              <h3 style="font-size: 15px; font-weight: 700; color: var(--text-main);">安全审计追踪流 (最近 50 条)</h3>
              <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">记录所有环境启动、Cookies 导出、角色提权与敏感访问动作</p>
            </div>
            <button @click="fetchAuditLogs" class="btn-refresh">刷新审计日志</button>
          </div>

          <div class="table-container">
            <table class="cyber-table">
              <thead>
                <tr>
                  <th>时间戳</th>
                  <th>操作主体</th>
                  <th>动作标签</th>
                  <th>审计事件详情</th>
                  <th>来源 IP</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="log in auditLogs" :key="log.id">
                  <td style="font-family: ui-monospace, monospace; color: var(--cyan-neon); font-size: 11px;">{{ log.created_at }}</td>
                  <td style="font-weight: 600; color: var(--text-main);">{{ log.email || log.account_id }}</td>
                  <td>
                    <span style="background: rgba(2, 132, 199, 0.1); border: 1px solid var(--border-cyber); color: var(--cyan-neon); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-family: ui-monospace, monospace;">
                      {{ log.action }}
                    </span>
                  </td>
                  <td style="color: var(--text-main); font-size: 12px;">{{ log.details || '-' }}</td>
                  <td style="font-family: ui-monospace, monospace; color: var(--text-dim); font-size: 11px;">{{ log.ip_address || 'EDGE_NODE' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>

    <!-- 弹窗 1: 角色提权 -->
    <div v-if="activeRoleModalUser" class="modal-overlay">
      <div class="modal-box">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px;">
          <div>
            <h3 style="font-size: 16px; font-weight: 800; color: var(--text-main); font-family: ui-monospace, monospace;">ELEVATE PERMISSION ROLE</h3>
            <p style="font-size: 12px; color: var(--cyan-neon); font-family: ui-monospace, monospace; margin-top: 2px;">
              目标主体: {{ activeRoleModalUser.email }}
            </p>
          </div>
          <button @click="activeRoleModalUser = null" style="background: transparent; border: none; color: var(--text-dim); font-size: 18px; cursor: pointer;">✕</button>
        </div>

        <div style="margin-bottom: 20px;">
          <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px; font-family: ui-monospace, monospace;">请选择赋予的安全角色：</p>
          
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <label style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border-subtle); background: var(--input-bg); cursor: pointer;"
              :style="selectedRoleCode === 'basic_user' ? 'border-color: var(--amber-neon); background: rgba(217,119,6,0.1);' : ''">
              <div>
                <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">基础体验用户 (basic_user)</div>
                <div style="font-size: 11px; color: var(--text-dim);">3 环境额度 / 禁止导出 Cookies / 禁止修改指纹</div>
              </div>
              <input type="radio" value="basic_user" v-model="selectedRoleCode" />
            </label>

            <label style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border-subtle); background: var(--input-bg); cursor: pointer;"
              :style="selectedRoleCode === 'operator' ? 'border-color: var(--cyan-neon); background: rgba(2,132,199,0.1);' : ''">
              <div>
                <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">业务运营员 (operator)</div>
                <div style="font-size: 11px; color: var(--text-dim);">50 环境额度 / 允许日常多开操作 / 禁用高危配置</div>
              </div>
              <input type="radio" value="operator" v-model="selectedRoleCode" />
            </label>

            <label style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border-subtle); background: var(--input-bg); cursor: pointer;"
              :style="selectedRoleCode === 'admin' ? 'border-color: var(--purple-neon); background: rgba(124,58,237,0.15);' : ''">
              <div>
                <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">团队管理员 (admin)</div>
                <div style="font-size: 11px; color: var(--text-dim);">200 环境额度 / 允许导出、指纹修改、代理池分配</div>
              </div>
              <input type="radio" value="admin" v-model="selectedRoleCode" />
            </label>

            <label style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border-subtle); background: var(--input-bg); cursor: pointer;"
              :style="selectedRoleCode === 'owner' ? 'border-color: var(--rose-neon); background: rgba(225,29,72,0.15);' : ''">
              <div>
                <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">最高所有者 (owner)</div>
                <div style="font-size: 11px; color: var(--text-dim);">无限额度 / 拥有全系统最高控制权与团队注销权限</div>
              </div>
              <input type="radio" value="owner" v-model="selectedRoleCode" />
            </label>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--border-subtle); padding-top: 14px;">
          <button @click="activeRoleModalUser = null" style="padding: 8px 16px; border-radius: 8px; background: var(--input-bg); border: 1px solid var(--border-subtle); color: var(--text-main); font-size: 12px; cursor: pointer;">
            取消
          </button>
          <button @click="saveUserRole" style="padding: 8px 18px; border-radius: 8px; background: rgba(2,132,199,0.2); border: 1px solid var(--cyan-neon); color: var(--cyan-neon); font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 0 12px var(--cyan-glow);">
            确认提权 / 变更
          </button>
        </div>
      </div>
    </div>

    <!-- 弹窗 2: 精细特例覆写 (支持视觉模式与原始模式，支持最大化) -->
    <div v-if="activeOverrideModalUser" class="modal-overlay">
      <div :class="['modal-box', isOverrideModalMaximized ? 'maximized' : '']" 
           :style="isOverrideModalMaximized ? '' : 'max-width: 680px; width: 95%; max-height: 88vh;'"
           style="display: flex; flex-direction: column; border-color: var(--purple-neon); box-shadow: 0 0 40px var(--purple-glow); padding: 22px;">
        <div @dblclick="isOverrideModalMaximized = !isOverrideModalMaximized" 
             style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; flex-shrink: 0; cursor: default;">
          <div>
            <h3 style="font-size: 16px; font-weight: 800; color: var(--text-main); font-family: ui-monospace, monospace;">PERMISSION OVERRIDES // 特例微调</h3>
            <p style="font-size: 12px; color: var(--purple-neon); font-family: ui-monospace, monospace; margin-top: 2px;">
              覆写对象: {{ activeOverrideModalUser.email }} ({{ activeOverrideModalUser.nickname }})
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" @click="isOverrideModalMaximized = !isOverrideModalMaximized" 
              class="modal-window-btn" 
              :title="isOverrideModalMaximized ? '还原窗口' : '最大化窗口'">
              <span v-if="isOverrideModalMaximized" style="font-size: 15px; line-height: 1;">🗗</span>
              <span v-else style="font-size: 13px; line-height: 1;">🗖</span>
            </button>
            <button type="button" @click="activeOverrideModalUser = null" class="modal-window-btn close" title="关闭窗口">✕</button>
          </div>
        </div>

        <div style="flex: 1; overflow-y: auto; padding-right: 4px;">
          <p style="font-size: 11px; color: var(--text-muted); font-family: ui-monospace, monospace; margin-bottom: 12px;">
            零信任精细管控：特例优先级高于安全角色。设为 ALLOW 即可放行，设为 DENY 则立即阻断。
          </p>

          <!-- 模式切换控制器 -->
          <div class="perm-mode-switcher">
            <button type="button" 
              :class="['mode-tab-btn', overrideViewMode === 'visual' ? 'active' : '']" 
              @click="overrideViewMode = 'visual'">
              <span>🖥️ 用户视觉分类 (按App模块组织)</span>
              <span class="mode-default-badge">默认</span>
            </button>
            <button type="button" 
              :class="['mode-tab-btn', overrideViewMode === 'raw' ? 'active' : '']" 
              @click="overrideViewMode = 'raw'">
              <span>⚙️ 原始模式 (平铺列表)</span>
            </button>
          </div>

          <!-- 模式 1: 用户视觉分类 -->
          <div v-if="overrideViewMode === 'visual'" style="display: flex; flex-direction: column; gap: 12px;">
            <div v-for="mod in overrideModules" :key="mod.name" class="ui-tab-section" style="padding: 12px;">
              <div style="font-size: 12px; font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                <span>{{ mod.icon }} {{ mod.name }}</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div v-for="item in mod.items" :key="item.id"
                  style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 8px; background: var(--bg-card); border: 1px solid var(--border-subtle); flex-wrap: wrap; gap: 8px;">
                  <div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span style="font-size: 12px; font-weight: 600; color: var(--text-main);">{{ item.name }}</span>
                      <span v-if="item.risk" :class="['risk-tag-badge', item.risk]">⚠️ {{ item.riskLabel }}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                      <span class="ui-position-pill">📍 {{ item.uiPos }}</span>
                      <span style="font-size: 10px; font-family: ui-monospace, monospace; color: var(--cyan-neon);">#{{ item.id }}</span>
                    </div>
                  </div>
                  <select v-model="overrideForm[item.id]" 
                    style="height: 32px; border-radius: 6px; background: var(--input-bg); border: 1px solid var(--border-cyber); font-size: 11px; font-family: ui-monospace, monospace; padding: 0 8px; outline: none;"
                    :style="overrideForm[item.id] === 'ALLOW' ? 'color: var(--emerald-neon); border-color: var(--emerald-neon); font-weight: 700;' : (overrideForm[item.id] === 'DENY' ? 'color: var(--rose-neon); border-color: var(--rose-neon); font-weight: 700;' : 'color: var(--text-muted);')">
                    <option value="DEFAULT">继承角色 (DEFAULT)</option>
                    <option value="ALLOW">特批放行 (ALLOW)</option>
                    <option value="DENY">强制阻断 (DENY)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- 模式 2: 原始平铺列表 -->
          <div v-else style="display: flex; flex-direction: column; gap: 8px;">
            <div v-for="item in sensitivePerms" :key="item.id" 
              style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 10px; background: var(--input-bg); border: 1px solid var(--border-subtle);">
              <div>
                <div style="font-size: 12px; font-weight: 600; color: var(--text-main);">{{ item.name }}</div>
                <div style="font-size: 10px; font-family: ui-monospace, monospace; color: var(--cyan-neon);">{{ item.id }}</div>
              </div>
              <select v-model="overrideForm[item.id]" 
                style="height: 32px; border-radius: 6px; background: var(--bg-card); border: 1px solid var(--border-cyber); font-size: 11px; font-family: ui-monospace, monospace; padding: 0 8px; outline: none;"
                :style="overrideForm[item.id] === 'ALLOW' ? 'color: var(--emerald-neon);' : (overrideForm[item.id] === 'DENY' ? 'color: var(--rose-neon);' : 'color: var(--text-muted);')">
                <option value="DEFAULT">继承角色 (DEFAULT)</option>
                <option value="ALLOW">特批放行 (ALLOW)</option>
                <option value="DENY">强制阻断 (DENY)</option>
              </select>
            </div>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--border-subtle); padding-top: 14px; margin-top: 10px; flex-shrink: 0;">
          <button @click="activeOverrideModalUser = null" style="padding: 8px 16px; border-radius: 8px; background: var(--input-bg); border: 1px solid var(--border-subtle); color: var(--text-main); font-size: 12px; cursor: pointer;">
            取消
          </button>
          <button @click="saveUserOverrides" style="padding: 8px 18px; border-radius: 8px; background: rgba(124,58,237,0.25); border: 1px solid var(--purple-neon); color: var(--purple-neon); font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 0 12px var(--purple-glow);">
            写入特批规则
          </button>
        </div>
      </div>
    </div>

    <!-- 弹窗 3: 角色新建/编辑模态框 (CRUD + 用户视觉模式/原始模式切换，支持窗口最大化) -->
    <div v-if="activeRoleEditModal" class="modal-overlay">
      <div :class="['modal-box', isRoleModalMaximized ? 'maximized' : '']" 
           :style="isRoleModalMaximized ? '' : 'max-width: 860px; width: 95%; max-height: 92vh;'"
           style="display: flex; flex-direction: column; border-color: var(--cyan-neon); box-shadow: 0 0 40px var(--cyan-glow); padding: 22px;">
        <!-- 弹窗头部 (双击可切换最大化/还原) -->
        <div @dblclick="isRoleModalMaximized = !isRoleModalMaximized" 
             style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; flex-shrink: 0; cursor: default;">
          <div>
            <h3 style="font-size: 16px; font-weight: 800; color: var(--text-main); font-family: ui-monospace, monospace;">
              {{ roleEditForm.id ? 'EDIT SECURITY ROLE // 编辑安全角色' : 'NEW SECURITY ROLE // 新建安全角色' }}
            </h3>
            <p style="font-size: 12px; color: var(--cyan-neon); font-family: ui-monospace, monospace; margin-top: 2px;">
              {{ roleEditForm.id ? '调整角色环境配额并按 App 界面视觉组件分配细粒度原子权限' : '定义全新的业务安全角色并指派 App 功能模块操作权限' }}
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" @click="isRoleModalMaximized = !isRoleModalMaximized" 
              class="modal-window-btn" 
              :title="isRoleModalMaximized ? '还原窗口' : '最大化窗口'">
              <span v-if="isRoleModalMaximized" style="font-size: 15px; line-height: 1;">🗗</span>
              <span v-else style="font-size: 13px; line-height: 1;">🗖</span>
            </button>
            <button type="button" @click="activeRoleEditModal = false" class="modal-window-btn close" title="关闭窗口">✕</button>
          </div>
        </div>

        <!-- 弹窗主体滚动区 -->
        <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding-right: 4px;">
          <!-- 基础信息与配额设置 -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; font-size: 11px; font-family: ui-monospace, monospace; color: var(--text-muted); margin-bottom: 4px;">角色标识 Code (唯一英文编码)</label>
              <input v-model="roleEditForm.code" :disabled="!!roleEditForm.id" placeholder="如: tester / custom_role" 
                class="form-input" style="height: 36px; font-size: 12px;" />
            </div>
            <div>
              <label style="display: block; font-size: 11px; font-family: ui-monospace, monospace; color: var(--text-muted); margin-bottom: 4px;">角色显示名称 Name</label>
              <input v-model="roleEditForm.name" placeholder="如: 业务运营专员 / 自动化工程师" 
                class="form-input" style="height: 36px; font-size: 12px;" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; font-size: 11px; font-family: ui-monospace, monospace; color: var(--text-muted); margin-bottom: 4px;">环境额度上限 (max_profiles)</label>
              <input type="number" v-model.number="roleEditForm.max_profiles" min="1" max="99999" 
                class="form-input" style="height: 36px; font-size: 12px;" />
            </div>
            <div>
              <label style="display: block; font-size: 11px; font-family: ui-monospace, monospace; color: var(--text-muted); margin-bottom: 4px;">最大并发窗口 (max_concurrent)</label>
              <input type="number" v-model.number="roleEditForm.max_concurrent" min="1" max="1000" 
                class="form-input" style="height: 36px; font-size: 12px;" />
            </div>
          </div>

          <!-- 细粒度权限配置区 -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <label style="font-size: 11px; font-family: ui-monospace, monospace; color: var(--text-muted);">
                权限策略分配 (已选 <b style="color: var(--cyan-neon);">{{ roleEditForm.permissions.length }}</b> / {{ allPermissions.length }} 项)
              </label>
              <div style="font-size: 11px; font-family: ui-monospace, monospace; display: flex; align-items: center; gap: 8px;">
                <button type="button" @click="selectAllPerms" style="color: var(--cyan-neon); background: transparent; border: none; cursor: pointer;">全选全部</button>
                <span style="color: var(--text-dim);">|</span>
                <button type="button" @click="roleEditForm.permissions = []" style="color: var(--text-dim); background: transparent; border: none; cursor: pointer;">一键清空</button>
              </div>
            </div>

            <!-- 模式切换控制器：用户视觉模式 (默认) vs 原始模式 + SSOT 同步按钮 -->
            <div class="perm-mode-switcher">
              <button type="button" 
                :class="['mode-tab-btn', permViewMode === 'visual' ? 'active' : '']" 
                @click="permViewMode = 'visual'">
                <span>🖥️ 用户视觉模式 (按客户端界面组织)</span>
                <span class="mode-default-badge">默认模式</span>
              </button>
              <button type="button" 
                :class="['mode-tab-btn', permViewMode === 'raw' ? 'active' : '']" 
                @click="permViewMode = 'raw'">
                <span>⚙️ 原始模式 (全部原子字典平铺)</span>
              </button>
              <button type="button" class="btn-cyber" style="margin-left: auto; padding: 5px 12px; font-size: 11px; display: flex; align-items: center; gap: 6px; border-radius: 8px; border: 1px solid var(--purple-neon); background: rgba(184, 41, 247, 0.1); color: var(--purple-neon);" :disabled="syncingPerms" @click="syncPermissions">
                <span>{{ syncingPerms ? '⏳ 正在自同步...' : '🔄 一键自同步权限 (SSOT)' }}</span>
              </button>
            </div>

            <!-- 模式 1: 用户视觉模式 (按App UI层级结构与组件组织) -->
            <div v-if="permViewMode === 'visual'">
              <!-- 一级 App 导航 Tab 快捷筛选 -->
              <div class="ui-module-nav">
                <button type="button" 
                  :class="['ui-module-nav-btn', selectedUiTab === 'all' ? 'active' : '']"
                  @click="selectedUiTab = 'all'">
                  <span>🌐 全部界面 (ALL)</span>
                </button>
                <button type="button" 
                  v-for="tab in uiPermissionTree" :key="tab.key"
                  :class="['ui-module-nav-btn', selectedUiTab === tab.key ? 'active' : '']"
                  @click="selectedUiTab = tab.key">
                  <span>{{ tab.icon }} {{ tab.shortName || tab.name }}</span>
                  <span class="ui-nav-count">{{ getTabCheckedCount(tab) }}/{{ getTabTotalCount(tab) }}</span>
                </button>
              </div>

              <!-- 模块卡片滚动区 -->
              <div class="ui-tree-scroll-area">
                <div v-for="tab in filteredUiTree" :key="tab.key" class="ui-tab-section">
                  <!-- 顶层 UI (一级导航) 头部 -->
                  <div class="ui-tab-header">
                    <div>
                      <div class="ui-tab-title">
                        <span>{{ tab.icon }} {{ tab.name }}</span>
                        <span class="perm-pill" style="font-size: 10px; padding: 2px 8px;">
                          已配置 {{ getTabCheckedCount(tab) }} / {{ getTabTotalCount(tab) }}
                        </span>
                      </div>
                      <div class="ui-tab-desc">{{ tab.description }}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <button type="button" @click="toggleTabAll(tab)" 
                        style="padding: 4px 10px; border-radius: 6px; font-size: 11px; font-family: ui-monospace, monospace; background: rgba(0, 240, 255, 0.1); border: 1px solid var(--border-cyber); color: var(--cyan-neon); cursor: pointer;">
                        {{ isTabAllChecked(tab) ? '取消本模块全部' : '全选本模块' }}
                      </button>
                    </div>
                  </div>

                  <!-- 二级 UI (区域、组件与按钮) -->
                  <div v-for="grp in tab.groups" :key="grp.section" class="ui-subgroup">
                    <div class="ui-subgroup-title">
                      <span>▸ {{ grp.section }}</span>
                      <span v-if="grp.badge" style="font-size: 10px; color: var(--text-dim); background: var(--bg-card); border: 1px solid var(--border-subtle); padding: 1px 6px; border-radius: 4px;">
                        {{ grp.badge }}
                      </span>
                    </div>

                    <div class="ui-subgroup-grid">
                      <div v-for="p in grp.perms" :key="p.id + '_' + tab.key" 
                        :class="['ui-perm-card', isPermChecked(p.id) ? 'checked' : '', (p.risk === 'critical' || p.risk === 'high') ? 'danger' : '']"
                        @click="togglePerm(p.id)">
                        <input type="checkbox" :checked="isPermChecked(p.id)" @click.stop="togglePerm(p.id)" class="perm-checkbox-custom" />
                        <div style="flex: 1; min-width: 0;">
                          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 2px;">
                            <span style="font-size: 12px; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                              {{ p.name }}
                            </span>
                            <span v-if="p.riskLabel" :class="['risk-tag-badge', p.risk || 'high']">
                              ⚠️ {{ p.riskLabel }}
                            </span>
                          </div>
                          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap;">
                            <span class="ui-position-pill">📍 {{ p.uiPosition }}</span>
                            <span style="font-size: 10px; font-family: ui-monospace, monospace; color: var(--cyan-neon);">#{{ p.id }}</span>
                          </div>
                          <div style="font-size: 11px; color: var(--text-muted); line-height: 1.35;">
                            {{ p.desc }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 兜底：未分类底层原子权限 -->
                <div v-if="unmappedPerms.length > 0" class="ui-tab-section">
                  <div class="ui-tab-header">
                    <div>
                      <div class="ui-tab-title">
                        <span>🔧 其他底层扩展权限</span>
                        <span class="perm-pill" style="font-size: 10px;">{{ unmappedPerms.length }} 项</span>
                      </div>
                      <div class="ui-tab-desc">数据库中新增但未映射到特定客户端按钮的原生原子权限</div>
                    </div>
                  </div>
                  <div class="ui-subgroup-grid">
                    <div v-for="p in unmappedPerms" :key="p.id"
                      :class="['ui-perm-card', isPermChecked(p.id) ? 'checked' : '']"
                      @click="togglePerm(p.id)">
                      <input type="checkbox" :checked="isPermChecked(p.id)" @click.stop="togglePerm(p.id)" class="perm-checkbox-custom" />
                      <div>
                        <div style="font-size: 12px; font-weight: 700; color: var(--text-main);">{{ p.name }}</div>
                        <div style="font-size: 10px; font-family: ui-monospace, monospace; color: var(--cyan-neon);">#{{ p.id }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 模式 2: 原始模式 (平铺列表) -->
            <div v-else class="raw-mode-container">
              <div style="font-size: 11px; color: var(--text-dim); font-family: ui-monospace, monospace; margin-bottom: 8px;">
                提示：原始模式列出系统数据库底层存储的全部原子权限编码字典。
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px; background: var(--input-bg); padding: 12px; border-radius: 10px; border: 1px solid var(--border-subtle); max-height: 380px; overflow-y: auto;">
                <label v-for="p in allPermissions" :key="p.id" 
                  style="display: flex; align-items: center; gap: 8px; font-size: 11px; cursor: pointer; padding: 6px 8px; border-radius: 8px; border: 1px solid transparent; transition: all 0.15s;"
                  :style="roleEditForm.permissions.includes(p.id) ? 'background: rgba(0,240,255,0.08); border-color: var(--cyan-neon); color: var(--cyan-neon);' : 'color: var(--text-muted); background: var(--bg-card); border-color: var(--border-subtle);'">
                  <input type="checkbox" :value="p.id" v-model="roleEditForm.permissions" class="perm-checkbox-custom" />
                  <div>
                    <div style="font-weight: 600; color: var(--text-main);">{{ p.name }}</div>
                    <div style="font-size: 10px; font-family: ui-monospace, monospace; color: var(--text-dim);">{{ p.id }}</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- 弹窗底部操作栏 -->
        <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--border-subtle); padding-top: 14px; margin-top: 10px; flex-shrink: 0;">
          <button @click="activeRoleEditModal = false" style="padding: 8px 16px; border-radius: 8px; background: var(--input-bg); border: 1px solid var(--border-subtle); color: var(--text-main); font-size: 12px; cursor: pointer;">
            取消
          </button>
          <button @click="saveRoleForm" style="padding: 8px 18px; border-radius: 8px; background: rgba(0,240,255,0.25); border: 1px solid var(--cyan-neon); color: var(--cyan-neon); font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 0 12px var(--cyan-glow);">
            保存角色定义
          </button>
        </div>
      </div>
    </div>

  </div>

  <script>
    const { createApp, ref, computed, onMounted } = Vue;

    createApp({
      setup() {
        const token = ref(localStorage.getItem('narciph_admin_token') || '');
        const adminUser = ref(JSON.parse(localStorage.getItem('narciph_admin_user') || 'null'));
        const currentTab = ref('users');
        const loggingIn = ref(false);

        // 主题管理：支持 'dark' (金属暗黑) 与 'light' (浅白科技)
        const currentTheme = ref(localStorage.getItem('narciph_admin_theme') || 'dark');

        function applyTheme(theme) {
          const root = document.getElementById('html-root') || document.documentElement;
          if (theme === 'light') {
            root.classList.remove('theme-dark');
            root.classList.add('theme-light');
          } else {
            root.classList.remove('theme-light');
            root.classList.add('theme-dark');
          }
          localStorage.setItem('narciph_admin_theme', theme);
        }

        function toggleTheme() {
          currentTheme.value = currentTheme.value === 'dark' ? 'light' : 'dark';
          applyTheme(currentTheme.value);
        }

        const loginForm = ref({ email: 'admin@narc.com', password: '' });
        const stats = ref({ usersCount: 0, teamsCount: 0, auditLogsCount: 0 });
        const users = ref([]);
        const roles = ref([]);
        const auditLogs = ref([]);

        const activeRoleModalUser = ref(null);
        const selectedRoleCode = ref('basic_user');

        const activeOverrideModalUser = ref(null);
        const overrideForm = ref({});
        const overrideViewMode = ref('visual'); // 'visual' (默认) | 'raw'

        // 敏感权限字典配置 (包含 App 模块与 UI 位置)
        const sensitivePerms = [
          { id: 'profile:export', name: '导出环境与Cookies (高危防外泄)', moduleName: '📁 配置文件', uiPos: '顶部「导出」按钮', risk: 'critical', riskLabel: '高危外泄' },
          { id: 'profile:edit_fingerprint', name: '修改底层硬件指纹 (高危)', moduleName: '📁 配置文件', uiPos: '配置弹窗「指纹伪装」', risk: 'high', riskLabel: '硬件伪装' },
          { id: 'profile:delete', name: '永久粉碎环境 (不可逆)', moduleName: '📁 配置文件', uiPos: '废纸篓「永久删除」', risk: 'critical', riskLabel: '不可逆' },
          { id: 'proxy:view_credential', name: '查看代理明文账号密码 (高危)', moduleName: '🌐 网络代理', uiPos: '节点详情「查看密码」', risk: 'high', riskLabel: '明文凭据' },
          { id: 'proxy:edit_routing', name: '修改完美分流规则 (高危)', moduleName: '🌐 网络代理', uiPos: '路由「高级规则」', risk: 'high', riskLabel: '高危路由' },
          { id: 'proxy:manage', name: '管理团队代理订阅池', moduleName: '🌐 网络代理', uiPos: '顶部「+ 导入/管理」', risk: 'medium', riskLabel: '节点管理' },
          { id: 'member:assign_role', name: '分配下级角色与特权', moduleName: '🛡️ 团队中心', uiPos: '操作列「提权/改角色」', risk: 'high', riskLabel: '特权分配' },
          { id: 'member:remove', name: '移出与禁用团队成员', moduleName: '🛡️ 团队中心', uiPos: '列表行「移出团队」', risk: 'high', riskLabel: '成员注销' },
          { id: 'role:manage', name: '管理自定义角色字典', moduleName: '🛡️ 团队中心', uiPos: '角色中心「新建角色」', risk: 'high', riskLabel: '核心特权' },
        ];

        const overrideModules = computed(() => {
          const map = {};
          sensitivePerms.forEach(item => {
            if (!map[item.moduleName]) {
              map[item.moduleName] = {
                name: item.moduleName,
                icon: item.moduleName.slice(0, 2),
                items: []
              };
            }
            map[item.moduleName].items.push(item);
          });
          return Object.values(map);
        });

        // ========== 用户视觉模式 (按客户端实际 UI 层级结构与按钮组织) ==========
        const permViewMode = ref('visual'); // 'visual' (默认用户视觉模式) | 'raw' (原始字典模式)
        const selectedUiTab = ref('all');   // 'all' | tab.key

        const uiPermissionTree = ref([
          {
            key: 'profiles',
            name: '配置文件 (Profiles)',
            shortName: '配置文件',
            icon: '📁',
            description: '核心防关联浏览器环境管理中心',
            groups: [
              {
                section: '页面访问与基础信息',
                badge: '基础',
                perms: [
                  { id: 'profile:list', name: '浏览环境列表', uiPosition: '一级页面访问', desc: '进入配置文件中心、浏览受管指纹环境列表与状态' },
                  { id: 'profile:edit_basic', name: '编辑基本信息', uiPosition: '列表行「编辑」', desc: '修改环境名称、自定义备注、所属分组及标签' },
                ]
              },
              {
                section: '顶部操作栏按钮',
                badge: '工具栏',
                perms: [
                  { id: 'profile:create', name: '新建环境按钮', uiPosition: '顶部「+ 新建」', desc: '创建新的隔离指纹浏览器配置文件' },
                  { id: 'profile:import', name: '导入配置按钮', uiPosition: '顶部「导入」', desc: '批量导入第三方或外部指纹配置与数据' },
                  { id: 'profile:export', name: '导出配置与凭据', uiPosition: '顶部「导出」/ 菜单', desc: '导出环境 Cookies、密码及本地凭据数据', risk: 'critical', riskLabel: '高危防外泄' },
                ]
              },
              {
                section: '列表行内与快捷操作',
                badge: '行内控件',
                perms: [
                  { id: 'profile:launch', name: '启动浏览器按钮', uiPosition: '列表行「▶ 启动」', desc: '拉起 Camoufox 防关联内核并载入专属指纹' },
                  { id: 'profile:stop', name: '停止浏览器按钮', uiPosition: '列表行「⏹ 停止」', desc: '关闭正在运行中的指纹浏览器实例' },
                  { id: 'profile:trash', name: '移入废纸篓按钮', uiPosition: '列表行「🗑 移入废纸篓」', desc: '将环境停用并归档到回收废纸篓暂存' },
                ]
              },
              {
                section: '底层指纹伪装与高危销毁',
                badge: '高危特权',
                perms: [
                  { id: 'profile:edit_fingerprint', name: '修改底层硬件指纹', uiPosition: '配置弹窗「高级伪装」', desc: '修改 Canvas / WebGL / Audio / MAC / 操作系统特征伪装', risk: 'high', riskLabel: '硬件伪装' },
                  { id: 'profile:delete', name: '永久粉碎环境', uiPosition: '废纸篓「永久删除」', desc: '彻底从硬盘清除粉碎指纹环境与全部缓存数据', risk: 'critical', riskLabel: '不可逆清除' },
                ]
              }
            ]
          },
          {
            key: 'groups',
            name: '分组协同 (Groups)',
            shortName: '分组协同',
            icon: '👥',
            description: '多账号批量归类与业务分组隔离',
            groups: [
              {
                section: '分组管理组件',
                badge: '协同',
                perms: [
                  { id: 'profile:list', name: '查看分组列表', uiPosition: '一级页面访问', desc: '查看所有业务分组与环境分布情况' },
                  { id: 'profile:edit_basic', name: '创建与编辑分组', uiPosition: '分组「+ 新增/重命名」', desc: '创建新业务分组、修改分组名称或转移环境' },
                ]
              }
            ]
          },
          {
            key: 'proxies',
            name: '网络代理 (Proxies)',
            shortName: '网络代理',
            icon: '🌐',
            description: '原生代理网络、订阅池与流量分流体系',
            groups: [
              {
                section: '页面访问与使用',
                badge: '基础网络',
                perms: [
                  { id: 'proxy:use', name: '挂载与使用代理', uiPosition: '一级页面 / 环境网络绑定', desc: '允许为环境绑定代理节点并进行网络中继' },
                ]
              },
              {
                section: '节点管理与路由规则',
                badge: '路由管控',
                perms: [
                  { id: 'proxy:manage', name: '管理代理池与订阅', uiPosition: '顶部「+ 添加/导入」', desc: '增删改团队代理节点、批量测试延迟及订阅更新' },
                  { id: 'proxy:edit_routing', name: '修改完美分流规则', uiPosition: '路由「高级规则设置」', desc: '配置规则集、直连/代理分流、域名嗅探与劫持', risk: 'high', riskLabel: '高危路由' },
                ]
              },
              {
                section: '明文凭据安全保护',
                badge: '凭据风控',
                perms: [
                  { id: 'proxy:view_credential', name: '查看代理明文账密', uiPosition: '节点列表「👁 查看密码」', desc: '直接查看代理服务器的明文认证账号与密码', risk: 'high', riskLabel: '高危凭据' },
                ]
              }
            ]
          },
          {
            key: 'extensions',
            name: '扩展插件 (Extensions)',
            shortName: '扩展插件',
            icon: '🧩',
            description: 'Chrome / Firefox 商店与自定义 CRX 插件中心',
            groups: [
              {
                section: '插件生态控制',
                badge: '生态',
                perms: [
                  { id: 'profile:edit_basic', name: '环境挂载扩展', uiPosition: '插件中心「安装到环境」', desc: '将商店插件批量推送到指定的浏览器环境中' },
                  { id: 'profile:edit_fingerprint', name: '上传自定义CRX', uiPosition: '插件中心「本地安装」', desc: '从本地硬盘加载未签名的自定义扩展程序', risk: 'high', riskLabel: '代码风险' },
                ]
              }
            ]
          },
          {
            key: 'agent',
            name: 'AI 智能体 / 自动化 (Automation & Agent)',
            shortName: '自动化',
            icon: '🤖',
            description: '端侧 AI 自动化驱动与批量 RPA 任务执行',
            groups: [
              {
                section: '自动化脚本调度',
                badge: 'RPA执行',
                perms: [
                  { id: 'profile:launch', name: '执行 AI 自动化', uiPosition: '智能体「一键执行」', desc: '拉起指纹环境并自动注入 CDP / Playwright 指令' },
                  { id: 'profile:stop', name: '紧急终止自动化', uiPosition: '运行面板「强制停止」', desc: '实时阻断正在运行的自动化会话' },
                ]
              }
            ]
          },
          {
            key: 'integrations',
            name: '第三方集成 (Integrations)',
            shortName: '接口集成',
            icon: '🔌',
            description: 'Local REST API 与外部调度驱动',
            groups: [
              {
                section: '开放 API 调用',
                badge: 'API',
                perms: [
                  { id: 'profile:list', name: '本地 REST 查询环境', uiPosition: '本地 API / 端口监听', desc: '允许外部程序通过本地 HTTP 接口查询环境列表' },
                  { id: 'profile:launch', name: '本地 REST 远程唤起', uiPosition: '外部接口唤起', desc: '允许外部驱动或脚本调用接口远程唤起浏览器' },
                ]
              }
            ]
          },
          {
            key: 'team_rbac',
            name: '团队协同与特权管控 (Team & RBAC)',
            shortName: '团队与权限',
            icon: '🛡️',
            description: '组织架构、成员管理与自定义权限中枢',
            groups: [
              {
                section: '成员管理组件',
                badge: '成员',
                perms: [
                  { id: 'member:read', name: '查看团队成员列表', uiPosition: '成员中心「列表」', desc: '浏览团队所有席位成员、邮箱与在线状态' },
                  { id: 'member:invite', name: '邀请新成员按钮', uiPosition: '成员中心「+ 邀请成员」', desc: '向外部用户发送加入团队的邀请凭据' },
                  { id: 'member:remove', name: '移除与停用成员', uiPosition: '行内「移出团队」', desc: '注销成员权限、强制下线并收回席位配额', risk: 'high', riskLabel: '高危管理' },
                ]
              },
              {
                section: '安全角色与权限分配',
                badge: '特权中枢',
                perms: [
                  { id: 'member:assign_role', name: '分配下级角色权限', uiPosition: '操作列「提权/改角色」', desc: '调整下级成员的安全角色等级与权限范围', risk: 'high', riskLabel: '特权操作' },
                  { id: 'role:manage', name: '管理自定义角色字典', uiPosition: '角色中心「新建/编辑角色」', desc: '增删改企业安全角色、定义配额与原子权限拓扑', risk: 'high', riskLabel: '系统核心' },
                  { id: 'audit:read', name: '查看安全审计黑匣子', uiPosition: '安全中心「审计日志」', desc: '审计所有敏感调用、登录追溯与操作溯源' },
                ]
              }
            ]
          }
        ]);

        const filteredUiTree = computed(() => {
          if (selectedUiTab.value === 'all') {
            return uiPermissionTree.value;
          }
          return uiPermissionTree.value.filter(tab => tab.key === selectedUiTab.value);
        });

        const unmappedPerms = computed(() => {
          const known = new Set();
          uiPermissionTree.value.forEach(tab => {
            tab.groups.forEach(grp => {
              grp.perms.forEach(p => known.add(p.id));
            });
          });
          return allPermissions.value.filter(p => !known.has(p.id));
        });

        function getTabPermIds(tab) {
          const ids = [];
          tab.groups.forEach(g => {
            g.perms.forEach(p => {
              if (!ids.includes(p.id)) ids.push(p.id);
            });
          });
          return ids;
        }

        function getTabTotalCount(tab) {
          return getTabPermIds(tab).length;
        }

        function getTabCheckedCount(tab) {
          const ids = getTabPermIds(tab);
          return ids.filter(id => roleEditForm.value.permissions.includes(id)).length;
        }

        function isTabAllChecked(tab) {
          const ids = getTabPermIds(tab);
          return ids.length > 0 && ids.every(id => roleEditForm.value.permissions.includes(id));
        }

        function toggleTabAll(tab) {
          const ids = getTabPermIds(tab);
          if (isTabAllChecked(tab)) {
            roleEditForm.value.permissions = roleEditForm.value.permissions.filter(id => !ids.includes(id));
          } else {
            const cur = new Set(roleEditForm.value.permissions);
            ids.forEach(id => cur.add(id));
            roleEditForm.value.permissions = Array.from(cur);
          }
        }

        function isPermChecked(id) {
          return roleEditForm.value.permissions.includes(id);
        }

        function togglePerm(id) {
          const idx = roleEditForm.value.permissions.indexOf(id);
          if (idx >= 0) {
            roleEditForm.value.permissions.splice(idx, 1);
          } else {
            roleEditForm.value.permissions.push(id);
          }
        }

        function fillDefaultAdmin() {
          loginForm.value.email = 'admin@narc.com';
          loginForm.value.password = 'admin123456';
        }

        async function login() {
          loggingIn.value = true;
          try {
            const res = await fetch('/api/v1/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(loginForm.value),
            });
            const data = await res.json();
            if (data.success && data.token) {
              token.value = data.token;
              adminUser.value = data.user;
              localStorage.setItem('narciph_admin_token', data.token);
              localStorage.setItem('narciph_admin_user', JSON.stringify(data.user));
              await loadDashboardData();
            } else {
              alert(data.message || '认证失败，请核对凭据');
            }
          } catch (e) {
            alert('中枢网络连接异常: ' + e);
          } finally {
            loggingIn.value = false;
          }
        }

        function logout() {
          token.value = '';
          adminUser.value = null;
          localStorage.removeItem('narciph_admin_token');
          localStorage.removeItem('narciph_admin_user');
        }

        function handleAuthError(res) {
          if (res && (res.status === 401 || res.status === 403)) {
            token.value = '';
            adminUser.value = null;
            localStorage.removeItem('narciph_admin_token');
            localStorage.removeItem('narciph_admin_user');
            return true;
          }
          return false;
        }

        async function loadDashboardData() {
          if (!token.value) return;
          await Promise.all([fetchStats(), fetchUsers(), fetchRoles(), fetchAuditLogs()]);
        }

        async function fetchStats() {
          try {
            const res = await fetch('/api/v1/admin/stats', { headers: { Authorization: 'Bearer ' + token.value } });
            if (handleAuthError(res)) return;
            if (res.ok) stats.value = await res.json();
          } catch (e) {
            console.error('fetchStats error:', e);
          }
        }

        async function fetchUsers() {
          try {
            const res = await fetch('/api/v1/admin/users', { headers: { Authorization: 'Bearer ' + token.value } });
            if (handleAuthError(res)) return;
            if (res.ok) {
              const data = await res.json();
              users.value = data.users || [];
            }
          } catch (e) {
            console.error('fetchUsers error:', e);
          }
        }

        const allPermissions = ref([]);
        const activeRoleEditModal = ref(false);
        const isRoleModalMaximized = ref(false);
        const isOverrideModalMaximized = ref(false);
        const roleEditForm = ref({
          id: '',
          code: '',
          name: '',
          max_profiles: 10,
          max_concurrent: 2,
          permissions: []
        });

        const syncingPerms = ref(false);
        async function syncPermissions() {
          if (!token.value) return;
          syncingPerms.value = true;
          try {
            const res = await fetch('/api/v1/admin/permissions/sync', {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + token.value }
            });
            const data = await res.json();
            if (data.success) {
              alert(data.message || '权限自同步成功！');
              await fetchRoles();
            } else {
              alert(data.message || '自同步失败');
            }
          } catch (e) {
            alert('自同步请求异常: ' + e);
          } finally {
            syncingPerms.value = false;
          }
        }

        async function fetchRoles() {
          try {
            const res = await fetch('/api/v1/admin/roles', { headers: { Authorization: 'Bearer ' + token.value } });
            if (handleAuthError(res)) return;
            if (res.ok) {
              const data = await res.json();
              roles.value = data.roles || [];
              allPermissions.value = data.allPermissions || [];
              if (Array.isArray(data.uiPermissionTree) && data.uiPermissionTree.length > 0) {
                uiPermissionTree.value = data.uiPermissionTree;
              }
            }
          } catch (e) {
            console.error('fetchRoles error:', e);
          }
        }

        function openCreateRoleModal() {
          isRoleModalMaximized.value = false;
          permViewMode.value = 'visual';
          selectedUiTab.value = 'all';
          roleEditForm.value = {
            id: '',
            code: '',
            name: '',
            max_profiles: 10,
            max_concurrent: 2,
            permissions: ['profile:list', 'profile:create', 'profile:launch', 'profile:stop']
          };
          activeRoleEditModal.value = true;
        }

        function openEditRoleModal(role) {
          isRoleModalMaximized.value = false;
          permViewMode.value = 'visual';
          selectedUiTab.value = 'all';
          roleEditForm.value = {
            id: role.id,
            code: role.code,
            name: role.name,
            max_profiles: role.max_profiles || 10,
            max_concurrent: role.max_concurrent || 2,
            permissions: [...(role.permissions || [])]
          };
          activeRoleEditModal.value = true;
        }

        function selectAllPerms() {
          roleEditForm.value.permissions = allPermissions.value.map(p => p.id);
        }

        async function saveRoleForm() {
          const f = roleEditForm.value;
          if (!f.name || (!f.id && !f.code)) {
            alert('角色名称与标识不能为空');
            return;
          }

          const isUpdate = !!f.id;
          const url = isUpdate ? '/api/v1/admin/roles/' + f.id : '/api/v1/admin/roles';
          const method = isUpdate ? 'PUT' : 'POST';

          try {
            const res = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.value },
              body: JSON.stringify({
                code: f.code,
                name: f.name,
                max_profiles: f.max_profiles,
                max_concurrent: f.max_concurrent,
                permissions: f.permissions
              })
            });
            const data = await res.json();
            if (data.success) {
              activeRoleEditModal.value = false;
              await fetchRoles();
              alert(isUpdate ? '角色配置更新成功！' : '新角色已创建！');
            } else {
              alert(data.message || '操作失败');
            }
          } catch (e) {
            alert('网络请求异常: ' + e);
          }
        }

        async function deleteRole(role) {
          if (!confirm('确定要彻底删除安全角色 "' + role.name + ' (' + role.code + ')" 吗？')) return;

          try {
            const res = await fetch('/api/v1/admin/roles/' + role.id, {
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + token.value }
            });
            const data = await res.json();
            if (data.success) {
              await fetchRoles();
              alert('角色已删除');
            } else {
              alert(data.message || '删除失败');
            }
          } catch (e) {
            alert('网络请求异常: ' + e);
          }
        }

        async function fetchAuditLogs() {
          try {
            const res = await fetch('/api/v1/admin/audit-logs', { headers: { Authorization: 'Bearer ' + token.value } });
            if (handleAuthError(res)) return;
            if (res.ok) {
              const data = await res.json();
              auditLogs.value = data.logs || [];
            }
          } catch (e) {
            console.error('fetchAuditLogs error:', e);
          }
        }

        function openRoleModal(user) {
          activeRoleModalUser.value = user;
          selectedRoleCode.value = user.role_code || 'basic_user';
        }

        async function saveUserRole() {
          if (!activeRoleModalUser.value) return;
          const u = activeRoleModalUser.value;
          const res = await fetch(\`/api/v1/admin/users/\${u.internal_user_id}/role\`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.value },
            body: JSON.stringify({ role_code: selectedRoleCode.value }),
          });
          const data = await res.json();
          if (data.success) {
            activeRoleModalUser.value = null;
            await fetchUsers();
            alert('权限等级提升成功！节点已同步并自增版本号。');
          } else {
            alert(data.message || '更新失败');
          }
        }

        function openOverrideModal(user) {
          isOverrideModalMaximized.value = false;
          overrideViewMode.value = 'visual';
          activeOverrideModalUser.value = user;
          const map = {};
          (user.overrides || []).forEach(o => { map[o.permission_id] = o.effect; });
          sensitivePerms.forEach(p => {
            if (!map[p.id]) map[p.id] = 'DEFAULT';
          });
          overrideForm.value = map;
        }

        async function saveUserOverrides() {
          if (!activeOverrideModalUser.value) return;
          const u = activeOverrideModalUser.value;
          const res = await fetch(\`/api/v1/admin/users/\${u.internal_user_id}/overrides\`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.value },
            body: JSON.stringify({ overrides: overrideForm.value }),
          });
          const data = await res.json();
          if (data.success) {
            activeOverrideModalUser.value = null;
            await fetchUsers();
            alert('精细特批规则写入成功！已实时生效。');
          } else {
            alert(data.message || '更新失败');
          }
        }

        onMounted(() => {
          applyTheme(currentTheme.value);
          if (token.value) {
            loadDashboardData();
          }
        });

        return {
          token,
          adminUser,
          currentTheme,
          toggleTheme,
          currentTab,
          loggingIn,
          loginForm,
          stats,
          users,
          roles,
          auditLogs,
          fillDefaultAdmin,
          login,
          logout,
          fetchUsers,
          fetchRoles,
          fetchAuditLogs,
          allPermissions,
          activeRoleEditModal,
          isRoleModalMaximized,
          isOverrideModalMaximized,
          roleEditForm,
          openCreateRoleModal,
          openEditRoleModal,
          selectAllPerms,
          saveRoleForm,
          deleteRole,
          activeRoleModalUser,
          selectedRoleCode,
          openRoleModal,
          saveUserRole,
          activeOverrideModalUser,
          overrideForm,
          overrideViewMode,
          sensitivePerms,
          overrideModules,
          openOverrideModal,
          saveUserOverrides,
          permViewMode,
          selectedUiTab,
          uiPermissionTree,
          syncingPerms,
          syncPermissions,
          filteredUiTree,
          unmappedPerms,
          getTabTotalCount,
          getTabCheckedCount,
          isTabAllChecked,
          toggleTabAll,
          isPermChecked,
          togglePerm,
        };
      }
    }).mount('#app');
  </script>
</body>
</html>
`;

