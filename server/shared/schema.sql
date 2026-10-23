-- ===================================================================
-- NarciPHBrowser Universal RBAC Database Schema
-- Compatible with Cloudflare D1 (SQLite) and Docker (SQLite / PostgreSQL)
-- ===================================================================

-- 1. 外部认证主表 (Authentication Accounts)
CREATE TABLE IF NOT EXISTS sys_account (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(128) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    status VARCHAR(16) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sys_account_email ON sys_account(email);

-- 2. 团队/租户空间表 (Teams / Tenants)
CREATE TABLE IF NOT EXISTS sys_team (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    owner_account_id VARCHAR(36) NOT NULL,
    plan_tier VARCHAR(16) DEFAULT 'free',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sys_team_owner ON sys_team(owner_account_id);

-- 3. 细粒度原子权限字典表 (Permission Definitions)
CREATE TABLE IF NOT EXISTS sys_permission (
    id VARCHAR(64) PRIMARY KEY,
    module VARCHAR(32) NOT NULL,
    action VARCHAR(32) NOT NULL,
    name VARCHAR(64) NOT NULL,
    description TEXT,
    risk_level VARCHAR(16) DEFAULT 'low'
);

-- 4. 角色表 (Roles)
CREATE TABLE IF NOT EXISTS sys_role (
    id VARCHAR(36) PRIMARY KEY,
    team_id VARCHAR(36),               -- NULL 代表系统全局预设角色
    code VARCHAR(32) NOT NULL,
    name VARCHAR(64) NOT NULL,
    is_system BOOLEAN DEFAULT 0,
    max_profiles INT DEFAULT 3,         -- 配额：最多环境数
    max_concurrent INT DEFAULT 1,       -- 配额：最大并发浏览器窗口数
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. 角色与权限多对多关联表 (Role Permissions)
CREATE TABLE IF NOT EXISTS sys_role_permission (
    role_id VARCHAR(36) NOT NULL,
    permission_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (role_id, permission_id)
);

-- 6. 权限内部用户成员表 (Internal Team Members)
CREATE TABLE IF NOT EXISTS sys_internal_user (
    id VARCHAR(36) PRIMARY KEY,
    team_id VARCHAR(36) NOT NULL,
    account_id VARCHAR(36) NOT NULL,
    nickname VARCHAR(64) NOT NULL,
    role_id VARCHAR(36) NOT NULL,
    data_scope VARCHAR(16) DEFAULT 'ALL', -- ALL, GROUP, OWN
    status VARCHAR(16) DEFAULT 'active',
    perm_version INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(team_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_user_team ON sys_internal_user(team_id);
CREATE INDEX IF NOT EXISTS idx_internal_user_account ON sys_internal_user(account_id);

-- 7. 用户特例权限覆盖表 (Permission Overrides)
CREATE TABLE IF NOT EXISTS sys_user_permission_override (
    team_id VARCHAR(36) NOT NULL,
    internal_user_id VARCHAR(36) NOT NULL,
    permission_id VARCHAR(64) NOT NULL,
    effect VARCHAR(8) NOT NULL,         -- 'ALLOW' (额外允许), 'DENY' (显式拒绝)
    PRIMARY KEY (team_id, internal_user_id, permission_id)
);

-- 8. 数据范围授权关联表 (Data Scope Grants)
CREATE TABLE IF NOT EXISTS sys_data_scope_grant (
    team_id VARCHAR(36) NOT NULL,
    internal_user_id VARCHAR(36) NOT NULL,
    scope_type VARCHAR(16) NOT NULL,    -- 'GROUP' (分组), 'PROFILE' (指定环境)
    target_id VARCHAR(64) NOT NULL,     -- group_id 或 profile_id
    PRIMARY KEY (team_id, internal_user_id, scope_type, target_id)
);

-- 9. 安全合规审计日志表 (Audit Logs)
CREATE TABLE IF NOT EXISTS sys_audit_log (
    id VARCHAR(36) PRIMARY KEY,
    team_id VARCHAR(36) NOT NULL,
    internal_user_id VARCHAR(36) NOT NULL,
    account_id VARCHAR(36) NOT NULL,
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(32),
    resource_id VARCHAR(64),
    details TEXT,
    ip VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_team ON sys_audit_log(team_id);

-- ===================================================================
-- 初始化预设数据 (Seed Permissions & Default Roles)
-- ===================================================================

-- 权限字典初始化
INSERT OR IGNORE INTO sys_permission (id, module, action, name, description, risk_level) VALUES
-- 环境权限
('profile:list', 'profile', 'list', '查看环境列表', '查看受管环境基本信息与状态', 'low'),
('profile:create', 'profile', 'create', '新建环境', '创建新的指纹浏览器配置文件', 'low'),
('profile:launch', 'profile', 'launch', '启动浏览器', '打开 Camoufox 进行日常操作', 'low'),
('profile:stop', 'profile', 'stop', '停止浏览器', '关闭正在运行中的指纹浏览器', 'low'),
('profile:edit_basic', 'profile', 'edit_basic', '编辑基础信息', '修改环境名称、备注与所属分组', 'low'),
('profile:edit_fingerprint', 'profile', 'edit_fingerprint', '修改底层指纹', '修改 Canvas/WebGL/MAC/操作系统伪装', 'high'),
('profile:export', 'profile', 'export', '导出环境', '导出配置文件和敏感 Cookies 凭据', 'critical'),
('profile:import', 'profile', 'import', '导入环境', '批量导入外部配置文件', 'medium'),
('profile:trash', 'profile', 'trash', '移入废纸篓', '将环境标记废弃移入回收站', 'medium'),
('profile:delete', 'profile', 'delete', '永久删除', '彻底清除粉碎环境与本地数据', 'critical'),

-- 代理网络权限
('proxy:use', 'proxy', 'use', '使用代理节点', '允许分配与挂载代理访问网络', 'low'),
('proxy:view_credential', 'proxy', 'view_credential', '查看代理明文账密', '查看代理节点的账号密码', 'high'),
('proxy:manage', 'proxy', 'manage', '管理代理节点', '增删改节点与订阅源', 'medium'),
('proxy:edit_routing', 'proxy', 'edit_routing', '修改分流规则', '修改完美分流或自定义路由', 'high'),

-- 团队与成员权限
('member:read', 'member', 'read', '查看团队成员', '查看成员列表与角色状态', 'low'),
('member:invite', 'member', 'invite', '邀请成员', '邀请新成员加入团队', 'medium'),
('member:assign_role', 'member', 'assign_role', '分配角色权限', '修改下属成员的角色与权限', 'high'),
('member:remove', 'member', 'remove', '移除成员', '将成员移出团队并注销权限', 'high'),
('role:manage', 'role', 'manage', '管理自定义角色', '增删改团队角色与权限组', 'high'),

-- 审计与系统
('audit:read', 'audit', 'read', '查看审计日志', '查看关键操作与登录审计', 'medium');

-- 系统内置角色定义
-- 1. basic_user: 自主注册用户的默认受限角色 (最简单的事情: 列表/新建[限3个]/启动/停止/改备注/移废纸篓/用代理)
INSERT OR IGNORE INTO sys_role (id, team_id, code, name, is_system, max_profiles, max_concurrent) VALUES
('role_basic_default', NULL, 'basic_user', '基础体验用户', 1, 3, 1),
('role_operator_default', NULL, 'operator', '业务运营员', 1, 30, 5),
('role_admin_default', NULL, 'admin', '团队管理员', 1, 200, 20),
('role_owner_default', NULL, 'owner', '团队拥有者', 1, 1000, 50);

-- 基础体验角色 (basic_user) 仅挂载基础权限
INSERT OR IGNORE INTO sys_role_permission (role_id, permission_id) VALUES
('role_basic_default', 'profile:list'),
('role_basic_default', 'profile:create'),
('role_basic_default', 'profile:launch'),
('role_basic_default', 'profile:stop'),
('role_basic_default', 'profile:edit_basic'),
('role_basic_default', 'profile:trash'),
('role_basic_default', 'proxy:use');

-- 业务运营员角色 (operator)
INSERT OR IGNORE INTO sys_role_permission (role_id, permission_id) VALUES
('role_operator_default', 'profile:list'),
('role_operator_default', 'profile:create'),
('role_operator_default', 'profile:launch'),
('role_operator_default', 'profile:stop'),
('role_operator_default', 'profile:edit_basic'),
('role_operator_default', 'profile:trash'),
('role_operator_default', 'proxy:use'),
('role_operator_default', 'proxy:manage');

-- 团队管理员角色 (admin)
INSERT OR IGNORE INTO sys_role_permission (role_id, permission_id) VALUES
('role_admin_default', 'profile:list'),
('role_admin_default', 'profile:create'),
('role_admin_default', 'profile:launch'),
('role_admin_default', 'profile:stop'),
('role_admin_default', 'profile:edit_basic'),
('role_admin_default', 'profile:edit_fingerprint'),
('role_admin_default', 'profile:trash'),
('role_admin_default', 'profile:import'),
('role_admin_default', 'proxy:use'),
('role_admin_default', 'proxy:manage'),
('role_admin_default', 'proxy:edit_routing'),
('role_admin_default', 'member:read'),
('role_admin_default', 'member:invite'),
('role_admin_default', 'member:assign_role'),
('role_admin_default', 'member:remove'),
('role_admin_default', 'audit:read');

-- 团队拥有者角色 (owner) 挂载所有权限
INSERT OR IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT 'role_owner_default', id FROM sys_permission;

-- 默认超级管理员账号 (邮箱: admin@narc.com, 密码: admin123456)
INSERT OR IGNORE INTO sys_account (id, email, password_hash, salt, status) VALUES
('acc_admin_default', 'admin@narc.com', '04a5e9f581102fe9c0b7ada636d14c542308b061ca35d9d4094c6b5356793fe0', '3693ee660a0ca10d135ab426ffdadb9b', 'active');

INSERT OR IGNORE INTO sys_team (id, name, owner_account_id, plan_tier) VALUES
('team_admin_default', '系统管理总空间', 'acc_admin_default', 'enterprise');

INSERT OR IGNORE INTO sys_internal_user (id, team_id, account_id, nickname, role_id, data_scope, status) VALUES
('user_admin_default', 'team_admin_default', 'acc_admin_default', '超级管理员', 'role_owner_default', 'ALL', 'active');
