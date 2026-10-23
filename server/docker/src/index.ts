import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPassword, verifyPassword, signJwt, verifyJwt } from '../../shared/crypto';
import { evaluatePermission, PERMISSIONS, getUiPermissionTree, autoSyncPermissions, ensurePermissionsSynced } from '../../shared/permissions';
import type { AuthUserTokenPayload } from '../../shared/types';
import { ADMIN_HTML } from './admin_html';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 初始化嵌入式 SQLite 数据库 (Web + SQLite 数据库跑在同一个容器内)
const DB_PATH = process.env.DB_PATH || '/data/narciph_rbac.db';
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// 自动检测并初始化数据库 Schema (schema.sql)
try {
  const schemaCandidates = [
    path.resolve('/app/schema.sql'),
    path.resolve(__dirname, '../schema.sql'),
    path.resolve(__dirname, '../../shared/schema.sql'),
    path.resolve(process.cwd(), 'schema.sql'),
    path.resolve(process.cwd(), 'server/shared/schema.sql'),
  ];
  const schemaPath = schemaCandidates.find((p) => fs.existsSync(p));
  if (schemaPath) {
    const checkTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sys_account'").get();
    if (!checkTable) {
      console.log(`[SQLite] Initializing database schema from ${schemaPath}...`);
      const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
      sqlite.exec(schemaSql);
      console.log('[SQLite] Schema initialization complete.');
    }
  }
} catch (err) {
  console.warn('[SQLite] Schema auto-init warning:', err);
}

// 轻量级 D1 兼容接口适配器 (实现零成本复用全部现有业务路由)
class SQLiteD1Adapter {
  constructor(private rawDb: Database.Database) {}

  prepare(sql: string) {
    const rawDb = this.rawDb;
    return {
      bind(...params: any[]) {
        return {
          async all<T = any>() {
            const stmt = rawDb.prepare(sql);
            const results = stmt.all(...params) as T[];
            return { results };
          },
          async first<T = any>() {
            const stmt = rawDb.prepare(sql);
            const result = stmt.get(...params) as T | undefined;
            return (result ?? null) as T | null;
          },
          async run() {
            const stmt = rawDb.prepare(sql);
            const meta = stmt.run(...params);
            return { success: true, meta };
          },
        };
      },
      async all<T = any>() {
        const stmt = rawDb.prepare(sql);
        const results = stmt.all() as T[];
        return { results };
      },
      async first<T = any>() {
        const stmt = rawDb.prepare(sql);
        const result = stmt.get() as T | undefined;
        return (result ?? null) as T | null;
      },
      async run() {
        const stmt = rawDb.prepare(sql);
        const meta = stmt.run();
        return { success: true, meta };
      },
    };
  }
}

const dbAdapter = new SQLiteD1Adapter(sqlite) as any;

type Bindings = {
  DB: any;
  JWT_SECRET: string;
};

