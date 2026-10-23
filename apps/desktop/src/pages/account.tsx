import { useState, useEffect } from 'react';
import {
  LuUser,
  LuLock,
  LuMail,
  LuLogOut,
  LuShieldCheck,
  LuLayers,
  LuUsers,
  LuKey,
  LuCircleAlert,
  LuRefreshCw,
  LuCircleCheck,
  LuCircleX,
} from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { accountStore, useAccountStore } from '@/lib/account-store';

export function AccountPage() {
  const {
    serverUrl,
    token,
    user,
  } = useAccountStore();

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 成员列表状态 (当拥有 member:read 权限时)
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (token) {
      void accountStore.refreshProfile();
    }
  }, [token]);

  // 加载成员列表
  useEffect(() => {
    if (token && user?.permissions.includes('member:read')) {
      setLoadingMembers(true);
      fetch(`${serverUrl}/api/v1/teams/${user.team_id}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data: any) => {
          if (data.success && Array.isArray(data.members)) {
            setMembers(data.members);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingMembers(false));
    }
  }, [token, user, serverUrl]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error('请填写完整邮箱与密码');
      return;
    }

    if (authMode === 'register') {
      if (password.length < 6) {
        toast.error('密码长度至少需要 6 位');
        return;
      }
      if (password !== confirmPassword) {
        toast.error('两次输入的密码不一致');
        return;
      }
    }

    setSubmitting(true);
    if (authMode === 'login') {
      const res = await accountStore.login(email.trim(), password);
      setSubmitting(false);
      if (res.success) {
        toast.success(res.message);
        setEmail('');
        setPassword('');
      } else {
        toast.error(res.message);
      }
    } else {
      const res = await accountStore.register(email.trim(), password);
      setSubmitting(false);
      if (res.success) {
        toast.success(res.message);
        setEmail('');
        setPassword('');
        setConfirmPassword('');
      } else {
        toast.error(res.message);
      }
    }
  };

  const isBasicUser = user?.role_code === 'basic_user';

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
      {/* 1. 未登录态：登录 / 自主注册 */}
      {!token ? (
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs max-w-md mx-auto space-y-5">
          <div className="text-center space-y-2">
            <div className="mx-auto size-10 rounded-full bg-primary/10 grid place-items-center mb-1">
              <LuShieldCheck className="size-5 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground">账户与权限体系登录</h2>
            <p className="text-xs text-muted-foreground">
              登录以同步团队环境、获取角色授权并遵守指纹浏览器安全管控规则。
            </p>

            <div className="flex justify-center gap-2 mt-3 p-1 bg-muted rounded-md text-xs">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-1.5 rounded-sm transition-colors ${
                  authMode === 'login' ? 'bg-background font-medium shadow-xs text-foreground' : 'text-muted-foreground'
                }`}
              >
                账号登录
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                className={`flex-1 py-1.5 rounded-sm transition-colors ${
                  authMode === 'register' ? 'bg-background font-medium shadow-xs text-foreground' : 'text-muted-foreground'
                }`}
              >
                自主邮箱注册
              </button>
            </div>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <LuMail className="size-3.5 text-muted-foreground" />
                邮箱地址
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <LuLock className="size-3.5 text-muted-foreground" />
                密码
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="******"
                required
                className="h-8 text-xs"
              />
            </div>

            {authMode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <LuLock className="size-3.5 text-muted-foreground" />
                  确认密码
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                  required
                  className="h-8 text-xs"
                />
                <div className="rounded-md bg-muted/60 p-2.5 text-[11px] text-muted-foreground flex items-start gap-1.5 mt-2">
                  <LuCircleAlert className="size-3.5 text-primary shrink-0 mt-0.5" />
                  <span>
                    自主注册将全自动初始化您的个人独立空间，并预设<strong>“基础体验用户”</strong>角色与配额，立即可体验创建与启动浏览器。
                  </span>
                </div>
              </div>
            )}

            <Button type="submit" disabled={submitting} className="w-full h-8 text-xs mt-2">
              {submitting ? '处理中...' : authMode === 'login' ? '立即登录' : '立即注册并获取体验权限'}
            </Button>
          </form>
        </div>
      ) : (
        /* 3. 已登录态：用户仪表盘、权限清单、配额与团队管理 */
        <div className="space-y-6">
          {/* 用户概览卡片 */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="size-11 rounded-full bg-primary/10 grid place-items-center text-primary font-bold text-base">
                {user?.nickname?.[0]?.toUpperCase() || <LuUser className="size-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm text-foreground">{user?.nickname}</h3>
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {user?.role_name || user?.role_code}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {user?.email} · 所属空间: <strong className="text-foreground">{user?.team_name}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void accountStore.refreshProfile()}
                className="h-7 text-xs gap-1.5"
              >
                <LuRefreshCw className="size-3" />
                刷新权限
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => accountStore.logout()}
                className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 gap-1.5"
              >
                <LuLogOut className="size-3" />
                退出登录
              </Button>
            </div>
          </div>

          {/* 配额与状态卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <LuLayers className="size-4 text-primary" />
                <h3 className="text-xs font-semibold text-foreground">环境配额约束 (Quota)</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-border/40">
                  <span className="text-muted-foreground">最大环境创建数</span>
                  <span className="font-semibold text-foreground">{user?.quotas?.max_profiles ?? 3} 个</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/40">
                  <span className="text-muted-foreground">最大同时运行窗口</span>
                  <span className="font-semibold text-foreground">{user?.quotas?.max_concurrent ?? 1} 个窗口</span>
                </div>
                {isBasicUser && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
                    💡 当前为自主注册的基础体验角色，已为您开通核心环境体验；如需批量多开或提权，请联系管理员。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <LuShieldCheck className="size-4 text-primary" />
                <h3 className="text-xs font-semibold text-foreground">安全与防护策略</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-border/40">
                  <span className="text-muted-foreground">环境导出与 Cookies 提取</span>
                  <span className={user?.permissions?.includes('profile:export') ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                    {user?.permissions?.includes('profile:export') ? '允许导出' : '严格禁止 (防外泄)'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/40">
                  <span className="text-muted-foreground">底层硬件指纹篡改</span>
                  <span className={user?.permissions?.includes('profile:edit_fingerprint') ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                    {user?.permissions?.includes('profile:edit_fingerprint') ? '已解锁' : '系统自动托管 (锁定)'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 有效权限矩阵展示 */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <LuKey className="size-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">当前生效的细粒度权限列表</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              展示服务器根据您的角色（{user?.role_name}）和特例表计算出的最终有效操作权限：
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2">
              {[
                { id: 'profile:list', label: '查看环境列表' },
                { id: 'profile:create', label: '新建配置文件' },
                { id: 'profile:launch', label: '启动指纹浏览器' },
                { id: 'profile:stop', label: '停止浏览器' },
                { id: 'profile:edit_basic', label: '编辑名称备注' },
                { id: 'profile:trash', label: '移入废纸篓' },
                { id: 'proxy:use', label: '使用代理节点' },
                { id: 'profile:edit_fingerprint', label: '修改底层硬件指纹' },
                { id: 'profile:export', label: '导出配置/Cookies' },
                { id: 'profile:delete', label: '永久粉碎环境' },
                { id: 'proxy:view_credential', label: '查看代理密码明文' },
                { id: 'proxy:manage', label: '管理代理订阅池' },
                { id: 'member:read', label: '查看团队成员' },
                { id: 'member:invite', label: '邀请管理成员' },
                { id: 'audit:read', label: '查看操作审计日志' },
              ].map((item) => {
                const has = user?.permissions?.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs ${
                      has
                        ? 'border-emerald-500/30 bg-emerald-500/5 text-foreground'
                        : 'border-border/40 bg-muted/30 text-muted-foreground opacity-60'
                    }`}
                  >
                    {has ? (
                      <LuCircleCheck className="size-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <LuCircleX className="size-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="truncate">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 团队成员管理（仅管理员可见） */}
          {user?.permissions?.includes('member:read') && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <LuUsers className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">团队成员管理 (Team Members)</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                管理当前空间（{user.team_name}）内的协作成员与被授权人员：
              </p>
              {loadingMembers ? (
                <p className="text-xs text-muted-foreground py-4 text-center">加载成员列表中...</p>
              ) : members.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">暂无其他成员</p>
              ) : (
                <div className="space-y-2 pt-1">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2.5 rounded-md border border-border/50 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="size-7 rounded-full bg-primary/10 grid place-items-center text-primary font-medium text-xs">
                          {m.nickname?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{m.nickname}</p>
                          <p className="text-[11px] text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {m.role_name || m.role_code}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
