export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type SystemRoleCode = 'basic_user' | 'operator' | 'admin' | 'owner';

export interface UiTabDef {
  key: string;
  name: string;
  shortName: string;
  icon: string;
  description: string;
}

export interface UiGroupDef {
  section: string;
  badge: string;
}

export interface PermissionMetadata {
  id: string; // 唯一权限代码，如 'profile:launch'
  module: string;
  action: string;
  name: string;
  description: string;
  risk_level: RiskLevel;
  riskLabel?: string;
  // UI 视觉模式映射（用于自动聚合生成用户模式权限树）
  uiTab: UiTabDef;
  uiGroup: UiGroupDef;
  uiPosition: string; // 界面具体位置，如 "列表行「▶ 启动」"
  // 默认授予的内置系统角色
  defaultRoles: SystemRoleCode[];
}

// ========== 预设 App UI 顶层分类标签 ==========
const UI_TABS = {
  PROFILES: {
    key: 'profiles',
    name: '配置文件 (Profiles)',
    shortName: '配置文件',
    icon: '📁',
    description: '核心防关联浏览器环境管理中心',
  },
  GROUPS: {
    key: 'groups',
    name: '分组协同 (Groups)',
    shortName: '分组协同',
    icon: '👥',
    description: '多账号批量归类与业务分组隔离',
  },
  PROXIES: {
    key: 'proxies',
    name: '网络代理 (Proxies)',
    shortName: '网络代理',
    icon: '🌐',
    description: '原生代理网络、订阅池与流量分流体系',
  },
  EXTENSIONS: {
    key: 'extensions',
    name: '扩展插件 (Extensions)',
    shortName: '扩展插件',
    icon: '🧩',
    description: 'Chrome / Firefox 商店与自定义 CRX 插件中心',
  },
  AGENT: {
    key: 'agent',
    name: 'AI 智能体 / 自动化 (Automation & Agent)',
    shortName: '自动化',
    icon: '🤖',
    description: '端侧 AI 自动化驱动与批量 RPA 任务执行',
  },
  INTEGRATIONS: {
    key: 'integrations',
    name: '第三方集成 (Integrations)',
    shortName: '接口集成',
    icon: '🔌',
    description: 'Local REST API 与外部调度驱动',
  },
  TEAM_RBAC: {
    key: 'team_rbac',
    name: '团队协同与特权管控 (Team & RBAC)',
    shortName: '团队与权限',
    icon: '🛡️',
    description: '组织架构、成员管理与自定义权限中枢',
  },
} as const;

/**
 * 🌟 核心单一数据源 (Single Source of Truth - SSOT)
 * 整个系统的权限代码、名称、说明、风控级别、默认角色分配、以及管理后台用户视觉树映射，全部在此处统一定义！
 * 新增功能时，只需在此数组增加一项，数据库与后台视觉树自动全量同步！
 */