type Variables = {
  authUser?: AuthUserTokenPayload;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 注入环境变量与数据库实例
app.use('*', async (c, next) => {
  (c as any).env = {
    DB: dbAdapter,
    JWT_SECRET: process.env.JWT_SECRET || 'narciph_docker_production_jwt_secret_secure_key',
  };
  await next();
});

// 跨域支持
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// 🌟 权限版本指纹静默自检中间件 (服务实例启动后首个请求自检，代码有新功能时静默自动同步)
let isPermCheckedInMemory = false;
app.use('/api/*', async (c, next) => {
  if (!isPermCheckedInMemory && c.env?.DB) {
    isPermCheckedInMemory = true;
    try {
      await ensurePermissionsSynced(c.env.DB);
    } catch (err) {
      console.warn('[AutoSync] Middleware sync check error:', err);
    }
  }
  await next();
});

// 管理后台 Web UI 页面 (根路径与 /admin)
app.get('/', (c) => c.html(ADMIN_HTML));
app.get('/admin', (c) => c.html(ADMIN_HTML));

// 1. 健康检查与系统信息
app.get('/api/v1/health', (c) => {
  return c.json({
    status: 'ok',
    version: '1.0.0',
    platform: 'Docker Container (All-In-One Node.js + Embedded SQLite)',
    port: process.env.PORT || 29988,
    db_path: DB_PATH,
    timestamp: new Date().toISOString(),
  });
});

// 辅助函数：生成 UUID
function generateId(): string {
  return crypto.randomUUID();
}

// 辅助函数：根据 internal_user_id 计算最终有效权限集合
async function compileUserPermissions(db: D1Database, internalUserId: string, roleId: string, isOwner: boolean): Promise<{
  permissions: string[];
  quotas: { max_profiles: number; max_concurrent: number };
  role_code: string;
  role_name: string;
}> {
  // 1. 获取角色基本信息与配额
  const role = await db.prepare('SELECT code, name, max_profiles, max_concurrent FROM sys_role WHERE id = ?').bind(roleId).first<{
    code: string;
    name: string;
    max_profiles: number;
    max_concurrent: number;
  }>();

  // 2. 获取角色关联的权限
  const rolePermRows = await db.prepare('SELECT permission_id FROM sys_role_permission WHERE role_id = ?').bind(roleId).all<{ permission_id: string }>();
  const rolePermSet = new Set((rolePermRows.results || []).map(r => r.permission_id));

  // 3. 获取个人特例覆盖表
  const overrideRows = await db.prepare('SELECT permission_id, effect FROM sys_user_permission_override WHERE internal_user_id = ?').bind(internalUserId).all<{ permission_id: string; effect: 'ALLOW' | 'DENY' }>();
  const overrideMap = new Map((overrideRows.results || []).map(r => [r.permission_id, r.effect]));

  // 4. 获取所有可用权限列表并计算最终生效结果
  const allPerms = await db.prepare('SELECT id FROM sys_permission').all<{ id: string }>();
  const effective: string[] = [];

  for (const p of allPerms.results || []) {
    if (evaluatePermission(rolePermSet, overrideMap, p.id, isOwner)) {
      effective.push(p.id);
    }
  }

  return {
    permissions: effective,
    quotas: {
      max_profiles: role?.max_profiles ?? 3,
      max_concurrent: role?.max_concurrent ?? 1,
    },
    role_code: role?.code || 'basic_user',
    role_name: role?.name || '基础体验用户',
  };
}

// 2. 自主注册接口 (带预设基础体验权限，受控沙箱)
app.post('/api/v1/auth/register', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password || password.length < 6) {
    return c.json({ success: false, message: '请输入有效的邮箱和不少于6位的密码' }, 400);
  }

  const db = c.env.DB;
  const existing = await db.prepare('SELECT id FROM sys_account WHERE email = ?').bind(email).first();
  if (existing) {
    return c.json({ success: false, message: '该邮箱已被注册，请直接登录' }, 400);
  }

  const { hash, salt } = await hashPassword(password);
  const accountId = generateId();
  const teamId = generateId();
  const internalUserId = generateId();
  const nickname = email.split('@')[0];

  // 预置默认角色：基础体验用户角色
  const defaultRole = await db.prepare("SELECT id FROM sys_role WHERE code = 'basic_user'").first<{ id: string }>();
  const roleId = defaultRole?.id || 'role_basic_default';

  // 使用 D1 batch 执行原子事务
  await db.batch([
    // 创建认证账户
    db.prepare('INSERT INTO sys_account (id, email, password_hash, salt, status) VALUES (?, ?, ?, ?, ?)').bind(accountId, email, hash, salt, 'active'),
    // 创建专属默认团队
    db.prepare('INSERT INTO sys_team (id, name, owner_account_id, plan_tier) VALUES (?, ?, ?, ?)').bind(teamId, `${nickname}的空间`, accountId, 'free'),
    // 创建内部用户并绑定受限的基础体验角色
    db.prepare("INSERT INTO sys_internal_user (id, team_id, account_id, nickname, role_id, data_scope, status) VALUES (?, ?, ?, ?, ?, 'OWN', 'active')").bind(internalUserId, teamId, accountId, nickname, roleId),
  ]);

  const { permissions, quotas, role_code, role_name } = await compileUserPermissions(db, internalUserId, roleId, false);

  const secret = c.env.JWT_SECRET || 'narciph_secret_fallback';
  const tokenPayload: AuthUserTokenPayload = {
    account_id: accountId,
    email,
    team_id: teamId,
    internal_user_id: internalUserId,
    role_code,
    permissions,
    perm_version: 1,
    quotas,
    exp: Math.floor(Date.now() / 1000) + 7 * 86400, // 7 天有效
  };

  const token = await signJwt(tokenPayload as unknown as Record<string, unknown>, secret);

  return c.json({
    success: true,
    message: '注册成功，已自动初始化基础体验权限',
    token,
    user: {
      account_id: accountId,
      email,
      team_id: teamId,
      team_name: `${nickname}的空间`,
      internal_user_id: internalUserId,
      nickname,
      role_code,
      role_name,
      permissions,
      quotas,
    },
  });
});

