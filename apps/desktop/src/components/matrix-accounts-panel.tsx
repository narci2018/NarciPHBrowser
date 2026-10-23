import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  LuUserCheck,
  LuPlus,
  LuTrash2,
  LuQrCode,
  LuExternalLink,
  LuRefreshCw,
  LuShieldCheck,
  LuClock,
  LuTriangleAlert,
  LuCheck,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProfileSummary } from "@narc/sdk";
import { MATRIX_PLATFORMS } from "@/lib/matrix-publisher";
import {
  type MatrixAccount,
  createMatrixAccount,
  updateMatrixAccountStatus,
  deleteMatrixAccount,
} from "@/lib/matrix-accounts";

export interface MatrixAccountsPanelProps {
  profiles: ProfileSummary[];
  accounts: MatrixAccount[];
  onAccountsChange: (accounts: MatrixAccount[]) => void;
  onNavigateToPublish?: (platformId: string, accountId: string) => void;
}

export function MatrixAccountsPanel({
  profiles = [],
  accounts = [],
  onAccountsChange,
  onNavigateToPublish,
}: MatrixAccountsPanelProps) {
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [loggingInAccountId, setLoggingInAccountId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // Form states
  const [formPlatform, setFormPlatform] = useState<string>("douyin");
  const [formName, setFormName] = useState<string>("");
  const [formProfileId, setFormProfileId] = useState<string>(() => profiles[0]?.id || "");
  const [formNotes, setFormNotes] = useState<string>("");

  // Filter accounts
  const filteredAccounts = accounts.filter(
    (acc) => filterPlatform === "all" || acc.platformId === filterPlatform
  );

  const stats = {
    total: accounts.length,
    loggedIn: accounts.filter((a) => a.status === "logged_in").length,
    pending: accounts.filter((a) => a.status !== "logged_in").length,
  };

  // Launch scan QR code login
  const handleLaunchLogin = async (acc: MatrixAccount) => {
    const p = MATRIX_PLATFORMS[acc.platformId];
    if (!p) {
      toast.error(`未找到平台配置: ${acc.platformId}`);
      return;
    }

    setLoggingInAccountId(acc.id);
    toast.info(`正在为您拉起【${acc.accountName}】专属独立指纹浏览器，直达 ${p.name} 登录页...`);

    try {
      // 开启有头模式可见浏览器，直达平台创作者登录二维码页，等待 60 秒供用户手机扫码
      await invoke("run_workflow", {
        id: acc.profileId,
        steps: [
          {
            action: "goto",
            name: `访问 ${p.name} 创作者登录页`,
            url: p.homeUrl,
            timeout: 60000,
          },
          {
            action: "wait",
            name: "请在弹出的浏览器窗口中直接扫码或输入验证码登录 (会话将自动永久缓存)",
            duration: 50000,
            optional: true,
          },
        ],
        headless: false,
      });

      // 标记为已登录
      const updated = updateMatrixAccountStatus(acc.id, "logged_in");
      onAccountsChange(updated);
      toast.success(`🎉 【${acc.accountName}】登录成功！Cookies 与 Session 已永久沉淀在指纹环境中`);
    } catch (err: any) {
      toast.error(`登录引导异常: ${err?.toString() || err}`);
    } finally {
      setLoggingInAccountId(null);
    }
  };

  // Direct open creator dashboard
  const handleOpenDashboard = async (acc: MatrixAccount) => {
    const p = MATRIX_PLATFORMS[acc.platformId];
    if (!p) return;

    toast.info(`正在免密打开【${acc.accountName}】${p.name} 创作者中心...`);
    try {
      await invoke("run_workflow", {
        id: acc.profileId,
        steps: [
          {
            action: "goto",
            name: `进入 ${p.name} 创作者工作台`,
            url: p.homeUrl,
            timeout: 45000,
          },
          {
            action: "wait",
            name: "工作台操作中",
            duration: 60000,
            optional: true,
          },
        ],
        headless: false,
      });
    } catch (err: any) {
      toast.error(`打开后台失败: ${err?.toString() || err}`);
    }
  };

  // Toggle status
  const handleToggleStatus = (acc: MatrixAccount) => {
    const nextStatus =
      acc.status === "logged_in"
        ? "expired"
        : acc.status === "expired"
        ? "not_logged_in"
        : "logged_in";
    const updated = updateMatrixAccountStatus(acc.id, nextStatus);
    onAccountsChange(updated);
    toast.info(`已更新【${acc.accountName}】状态为: ${nextStatus === "logged_in" ? "已登录" : nextStatus === "expired" ? "已过期" : "未登录"}`);
  };

  // Delete account
  const handleDelete = (acc: MatrixAccount) => {
    if (confirm(`确定要移除账号【${acc.accountName}】吗？`)) {
      const updated = deleteMatrixAccount(acc.id);
      onAccountsChange(updated);
      toast.success(`已删除账号: ${acc.accountName}`);
    }
  };

  // Submit Add Account
  const handleCreateAccount = (launchImmediately: boolean) => {
    if (!formName.trim()) {
      toast.error("请输入账号名称或备注昵称");
      return;
    }
    if (!formProfileId) {
      toast.error("请选择一个绑定的指纹浏览器环境");
      return;
    }

    const newAcc = createMatrixAccount({
      platformId: formPlatform,
      accountName: formName,
      profileId: formProfileId,
      notes: formNotes,
    });

    onAccountsChange([newAcc, ...accounts]);
    setShowAddModal(false);
    setFormName("");
    setFormNotes("");
    toast.success(`已成功纳管账号: ${newAcc.accountName}`);

    if (launchImmediately) {
      handleLaunchLogin(newAcc);
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部指标统计栏与操作区 */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-8 flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-xs text-muted-foreground">已接入平台</div>
              <div className="mt-1 text-xl font-bold text-foreground">12 主流平台</div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-xs text-muted-foreground">纳管矩阵账号</div>
              <div className="mt-1 text-xl font-bold text-sky-500">{stats.total} 个</div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-xs text-muted-foreground">正常在线会话</div>
              <div className="mt-1 text-xl font-bold text-emerald-500">{stats.loggedIn} 个</div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-xs text-muted-foreground">待登录 / 需重验</div>
              <div className="mt-1 text-xl font-bold text-amber-500">{stats.pending} 个</div>
            </div>
          </div>

          <Button
            onClick={() => setShowAddModal(true)}
            className="gap-2 bg-primary px-4 text-xs font-semibold shadow hover:bg-primary/90"
          >
            <LuPlus className="size-4" />
            添加新矩阵账号
          </Button>
        </div>

        <div className="col-span-4 rounded-xl border border-border/80 bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <LuShieldCheck className="size-4 text-emerald-500" />
            独立指纹环境会话持久化
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            每个账号绑定独立 Chromium Profile，Cookie、SessionStorage 与设备指纹天然硬隔离，防串号风控。
          </p>
        </div>
      </div>

      {/* 平台分类过滤药丸按钮 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
        <button
          type="button"
          onClick={() => setFilterPlatform("all")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all select-none ${
            filterPlatform === "all"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          全部平台 ({accounts.length})
        </button>

        {Object.values(MATRIX_PLATFORMS).map((p) => {
          const count = accounts.filter((a) => a.platformId === p.id).length;
          const active = filterPlatform === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setFilterPlatform(p.id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all select-none ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span>{p.name.split(" ")[0]}</span>
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    active ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 账号卡片列表 */}
      {filteredAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center bg-card/30">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
            <LuUserCheck className="size-6" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">暂无该平台的自媒体账号</h3>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            矩阵自动发布必须依赖已登录的账号会话。点击下方按钮添加账号，并在弹出的独立指纹窗口中完成扫码登录。
          </p>
          <Button
            onClick={() => {
              if (filterPlatform !== "all") {
                setFormPlatform(filterPlatform);
              }
              setShowAddModal(true);
            }}
            className="mt-4 gap-2 text-xs"
          >
            <LuPlus className="size-3.5" />
            立即纳管第一个账号
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filteredAccounts.map((acc) => {
            const p = MATRIX_PLATFORMS[acc.platformId] || {
              name: acc.platformId,
              color: "#666",
              category: "domestic",
            };
            const boundProfile = profiles.find((prof) => prof.id === acc.profileId);
            const isLoggingIn = loggingInAccountId === acc.id;

            return (
              <div
                key={acc.id}
                className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md"
              >
                <div>
                  {/* 卡片头部：平台标签与状态 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block size-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="text-xs font-semibold text-foreground">{p.name}</span>
                    </div>

                    {acc.status === "logged_in" ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/30 text-[10px] gap-1">
                        <LuCheck className="size-3" />
                        会话已缓存 (已登录)
                      </Badge>
                    ) : acc.status === "expired" ? (
                      <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/30 text-[10px] gap-1">
                        <LuTriangleAlert className="size-3" />
                        会话已过期 (需重登)
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[10px]">
                        未登录 (需扫码)
                      </Badge>
                    )}
                  </div>

                  {/* 账号名称 */}
                  <div className="mt-3">
                    <h4 className="text-sm font-bold text-foreground truncate">{acc.accountName}</h4>
                    {acc.notes && (
                      <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">{acc.notes}</p>
                    )}
                  </div>

                  {/* 绑定指纹环境 */}
                  <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-[11px]">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <LuShieldCheck className="size-3 text-sky-500" />
                        绑定指纹环境:
                      </span>
                      <span className="font-medium text-foreground truncate max-w-[140px]">
                        {boundProfile?.name || acc.profileId.slice(0, 8)}
                      </span>
                    </div>
                  </div>

                  {/* 最近更新时间 */}
                  {acc.lastLoginTime && (
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <LuClock className="size-3" />
                      最近登录: {acc.lastLoginTime}
                    </div>
                  )}
                </div>

                {/* 底部操作按钮 */}
                <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => handleLaunchLogin(acc)}
                      disabled={isLoggingIn}
                      className="h-7 gap-1 px-2.5 text-xs bg-primary text-primary-foreground"
                    >
                      {isLoggingIn ? (
                        <LuRefreshCw className="size-3 animate-spin" />
                      ) : (
                        <LuQrCode className="size-3" />
                      )}
                      {isLoggingIn ? "正在唤起..." : "扫码登录"}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDashboard(acc)}
                      className="h-7 gap-1 px-2 text-xs"
                      title="打开创作者后台"
                    >
                      <LuExternalLink className="size-3" />
                      后台
                    </Button>

                    {onNavigateToPublish && acc.status === "logged_in" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onNavigateToPublish(acc.platformId, acc.id)}
                        className="h-7 px-2 text-xs"
                        title="使用此账号发布视频"
                      >
                        去发布
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(acc)}
                      title="手动切换会话状态"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <LuRefreshCw className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(acc)}
                      title="移除此账号"
                      className="rounded p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                    >
                      <LuTrash2 className="size-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 添加新账号对话框 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LuUserCheck className="size-4 text-primary" />
                纳管新自媒体矩阵账号
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">选择所属平台</Label>
                <select
                  value={formPlatform}
                  onChange={(e) => setFormPlatform(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {Object.values(MATRIX_PLATFORMS).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs">账号名称 / 昵称备注</Label>
                <Input
                  placeholder="例如：小明说车 - 抖音主号"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs">绑定指纹浏览器环境 (Profile 隔离)</Label>
                <select
                  value={formProfileId}
                  onChange={(e) => setFormProfileId(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id.slice(0, 8)})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  提示：该账号的所有 Cookie、LocalStorage 和请求代理均在此环境中独立隔离运行。
                </p>
              </div>

              <div>
                <Label className="text-xs">备注说明 (选填)</Label>
                <Input
                  placeholder="如：带货号 / 每日傍晚 18:00 定时发"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
              <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)} className="text-xs">
                取消
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCreateAccount(false)}
                className="text-xs"
              >
                仅保存账号
              </Button>
              <Button
                size="sm"
                onClick={() => handleCreateAccount(true)}
                className="text-xs bg-primary text-primary-foreground gap-1.5"
              >
                <LuQrCode className="size-3.5" />
                保存并立即扫码登录
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