export const PERMISSION_REGISTRY: PermissionMetadata[] = [
  // -------------------- 配置文件模块 --------------------
  {
    id: 'profile:list',
    module: 'profile',
    action: 'list',
    name: '浏览环境列表',
    description: '进入配置文件中心、浏览受管指纹环境列表与状态',
    risk_level: 'low',
    uiTab: UI_TABS.PROFILES,
    uiGroup: { section: '页面访问与基础信息', badge: '基础' },
    uiPosition: '一级页面访问',
    defaultRoles: ['basic_user', 'operator', 'admin', 'owner'],
  },
  {
    id: 'profile:edit_basic',
    module: 'profile',
    action: 'edit_basic',
    name: '编辑基本信息',
    description: '修改环境名称、自定义备注、所属分组及标签',
    risk_level: 'low',
    uiTab: UI_TABS.PROFILES,
    uiGroup: { section: '页面访问与基础信息', badge: '基础' },
    uiPosition: '列表行「编辑」',
    defaultRoles: ['basic_user', 'operator', 'admin', 'owner'],
  },
  {
    id: 'profile:create',
    module: 'profile',
    action: 'create',
    name: '新建环境按钮',
    description: '创建新的隔离指纹浏览器配置文件',
    risk_level: 'low',
    uiTab: UI_TABS.PROFILES,
    uiGroup: { section: '顶部操作栏按钮', badge: '工具栏' },
    uiPosition: '顶部「+ 新建」',
    defaultRoles: ['basic_user', 'operator', 'admin', 'owner'],
  },
  {
    id: 'profile:import',
    module: 'profile',
    action: 'import',
    name: '导入配置按钮',
    description: '批量导入第三方或外部指纹配置与数据',
    risk_level: 'medium',
    uiTab: UI_TABS.PROFILES,
    uiGroup: { section: '顶部操作栏按钮', badge: '工具栏' },
    uiPosition: '顶部「导入」',
    defaultRoles: ['admin', 'owner'],
  },
  {
    id: 'profile:export',
    module: 'profile',
    action: 'export',
    name: '导出配置与凭据',
    description: '导出环境 Cookies、密码及本地凭据数据',
    risk_level: 'critical',
    riskLabel: '高危防外泄',
    uiTab: UI_TABS.PROFILES,
    uiGroup: { section: '顶部操作栏按钮', badge: '工具栏' },
    uiPosition: '顶部「导出」/ 菜单',
    defaultRoles: ['owner'],
  },
  {
    id: 'profile:launch',
    module: 'profile',
    action: 'launch',
    name: '启动浏览器按钮',
    description: '拉起 Camoufox 防关联内核并载入专属指纹',
    risk_level: 'low',
    uiTab: UI_TABS.PROFILES,
    uiGroup: { section: '列表行内与快捷操作', badge: '行内控件' },
    uiPosition: '列表行「▶ 启动」',
    defaultRoles: ['basic_user', 'operator', 'admin', 'owner'],
  },
  {
    id: 'profile:stop',
    module: 'profile',
    action: 'stop',
    name: '停止浏览器按钮',
    description: '关闭正在运行中的指纹浏览器实例',
    risk_level: 'low',
    uiTab: UI_TABS.PROFILES,
    uiGroup: { section: '列表行内与快捷操作', badge: '行内控件' },
    uiPosition: '列表行「⏹ 停止」',
    defaultRoles: ['basic_user', 'operator', 'admin', 'owner'],
  },
  {
    id: 'profile:trash',
    module: 'profile',
    action: 'trash',
    name: '移入废纸篓按钮',
    description: '将环境停用并归档到回收废纸篓暂存',
    risk_level: 'medium',
    uiTab: UI_TABS.PROFILES,
    uiGroup: { section: '列表行内与快捷操作', badge: '行内控件' },
    uiPosition: '列表行「🗑 移入废纸篓」',
    defaultRoles: ['basic_user', 'operator', 'admin', 'owner'],
  },
  {
    id: 'profile:edit_fingerprint',
    module: 'profile',
    action: 'edit_fingerprint',
    name: '修改底层硬件指纹',
    description: '修改 Canvas / WebGL / Audio / MAC / 操作系统特征伪装',
    risk_level: 'high',
    riskLabel: '硬件伪装',
    uiTab: UI_TABS.PROFILES,
    uiGroup: { section: '底层指纹伪装与高危销毁', badge: '高危特权' },
    uiPosition: '配置弹窗「高级伪装」',
    defaultRoles: ['admin', 'owner'],
  },
  {
    id: 'profile:delete',
    module: 'profile',
    action: 'delete',
    name: '永久粉碎环境',
    description: '彻底从硬盘清除粉碎指纹环境与全部缓存数据',
    risk_level: 'critical',
    riskLabel: '不可逆清除',
    uiTab: UI_TABS.PROFILES,
    uiGroup: { section: '底层指纹伪装与高危销毁', badge: '高危特权' },
    uiPosition: '废纸篓「永久删除」',
    defaultRoles: ['owner'],
  },

  // -------------------- 分组协同模块 --------------------
  // (可与 profile:list, profile:edit_basic 复用，也可单独登记)

  // -------------------- 代理网络模块 --------------------
  {
    id: 'proxy:use',
    module: 'proxy',
    action: 'use',
    name: '挂载与使用代理',
    description: '允许为环境绑定代理节点并进行网络中继',
    risk_level: 'low',
    uiTab: UI_TABS.PROXIES,
    uiGroup: { section: '页面访问与使用', badge: '基础网络' },
    uiPosition: '一级页面 / 环境网络绑定',
    defaultRoles: ['basic_user', 'operator', 'admin', 'owner'],
  },
  {
    id: 'proxy:manage',
    module: 'proxy',
    action: 'manage',
    name: '管理代理池与订阅',
    description: '增删改团队代理节点、批量测试延迟及订阅更新',
    risk_level: 'medium',
    uiTab: UI_TABS.PROXIES,
    uiGroup: { section: '节点管理与路由规则', badge: '路由管控' },
    uiPosition: '顶部「+ 添加/导入」',
    defaultRoles: ['operator', 'admin', 'owner'],
  },
  {
    id: 'proxy:edit_routing',
    module: 'proxy',
    action: 'edit_routing',
    name: '修改完美分流规则',
    description: '配置规则集、直连/代理分流、域名嗅探与劫持',
    risk_level: 'high',
    riskLabel: '高危路由',
    uiTab: UI_TABS.PROXIES,
    uiGroup: { section: '节点管理与路由规则', badge: '路由管控' },
    uiPosition: '路由「高级规则设置」',
    defaultRoles: ['admin', 'owner'],
  },
  {
    id: 'proxy:view_credential',
    module: 'proxy',
    action: 'view_credential',
    name: '查看代理明文账密',
    description: '直接查看代理服务器的明文认证账号与密码',
    risk_level: 'high',
    riskLabel: '高危凭据',
    uiTab: UI_TABS.PROXIES,
    uiGroup: { section: '明文凭据安全保护', badge: '凭据风控' },
    uiPosition: '节点列表「👁 查看密码」',
    defaultRoles: ['owner'],
  },

  // -------------------- 团队协同与特权管控 --------------------
  {
    id: 'member:read',
    module: 'member',
    action: 'read',
    name: '查看团队成员列表',
    description: '浏览团队所有席位成员、邮箱与在线状态',
    risk_level: 'low',
    uiTab: UI_TABS.TEAM_RBAC,
    uiGroup: { section: '成员管理组件', badge: '成员' },
    uiPosition: '成员中心「列表」',
    defaultRoles: ['admin', 'owner'],
  },
  {
    id: 'member:invite',
    module: 'member',
    action: 'invite',
    name: '邀请新成员按钮',
    description: '向外部用户发送加入团队的邀请凭据',
    risk_level: 'medium',
    uiTab: UI_TABS.TEAM_RBAC,
    uiGroup: { section: '成员管理组件', badge: '成员' },
    uiPosition: '成员中心「+ 邀请成员」',
    defaultRoles: ['admin', 'owner'],
  },
  {
    id: 'member:remove',
    module: 'member',
    action: 'remove',
    name: '移除与停用成员',
    description: '注销成员权限、强制下线并收回席位配额',
    risk_level: 'high',
    riskLabel: '高危管理',
    uiTab: UI_TABS.TEAM_RBAC,
    uiGroup: { section: '成员管理组件', badge: '成员' },
    uiPosition: '行内「移出团队」',
    defaultRoles: ['admin', 'owner'],
  },
  {
    id: 'member:assign_role',
    module: 'member',
    action: 'assign_role',
    name: '分配成员角色',
    description: '修改下属成员的系统角色（运营员/管理员）',
    risk_level: 'high',
    riskLabel: '特权变动',
    uiTab: UI_TABS.TEAM_RBAC,
    uiGroup: { section: '角色与特权中枢', badge: '特权' },
    uiPosition: '成员行「角色变更」',
    defaultRoles: ['admin', 'owner'],
  },
  {
    id: 'role:manage',
    module: 'role',
    action: 'manage',
    name: '增删改安全角色',
    description: '创建自定义安全角色、自由勾选分配细粒度原子权限',
    risk_level: 'high',
    riskLabel: '核心RBAC',
    uiTab: UI_TABS.TEAM_RBAC,
    uiGroup: { section: '角色与特权中枢', badge: '特权' },
    uiPosition: '角色管理「+ 新增/编辑角色」',
    defaultRoles: ['owner'],
  },
  {
    id: 'audit:read',
    module: 'audit',
    action: 'read',
    name: '查看系统审计日志',
    description: '调阅敏感操作审计、登录凭证记录与调用追踪',
    risk_level: 'medium',
    uiTab: UI_TABS.TEAM_RBAC,
    uiGroup: { section: '安全与合规审计', badge: '合规' },
    uiPosition: '审计中心「操作日志」',
    defaultRoles: ['admin', 'owner'],
  },
];