// 3. 登录接口
app.post('/api/v1/auth/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return c.json({ success: false, message: '请输入邮箱和密码' }, 400);
  }

  const db = c.env.DB;
  const account = await db.prepare('SELECT id, email, password_hash, salt, status FROM sys_account WHERE email = ?').bind(email).first<{
    id: string;
    email: string;
    password_hash: string;
    salt: string;
    status: string;
  }>();

  if (!account) {
    return c.json({ success: false, message: '账号不存在或密码错误' }, 401);
  }

  if (account.status !== 'active') {
    return c.json({ success: false, message: '该账号已被冻结停用' }, 403);
  }

  const valid = await verifyPassword(password, account.password_hash, account.salt);
  if (!valid) {
    return c.json({ success: false, message: '账号不存在或密码错误' }, 401);
  }

  // 查询用户的团队身份
  const internalUser = await db.prepare(`
    SELECT u.id, u.team_id, u.nickname, u.role_id, u.perm_version, t.name as team_name, t.owner_account_id
    FROM sys_internal_user u
    JOIN sys_team t ON u.team_id = t.id
    WHERE u.account_id = ?
    LIMIT 1
  `).bind(account.id).first<{
    id: string;
    team_id: string;
    nickname: string;
    role_id: string;
    perm_version: number;
    team_name: string;
    owner_account_id: string;
  }>();

  if (!internalUser) {
    return c.json({ success: false, message: '未找到关联的内部成员，请联系管理员' }, 403);
  }

  const isOwner = internalUser.owner_account_id === account.id;
  const { permissions, quotas, role_code, role_name } = await compileUserPermissions(db, internalUser.id, internalUser.role_id, isOwner);

  const secret = c.env.JWT_SECRET || 'narciph_secret_fallback';
  const tokenPayload: AuthUserTokenPayload = {
    account_id: account.id,
    email: account.email,
    team_id: internalUser.team_id,
    internal_user_id: internalUser.id,
    role_code,
    permissions,
    perm_version: internalUser.perm_version,
    quotas,
    exp: Math.floor(Date.now() / 1000) + 7 * 86400,
  };

  const token = await signJwt(tokenPayload as unknown as Record<string, unknown>, secret);

  return c.json({
    success: true,
    message: '登录成功',
    token,
    user: {
      account_id: account.id,
      email: account.email,
      team_id: internalUser.team_id,
      team_name: internalUser.team_name,
      internal_user_id: internalUser.id,
      nickname: internalUser.nickname,
      role_code,
      role_name,
      permissions,
      quotas,
    },
  });
});

// 4. JWT 鉴权中间件
const requireAuth = async (c: any, next: () => Promise<void>) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, message: '未提供访问令牌，请先登录' }, 401);
  }

  const token = authHeader.substring(7);
  const secret = c.env.JWT_SECRET || 'narciph_secret_fallback';
  const payload = await verifyJwt<AuthUserTokenPayload>(token, secret);

  if (!payload) {
    return c.json({ success: false, message: '访问令牌已失效或过期，请重新登录' }, 401);
  }

  c.set('authUser', payload);
  await next();
};

// 5. 获取当前个人信息及最新权限
app.get('/api/v1/auth/me', requireAuth, async (c) => {
  const user = c.get('authUser')!;
  const db = c.env.DB;

  const internalUser = await db.prepare(`
    SELECT u.id, u.team_id, u.nickname, u.role_id, t.name as team_name, t.owner_account_id
    FROM sys_internal_user u
    JOIN sys_team t ON u.team_id = t.id
    WHERE u.id = ?
  `).bind(user.internal_user_id).first<{
    id: string;
    team_id: string;
    nickname: string;
    role_id: string;
    team_name: string;
    owner_account_id: string;
  }>();

  if (!internalUser) {
    return c.json({ success: false, message: '用户不存在' }, 404);
  }

  const isOwner = internalUser.owner_account_id === user.account_id;
  const { permissions, quotas, role_code, role_name } = await compileUserPermissions(db, internalUser.id, internalUser.role_id, isOwner);

  return c.json({
    success: true,
    user: {
      account_id: user.account_id,
      email: user.email,
      team_id: internalUser.team_id,
      team_name: internalUser.team_name,
      internal_user_id: internalUser.id,
      nickname: internalUser.nickname,
      role_code,
      role_name,
      permissions,
      quotas,
    },
  });
});

// 6. 环境启动/导出/修改 权限预检接口 (供客户端在执行敏感操作前轻量调用)
app.post('/api/v1/teams/:teamId/profiles/:profileId/preflight', requireAuth, async (c) => {
  const user = c.get('authUser')!;
  const body = await c.req.json<{ action: 'launch' | 'export' | 'delete' | 'edit_fingerprint' }>();
  const action = body.action || 'launch';

  const permMap = {
    launch: PERMISSIONS.PROFILE_LAUNCH,
    export: PERMISSIONS.PROFILE_EXPORT,
    delete: PERMISSIONS.PROFILE_DELETE,
    edit_fingerprint: PERMISSIONS.PROFILE_EDIT_FINGERPRINT,
  };

  const requiredPerm = permMap[action];
  const allowed = user.permissions.includes(requiredPerm);

  if (!allowed) {
    return c.json({
      allowed: false,
      reason: `您当前角色 [${user.role_code}] 无权执行 [${action}] 操作`,
    }, 403);
  }

  return c.json({ allowed: true });
});

