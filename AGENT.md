# NarciPHBrowser - AI Agent 协同开发指南与核心规范 (AGENT.md)

本文档定义了 AI Agent（及开发者）在参与 **NarciPHBrowser** 项目维护与开发时的强制遵循准则、架构约定与工作流。

---

## 目录
1. [技术栈与架构概览](#1-技术栈与架构概览)
2. [核心规范：App 功能新增与权限联动铁律 (强制)](#2-核心规范app-功能新增与权限联动铁律-强制)
3. [核心规范：用户登录与匿名限制守则](#3-核心规范用户登录与匿名限制守则)
4. [核心规范：服务端双端（Cloudflare & Docker）一致性](#4-核心规范服务端双端cloudflare--docker一致性)
5. [构建与验证工作流](#5-构建与验证工作流)

---

## 1. 技术栈与架构概览

- **桌面端 (App)**:
  - 框架：`Tauri v2` + `Rust`
  - 前端：`React 18` + `TypeScript` + `Vite` + `Tailwind CSS` + `shadcn/ui` + `Zustand`
  - 内核：Camoufox (Firefox-based) 指纹浏览器内核
- **服务端 (Server)**:
  - 运行时 1：`Cloudflare Workers` + `D1 Database` (`server/cf/`)
  - 运行时 2：`Node.js` + `Hono` + `SQLite/better-sqlite3` (`server/docker/`)
  - 共享层：`server/shared/` (`schema.sql`, `permissions.ts`)
- **管理后台 (Admin)**:
  - 嵌入式单页应用 (`admin_html.ts`)，提供 RBAC 角色/权限/用户管理。

---

## 2. 核心规范：权限单一数据源 (SSOT) 与自动同步机制

本项目已完成重构并实现了 **单一数据源 (Single Source of Truth, SSOT) + 服务端自动同步 (Auto-Sync) + 前端强类型约束**：

### 🌟 统一权限注册中心 (`server/shared/permissions.ts`)
凡是在 App 桌面端增加任何新功能，**唯一必须声明的地方**就是 `server/shared/permissions.ts` 中的 `PERMISSION_REGISTRY` 数组。
每一项权限元数据包含：
```typescript
{
  id: 'module:action',           // 唯一权限代码 (如 'profile:create')
  module: 'profile',            // 所属底层模块
  action: 'create',             // 操作动作
  name: '新建环境按钮',           // 权限展示名称
  description: '创建隔离指纹环境', // 详细功能描述
  risk_level: 'low',            // 风控等级: 'low' | 'medium' | 'high' | 'critical'
  riskLabel?: '高危管理',        // 可选风控标签
  uiTab: UI_TABS.PROFILES,      // App 顶层 UI Tab (自动用于管理后台视觉树)
  uiGroup: { section: '顶部操作栏按钮', badge: '工具栏' }, // 二级组件/区块
  uiPosition: '顶部「+ 新建」',   // 客户端具体控件位置
  defaultRoles: ['basic_user', 'operator', 'admin', 'owner'], // 默认授权的系统角色
}
```

### ⚙️ 自动化闭环与同步机制（全链路零人工）：
1. **权限版本指纹静默自检 (Auto-Sync Fingerprint Middleware)**：
   - 服务端内置 `getPermissionsFingerprint()` 与 `ensurePermissionsSynced(db)`；
   - 每次服务端部署更新后，只要收到客户端的第一个 API 请求（如 App 启动时的 `/api/v1/health` 或登录），服务端会对比数据库 `sys_system_meta` 表中的指纹；若检测到代码版本有新权限，**立即在后台静默自动执行同步**，无需管理员手动点击任何按钮！
2. **管理后台用户模式视觉树自动生成 (Dynamic UI Tree)**：
   - 管理后台不再硬编码静态权限树，而是由服务端根据 `PERMISSION_REGISTRY` 动态聚合生成 `uiPermissionTree` 并通过 API 返回。后台前端实时展示最新 App 界面层级。
3. **桌面端强类型守卫 (Type-Safe Guards)**：
   - `@narc/sdk` 导出 `PermissionCode` 联合类型。
   - 在桌面端使用 `<PermissionGuard permission="module:action">` 或 `accountStore.hasPermission("module:action")`。若填写了未在 SSOT 中注册的权限代码，TypeScript 编译阶段（`pnpm typecheck`）直接报错阻断。

---

## 3. 核心规范：用户登录与匿名限制守则

1. **匿名用户权限收敛**：
   - 客户端在未登录（离线/匿名）状态下，`accountStore.hasPermission(...)` 必须严格返回 `false`。
   - 匿名用户**唯一允许访问**的界面为「账户中心」(`account`)，仅允许执行登录与注册操作。
2. **导航与行为拦截**：
   - 试图访问非账户页面时，导航栏与路由必须提示 `“您当前未登录，请先在「账户」中登录或注册后使用此功能”` 并自动引导至账户页面。
   - 所有顶层快捷按钮（新建环境、启动、批量停止、导入、导出、回收站等）必须在第一行校验登录状态。

---

## 4. 核心规范：服务端双端（Cloudflare & Docker）一致性

本项目服务端采用双部署形态（Cloudflare Serverless 与 自建 Docker 容器）：
- 修改 `server/cf/src/` 中的任何 API 或页面逻辑时，**必须**同步更新 `server/docker/src/`（包括 `index.ts` 与 `admin_html.ts`）。
- 确保 D1 与本地 SQLite 的 SQL 语法兼顾兼容（使用通用 SQLite 方言）。

---

## 5. 构建与验证工作流

修改代码后，严禁只构建前端，必须确保最终可执行文件（`.exe`）或服务部署产物同步编译交付：

1. **前端类型校验与打包**：
   ```bash
   pnpm --filter @narc/desktop build
   ```
2. **全量 Release 生成（输出最新 `.exe`）**：
   ```bash
   pnpm app:release
   ```
   - 产物位置：`target/release/narrc-desktop.exe`
3. **服务端发布/验证**：
   - Docker 端：`pnpm --filter @narc/server-docker build`
   - Cloudflare 端：`pnpm --filter @narc/server-cf deploy`