// 兼容常量字典映射
export const PERMISSIONS = {
  // 环境
  PROFILE_LIST: 'profile:list',
  PROFILE_CREATE: 'profile:create',
  PROFILE_LAUNCH: 'profile:launch',
  PROFILE_STOP: 'profile:stop',
  PROFILE_EDIT_BASIC: 'profile:edit_basic',
  PROFILE_EDIT_FINGERPRINT: 'profile:edit_fingerprint',
  PROFILE_EXPORT: 'profile:export',
  PROFILE_IMPORT: 'profile:import',
  PROFILE_TRASH: 'profile:trash',
  PROFILE_DELETE: 'profile:delete',

  // 代理
  PROXY_USE: 'proxy:use',
  PROXY_VIEW_CREDENTIAL: 'proxy:view_credential',
  PROXY_MANAGE: 'proxy:manage',
  PROXY_EDIT_ROUTING: 'proxy:edit_routing',

  // 成员与角色
  MEMBER_READ: 'member:read',
  MEMBER_INVITE: 'member:invite',
  MEMBER_ASSIGN_ROLE: 'member:assign_role',
  MEMBER_REMOVE: 'member:remove',
  ROLE_MANAGE: 'role:manage',

  // 审计
  AUDIT_READ: 'audit:read',
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * 自动聚合生成管理后台所需的 UI 视觉模式权限树
 * 不再需要人工在 HTML 中维护重复的层级树，直接由 SSOT 自动计算！
 */
export function getUiPermissionTree() {
  const tabsMap = new Map<string, any>();

  for (const item of PERMISSION_REGISTRY) {
    const tabKey = item.uiTab.key;
    if (!tabsMap.has(tabKey)) {
      tabsMap.set(tabKey, {
        key: tabKey,
        name: item.uiTab.name,
        shortName: item.uiTab.shortName,
        icon: item.uiTab.icon,
        description: item.uiTab.description,
        groups: [],
      });
    }

    const tab = tabsMap.get(tabKey);
    let group = tab.groups.find((g: any) => g.section === item.uiGroup.section);
    if (!group) {
      group = {
        section: item.uiGroup.section,
        badge: item.uiGroup.badge,
        perms: [],
      };
      tab.groups.push(group);
    }

    group.perms.push({
      id: item.id,
      name: item.name,
      uiPosition: item.uiPosition,
      desc: item.description,
      risk: item.risk_level,
      riskLabel: item.riskLabel,
    });
  }

  return Array.from(tabsMap.values());
}

/**
 * 服务端自动同步权限到数据库 (Auto-Seeder)
 * 无论使用 Cloudflare D1 还是 Docker SQLite，调用此方法均可完成自同步：
 * 1. 同步所有权限定义到 sys_permission (INSERT OR IGNORE + UPDATE 名称与描述)
 * 2. 同步系统内置角色的默认权限绑定 (INSERT OR IGNORE)
 */
export async function autoSyncPermissions(db: any): Promise<{ syncedPerms: number; totalPerms: number }> {
  // 1. 同步 sys_permission 表
  for (const p of PERMISSION_REGISTRY) {
    try {
      await db.prepare(`
        INSERT INTO sys_permission (id, module, action, name, description, risk_level)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          risk_level = excluded.risk_level
      `).bind(p.id, p.module, p.action, p.name, p.description, p.risk_level).run();
    } catch {
      // 兼容不支持 ON CONFLICT 的传统 SQLite
      try {
        await db.prepare(`
          INSERT OR IGNORE INTO sys_permission (id, module, action, name, description, risk_level)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(p.id, p.module, p.action, p.name, p.description, p.risk_level).run();
      } catch (err) {
        console.warn(`[PermSync] Failed to insert perm ${p.id}:`, err);
      }
    }
  }

  // 2. 绑定默认系统角色关联
  const roleCodeToIdMap: Record<SystemRoleCode, string> = {
    basic_user: 'role_basic_default',
    operator: 'role_operator_default',
    admin: 'role_admin_default',
    owner: 'role_owner_default',
  };

  for (const p of PERMISSION_REGISTRY) {
    // owner 默认全有
    try {
      await db.prepare('INSERT OR IGNORE INTO sys_role_permission (role_id, permission_id) VALUES (?, ?)')
        .bind('role_owner_default', p.id).run();
    } catch {}

    for (const roleCode of p.defaultRoles) {
      const roleId = roleCodeToIdMap[roleCode];
      if (roleId) {
        try {
          await db.prepare('INSERT OR IGNORE INTO sys_role_permission (role_id, permission_id) VALUES (?, ?)')
            .bind(roleId, p.id).run();
        } catch {}
      }
    }
  }

  return {
    syncedPerms: PERMISSION_REGISTRY.length,
    totalPerms: PERMISSION_REGISTRY.length,
  };
}

/**
 * 计算当前代码声明的权限注册表 (SSOT) 唯一哈希指纹
 * 只要新增权限、改动名称或改动默认角色分配，指纹哈希值必然改变
 */
export function getPermissionsFingerprint(): string {
  const raw = PERMISSION_REGISTRY.map(
    (p) => `${p.id}:${p.name}:${p.risk_level}:${p.defaultRoles.slice().sort().join(',')}`
  ).join(';');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return `ssot_${PERMISSION_REGISTRY.length}_${Math.abs(hash).toString(16)}`;
}

/**
 * 权限版本自检与静默自同步函数 (Auto-Sync Guard)
 * 1. 检查数据库 sys_system_meta 中记录的 permissions_fingerprint
 * 2. 若与当前代码中的指纹不一致，自动触发 autoSyncPermissions 并更新指纹
 * 3. 返回是否实际执行了同步更新 (true = 发现新版本并已同步, false = 保持最新无变化)
 */
export async function ensurePermissionsSynced(db: any): Promise<{ synced: boolean; fingerprint: string }> {
  const currentFingerprint = getPermissionsFingerprint();
  try {
    // 确保元数据表存在
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS sys_system_meta (
        key VARCHAR(64) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    const row = (await db.prepare('SELECT value FROM sys_system_meta WHERE key = ?')
      .bind('permissions_fingerprint').first()) as { value?: string } | null;

    if (row && row.value === currentFingerprint) {
      // 数据库中记录的指纹与当前代码完全一致，无需重复执行 SQL 写入
      return { synced: false, fingerprint: currentFingerprint };
    }

    // 指纹不存在或发生了变化，说明代码已升级新增了功能权限，立即静默自同步
    await autoSyncPermissions(db);

    // 记录最新指纹 (支持 ON CONFLICT DO UPDATE 与传统兼容)
    try {
      await db.prepare(`
        INSERT INTO sys_system_meta (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).bind('permissions_fingerprint', currentFingerprint).run();
    } catch {
      await db.prepare('INSERT OR REPLACE INTO sys_system_meta (key, value) VALUES (?, ?)')
        .bind('permissions_fingerprint', currentFingerprint).run();
    }

    console.log(`[AutoSync] 权限系统已自动静默同步至最新版本指纹: ${currentFingerprint}`);
    return { synced: true, fingerprint: currentFingerprint };
  } catch (err) {
    console.warn('[AutoSync] ensurePermissionsSynced 异常:', err);
    return { synced: false, fingerprint: currentFingerprint };
  }
}

/**
 * 核心权限判定计算函数（四步判定法：Owner放行 -> 显式DENY拒绝 -> 显式ALLOW放行 -> 角色权限合并）
 */
export function evaluatePermission(
  rolePermissions: Set<string>,
  overrides: Map<string, 'ALLOW' | 'DENY'>,
  requiredPermission: string,
  isOwner: boolean
): boolean {
  // 1. 团队 Owner 拥有绝对最高权限
  if (isOwner) return true;

  // 2. 检查特例覆盖表中的显式 DENY（拒绝优先原则）
  const override = overrides.get(requiredPermission);
  if (override === 'DENY') return false;

  // 3. 检查特例覆盖表中的显式 ALLOW
  if (override === 'ALLOW') return true;

  // 4. 检查用户绑定的角色权限集
  return rolePermissions.has(requiredPermission);
}