// 7. 团队成员管理接口 (需要 member:read)
app.get('/api/v1/teams/:teamId/members', requireAuth, async (c) => {
  const user = c.get('authUser')!;
  if (!user.permissions.includes(PERMISSIONS.MEMBER_READ)) {
    return c.json({ success: false, message: '无权查看团队成员列表' }, 403);
  }

  const db = c.env.DB;
  const members = await db.prepare(`
    SELECT u.id, u.nickname, u.status, u.data_scope, u.created_at, a.email, r.code as role_code, r.name as role_name
    FROM sys_internal_user u
    JOIN sys_account a ON u.account_id = a.id
    JOIN sys_role r ON u.role_id = r.id
    WHERE u.team_id = ?
    ORDER BY u.created_at ASC
  `).bind(user.team_id).all();

  return c.json({ success: true, members: members.results || [] });
});

// 8. 审计日志上报
app.post('/api/v1/teams/:teamId/audit/report', requireAuth, async (c) => {
  const user = c.get('authUser')!;
  const body = await c.req.json<{ action: string; resource_type?: string; resource_id?: string; details?: string }>();
  const db = c.env.DB;

  const id = generateId();
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || '127.0.0.1';
  const ua = c.req.header('User-Agent') || '';

  await db.prepare(`
    INSERT INTO sys_audit_log (id, team_id, internal_user_id, account_id, action, resource_type, resource_id, details, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.team_id, user.internal_user_id, user.account_id, body.action, body.resource_type || null, body.resource_id || null, body.details || null, ip, ua).run();

  return c.json({ success: true });
});

// ===================================================================
// 管理总台专用 API 路由 (Admin Console APIs)
// ===================================================================

const requireAdmin = async (c: any, next: () => Promise<void>) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, message: '未提供访问令牌，请先登录' }, 401);
  }

  const token = authHeader.substring(7);
  const secret = c.env.JWT_SECRET || 'narciph_secret_fallback';
  const payload = await verifyJwt<AuthUserTokenPayload>(token, secret);

  if (!payload) {
    return c.json({ success: false, message: '访问令牌已失效或过期，请重新登录' }, 401);
  }

  if (payload.role_code !== 'owner' && payload.role_code !== 'admin') {
    return c.json({ success: false, message: '权限不足，仅管理员可访问' }, 403);
  }

  c.set('authUser', payload);
  await next();
};

// 1. 获取全局统计指标
app.get('/api/v1/admin/stats', requireAdmin, async (c) => {
  const db = c.env.DB;
  const usersCount = (await db.prepare('SELECT COUNT(*) as count FROM sys_account').first<{ count: number }>())?.count || 0;
  const teamsCount = (await db.prepare('SELECT COUNT(*) as count FROM sys_team').first<{ count: number }>())?.count || 0;
  const auditLogsCount = (await db.prepare('SELECT COUNT(*) as count FROM sys_audit_log').first<{ count: number }>())?.count || 0;

  return c.json({
    usersCount,
    teamsCount,
    auditLogsCount,
  });
});

// 2. 获取所有注册用户与权限明细
app.get('/api/v1/admin/users', requireAdmin, async (c) => {
  const db = c.env.DB;
  const rows = await db.prepare(`
    SELECT
      a.id as account_id,
      a.email,
      a.status,
      a.created_at,
      u.id as internal_user_id,
      u.nickname,
      u.team_id,
      u.data_scope,
      t.name as team_name,
      r.id as role_id,
      r.code as role_code,
      r.name as role_name,
      r.max_profiles,
      r.max_concurrent
    FROM sys_account a
    LEFT JOIN sys_internal_user u ON a.id = u.account_id
    LEFT JOIN sys_team t ON u.team_id = t.id
    LEFT JOIN sys_role r ON u.role_id = r.id
    ORDER BY a.created_at DESC
  `).all();

  const userList = [];
  for (const row of rows.results || []) {
    let overrides: any[] = [];
    if (row.internal_user_id) {
      const oRows = await db.prepare('SELECT permission_id, effect FROM sys_user_permission_override WHERE internal_user_id = ?').bind(row.internal_user_id).all();
      overrides = oRows.results || [];
    }
    userList.push({
      ...row,
      overrides,
    });
  }

  return c.json({ users: userList });
});

// 3. 修改用户角色 / 提权
app.put('/api/v1/admin/users/:internalUserId/role', requireAdmin, async (c) => {
  const internalUserId = c.req.param('internalUserId');
  const body = await c.req.json<{ role_code: string }>();
  const db = c.env.DB;

  const targetRole = await db.prepare('SELECT id FROM sys_role WHERE code = ?').bind(body.role_code).first<{ id: string }>();
  if (!targetRole) {
    return c.json({ success: false, message: '未找到指定角色' }, 400);
  }

  await db.prepare('UPDATE sys_internal_user SET role_id = ?, perm_version = perm_version + 1 WHERE id = ?').bind(targetRole.id, internalUserId).run();

  return c.json({ success: true, message: '角色已成功变更并生效' });
});

// 4. 特例权限微调 (ALLOW / DENY / DEFAULT)
app.put('/api/v1/admin/users/:internalUserId/overrides', requireAdmin, async (c) => {
  const internalUserId = c.req.param('internalUserId');
  const body = await c.req.json<{ overrides: Record<string, string> }>();
  const db = c.env.DB;

  const user = await db.prepare('SELECT team_id FROM sys_internal_user WHERE id = ?').bind(internalUserId).first<{ team_id: string }>();
  if (!user) {
    return c.json({ success: false, message: '用户不存在' }, 404);
  }

  // 先清理旧特例
  await db.prepare('DELETE FROM sys_user_permission_override WHERE internal_user_id = ?').bind(internalUserId).run();

  // 插入新特例
  for (const [permId, effect] of Object.entries(body.overrides || {})) {
    if (effect === 'ALLOW' || effect === 'DENY') {
      await db.prepare(`
        INSERT INTO sys_user_permission_override (team_id, internal_user_id, permission_id, effect)
        VALUES (?, ?, ?, ?)
      `).bind(user.team_id, internalUserId, permId, effect).run();
    }
  }

  // 递增版本号让权限即时刷新
  await db.prepare('UPDATE sys_internal_user SET perm_version = perm_version + 1 WHERE id = ?').bind(internalUserId).run();

  return c.json({ success: true, message: '特例权限已保存' });
});

// 5. 获取所有角色与权限列表
app.get('/api/v1/admin/roles', requireAdmin, async (c) => {
  const db = c.env.DB;
  const roles = await db.prepare('SELECT * FROM sys_role ORDER BY created_at ASC').all();
  const roleList = [];

  for (const r of roles.results || []) {
    const permRows = await db.prepare('SELECT permission_id FROM sys_role_permission WHERE role_id = ?').bind(r.id).all<{ permission_id: string }>();
    roleList.push({
      ...r,
      permissions: (permRows.results || []).map(p => p.permission_id),
    });
  }

  // 同时也返回系统原子权限列表与基于单一数据源 (SSOT) 自动计算的 UI 视觉权限树
  let allPerms = await db.prepare('SELECT id, module, action, name, description, risk_level FROM sys_permission ORDER BY module, action').all();
  if (!allPerms.results || allPerms.results.length === 0) {
    await autoSyncPermissions(db);
    allPerms = await db.prepare('SELECT id, module, action, name, description, risk_level FROM sys_permission ORDER BY module, action').all();
  }

  return c.json({
    roles: roleList,
    allPermissions: allPerms.results || [],
    uiPermissionTree: getUiPermissionTree(),
  });
});

// 5.0 单一数据源 (SSOT) 权限与角色自同步接口
app.post('/api/v1/admin/permissions/sync', requireAdmin, async (c) => {
  const db = c.env.DB;
  const result = await autoSyncPermissions(db);
  const allPerms = await db.prepare('SELECT id, module, action, name, description, risk_level FROM sys_permission ORDER BY module, action').all();
  return c.json({
    success: true,
    message: `权限元数据自同步成功，已更新 ${result.syncedPerms} 条系统权限`,
    allPermissions: allPerms.results || [],
    uiPermissionTree: getUiPermissionTree(),
  });
});

// 5.1 创建自定义安全角色
app.post('/api/v1/admin/roles', requireAdmin, async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    code: string;
    name: string;
    max_profiles?: number;
    max_concurrent?: number;
    permissions?: string[];
  }>();

  if (!body.code || !body.name) {
    return c.json({ success: false, message: '角色标识与名称不能为空' }, 400);
  }

  const cleanCode = body.code.trim().toLowerCase();
  // 检查标识是否重复
  const existing = await db.prepare('SELECT id FROM sys_role WHERE code = ?').bind(cleanCode).first();
  if (existing) {
    return c.json({ success: false, message: `角色标识 "${cleanCode}" 已存在，不可重复` }, 400);
  }

  const roleId = generateId();
  const maxProfiles = Number(body.max_profiles) || 3;
  const maxConcurrent = Number(body.max_concurrent) || 1;

  await db.prepare(`
    INSERT INTO sys_role (id, code, name, is_system, max_profiles, max_concurrent)
    VALUES (?, ?, ?, 0, ?, ?)
  `).bind(roleId, cleanCode, body.name.trim(), maxProfiles, maxConcurrent).run();

  // 关联权限
  if (Array.isArray(body.permissions)) {
    for (const permId of body.permissions) {
      await db.prepare('INSERT OR IGNORE INTO sys_role_permission (role_id, permission_id) VALUES (?, ?)').bind(roleId, permId).run();
    }
  }

  return c.json({ success: true, message: '安全角色创建成功', roleId });
});

// 5.2 更新安全角色（包括配额与权限集合）
app.put('/api/v1/admin/roles/:roleId', requireAdmin, async (c) => {
  const db = c.env.DB;
  const roleId = c.req.param('roleId');
  const body = await c.req.json<{
    name?: string;
    max_profiles?: number;
    max_concurrent?: number;
    permissions?: string[];
  }>();

  const role = await db.prepare('SELECT * FROM sys_role WHERE id = ?').bind(roleId).first<{ is_system: number; code: string }>();
  if (!role) {
    return c.json({ success: false, message: '角色不存在' }, 404);
  }

  const updates: string[] = [];
  const bindings: any[] = [];

  if (body.name !== undefined) {
    updates.push('name = ?');
    bindings.push(body.name.trim());
  }
  if (body.max_profiles !== undefined) {
    updates.push('max_profiles = ?');
    bindings.push(Number(body.max_profiles) || 1);
  }
  if (body.max_concurrent !== undefined) {
    updates.push('max_concurrent = ?');
    bindings.push(Number(body.max_concurrent) || 1);
  }

  if (updates.length > 0) {
    bindings.push(roleId);
    await db.prepare(`UPDATE sys_role SET ${updates.join(', ')} WHERE id = ?`).bind(...bindings).run();
  }

  // 更新绑定的权限项
  if (Array.isArray(body.permissions)) {
    await db.prepare('DELETE FROM sys_role_permission WHERE role_id = ?').bind(roleId).run();
    for (const permId of body.permissions) {
      await db.prepare('INSERT OR IGNORE INTO sys_role_permission (role_id, permission_id) VALUES (?, ?)').bind(roleId, permId).run();
    }
    // 递增该角色下所有用户的 perm_version，保证修改即时刷新
    await db.prepare('UPDATE sys_internal_user SET perm_version = perm_version + 1 WHERE role_id = ?').bind(roleId).run();
  }

  return c.json({ success: true, message: '安全角色更新成功' });
});

// 5.3 删除安全角色
app.delete('/api/v1/admin/roles/:roleId', requireAdmin, async (c) => {
  const db = c.env.DB;
  const roleId = c.req.param('roleId');

  const role = await db.prepare('SELECT * FROM sys_role WHERE id = ?').bind(roleId).first<{ is_system: number; code: string }>();
  if (!role) {
    return c.json({ success: false, message: '角色不存在' }, 404);
  }

  if (role.is_system) {
    return c.json({ success: false, message: '系统预置核心角色受保护，禁止删除' }, 403);
  }

  // 检查是否有用户当前正在使用该角色
  const userCount = await db.prepare('SELECT COUNT(*) as count FROM sys_internal_user WHERE role_id = ?').bind(roleId).first<{ count: number }>();
  if (userCount && userCount.count > 0) {
    return c.json({
      success: false,
      message: `无法删除：当前仍有 ${userCount.count} 位用户绑定此角色，请先为他们调整角色`
    }, 400);
  }

  // 删除关联权限与角色
  await db.prepare('DELETE FROM sys_role_permission WHERE role_id = ?').bind(roleId).run();
  await db.prepare('DELETE FROM sys_role WHERE id = ?').bind(roleId).run();

  return c.json({ success: true, message: '角色已成功删除' });
});

// 6. 获取审计日志
app.get('/api/v1/admin/audit-logs', requireAdmin, async (c) => {
  const db = c.env.DB;
  const logs = await db.prepare(`
    SELECT l.*, a.email
    FROM sys_audit_log l
    LEFT JOIN sys_account a ON l.account_id = a.id
    ORDER BY l.created_at DESC
    LIMIT 50
  `).all();

  return c.json({ logs: logs.results || [] });
});

// 7. 集群双机实时数据同步端点与后台守护进程 (Cluster Data Sync Engine)
const SYNC_SECRET = process.env.SYNC_SECRET || 'narciph_cluster_sync_secret_token_2026';
const PRIMARY_SYNC_URL = process.env.PRIMARY_SYNC_URL || 'https://ilyou6.indevs.in';

// 7.1 导出本地增量/全量数据给对端节点
app.get('/api/v1/cluster/sync-export', async (c) => {
  const authHeader = c.req.header('x-sync-secret');
  if (authHeader !== SYNC_SECRET) {
    return c.json({ success: false, message: '未经授权的集群同步请求' }, 401);
  }

  const db = c.env.DB;
  const since = c.req.query('since') || '1970-01-01 00:00:00';

  const accounts = await db.prepare('SELECT * FROM sys_account WHERE created_at >= ? OR updated_at >= ?').bind(since, since).all();
  const teams = await db.prepare('SELECT * FROM sys_team WHERE created_at >= ?').bind(since).all();
  const internalUsers = await db.prepare('SELECT * FROM sys_internal_user WHERE created_at >= ?').bind(since).all();
  const roles = await db.prepare('SELECT * FROM sys_role WHERE created_at >= ?').bind(since).all();
  const rolePerms = await db.prepare('SELECT * FROM sys_role_permission').all();

  return c.json({
    success: true,
    timestamp: new Date().toISOString(),
    data: {
      accounts: accounts.results || [],
      teams: teams.results || [],
      internalUsers: internalUsers.results || [],
      roles: roles.results || [],
      rolePerms: rolePerms.results || [],
    },
  });
});

// 7.2 接收主节点/对端节点推送的增量数据
app.post('/api/v1/cluster/sync-import', async (c) => {
  const authHeader = c.req.header('x-sync-secret');
  if (authHeader !== SYNC_SECRET) {
    return c.json({ success: false, message: '未经授权的集群同步请求' }, 401);
  }

  const payload = await c.req.json<{
    accounts?: any[];
    teams?: any[];
    internalUsers?: any[];
    roles?: any[];
    rolePerms?: any[];
  }>();

  const count = applyClusterImport(payload);
  return c.json({ success: true, count });
});

// 手动触发从主节点执行一次即时同步
app.post('/api/v1/cluster/trigger-sync', async (c) => {
  const result = await pullFromPrimarySyncNode();
  return c.json(result);
});

// 辅助应用导入数据方法
function applyClusterImport(payload: {
  accounts?: any[];
  teams?: any[];
  internalUsers?: any[];
  roles?: any[];
  rolePerms?: any[];
}): number {
  let count = 0;
  const applyTx = sqlite.transaction(() => {
    if (Array.isArray(payload.accounts)) {
      const stmt = sqlite.prepare(`
        INSERT INTO sys_account (id, email, password_hash, salt, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          password_hash=excluded.password_hash,
          salt=excluded.salt,
          status=excluded.status,
          updated_at=excluded.updated_at
      `);
      for (const a of payload.accounts) {
        stmt.run(a.id, a.email, a.password_hash, a.salt, a.status || 'active', a.created_at, a.updated_at || a.created_at);
        count++;
      }
    }

    if (Array.isArray(payload.teams)) {
      const stmt = sqlite.prepare(`
        INSERT INTO sys_team (id, name, owner_account_id, plan_tier, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          owner_account_id=excluded.owner_account_id,
          plan_tier=excluded.plan_tier
      `);
      for (const t of payload.teams) {
        stmt.run(t.id, t.name, t.owner_account_id, t.plan_tier || 'free', t.created_at);
        count++;
      }
    }

    if (Array.isArray(payload.roles)) {
      const stmt = sqlite.prepare(`
        INSERT INTO sys_role (id, team_id, code, name, is_system, max_profiles, max_concurrent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          max_profiles=excluded.max_profiles,
          max_concurrent=excluded.max_concurrent
      `);
      for (const r of payload.roles) {
        stmt.run(r.id, r.team_id, r.code, r.name, r.is_system ? 1 : 0, r.max_profiles, r.max_concurrent, r.created_at);
        count++;
      }
    }

    if (Array.isArray(payload.rolePerms)) {
      const stmt = sqlite.prepare('INSERT OR IGNORE INTO sys_role_permission (role_id, permission_id) VALUES (?, ?)');
      for (const rp of payload.rolePerms) {
        stmt.run(rp.role_id, rp.permission_id);
        count++;
      }
    }

    if (Array.isArray(payload.internalUsers)) {
      const stmt = sqlite.prepare(`
        INSERT INTO sys_internal_user (id, team_id, account_id, nickname, role_id, data_scope, status, perm_version, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(team_id, account_id) DO UPDATE SET
          nickname=excluded.nickname,
          role_id=excluded.role_id,
          data_scope=excluded.data_scope,
          status=excluded.status,
          perm_version=excluded.perm_version
      `);
      for (const u of payload.internalUsers) {
        stmt.run(u.id, u.team_id, u.account_id, u.nickname, u.role_id, u.data_scope || 'ALL', u.status || 'active', u.perm_version || 1, u.created_at);
        count++;
      }
    }
  });

  applyTx();
  return count;
}

// 核心同步逻辑：主动从主节点拉取
let lastSyncTimestamp = '1970-01-01 00:00:00';
async function pullFromPrimarySyncNode(): Promise<{ success: boolean; message: string; count?: number }> {
  try {
    const url = `${PRIMARY_SYNC_URL}/api/v1/cluster/sync-export?since=${encodeURIComponent(lastSyncTimestamp)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-sync-secret': SYNC_SECRET,
        'User-Agent': 'Mozilla/5.0 (NarciPH-ClusterSync)',
      },
    });

    if (!res.ok) {
      return { success: false, message: `主节点响应错误 HTTP ${res.status}` };
    }

    const json = (await res.json()) as { success: boolean; timestamp: string; data: any };
    if (!json.success || !json.data) {
      return { success: false, message: '主节点未返回有效同步数据' };
    }

    const applied = applyClusterImport(json.data);
    if (json.timestamp) {
      lastSyncTimestamp = json.timestamp;
    }
    return { success: true, message: `同步成功，已应用 ${applied} 条变更`, count: applied };
  } catch (err: any) {
    const detail = err?.cause ? `${err.message} (cause: ${err.cause})` : String(err);
    return { success: false, message: `同步主节点异常: ${detail}` };
  }
}

// 7.3 后台长周期兜底心跳同步器 (默认每 1 小时对齐一次兜底，日常同步全部由事件实时触发，0 操作 = 0 请求)
const syncIntervalMs = process.env.SYNC_INTERVAL_MS ? parseInt(process.env.SYNC_INTERVAL_MS, 10) : 3600000;
setInterval(async () => {
  try {
    const res = await pullFromPrimarySyncNode();
    if (res.success && (res.count || 0) > 0) {
      console.log(`[ClusterSync] Fallback heartbeat synced ${res.count} records from primary node.`);
    }
  } catch {
    // 静默容错，不中断服务
  }
}, syncIntervalMs);

// 7.4 接收主节点的事件变更通知 (Webhook Event Triggered Sync)
app.post('/api/v1/cluster/notify-change', async (c) => {
  const syncSecret = process.env.SYNC_SECRET || 'narciph_cluster_sync_secret_token_2026';
  const authHeader = c.req.header('x-sync-secret');
  if (authHeader !== syncSecret) {
    return c.json({ success: false, message: '未经授权的集群通知' }, 401);
  }

  const body = await c.req.json<{ event: string; reason?: string; data?: any }>().catch(() => ({} as any));
  console.log(`⚡ [ClusterEvent] Received change notification from Primary: ${body.reason || body.event || 'unknown'}`);

  let applied = 0;
  if (body.data) {
    // 🌟 主节点已直接附带增量数据推送，无需 Docker 再访问外网发起拉取，毫秒级直接落库！
    applied = applyClusterImport(body.data);
    console.log(`⚡ [ClusterEvent] Directly applied ${applied} records pushed by Primary.`);
  } else {
    // 兼容没有附带 payload 的情况，回退尝试主动拉取
    const result = await pullFromPrimarySyncNode();
    applied = result.count || 0;
    console.log(`⚡ [ClusterEvent] Event-driven pull result: ${result.message}`);
  }

  return c.json({
    success: true,
    message: '事件驱动增量同步已成功执行',
    appliedCount: applied,
  });
});

// 服务启动 3 秒后立即执行首次全量初始对齐
setTimeout(() => {
  void pullFromPrimarySyncNode().then((r) => {
    console.log(`[ClusterSync] Initial cluster alignment: ${r.message}`);
  });
}, 3000);

const PORT = Number(process.env.PORT || 29988);

serve({
  fetch: app.fetch,
  port: PORT,
  hostname: '0.0.0.0',
}, (info) => {
  console.log(`🚀 [NarciPH RBAC] Docker All-In-One Server listening on http://0.0.0.0:${info.port}`);
  console.log(`📁 Database SQLite file: ${DB_PATH}`);
  console.log(`🔗 Primary sync master: ${PRIMARY_SYNC_URL}`);
});

export default app;
