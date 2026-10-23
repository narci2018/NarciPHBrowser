import { ReactNode } from "react";
import type { PermissionCode } from "@narc/sdk";
import { useAccountStore } from "@/lib/account-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface PermissionGuardProps {
  permission: PermissionCode | string;
  fallback?: ReactNode;
  mode?: "hide" | "disable";
  disabledReason?: string;
  children: ReactNode;
}

/**
 * 细粒度声明式权限守卫组件
 * 
 * mode="hide": 无权限时完全不渲染（或渲染 fallback），用于敏感 Tab 导航与特定页面分区
 * mode="disable": 无权限时灰显禁用并悬浮展示 Tooltip 说明，用于操作按钮（防越权/提示升级）
 */
export function PermissionGuard({
  permission,
  fallback = null,
  mode = "hide",
  disabledReason = "您当前的角色暂无此操作权限，请联系管理员提权",
  children,
}: PermissionGuardProps) {
  const { user } = useAccountStore();
  const hasPerm = user
    ? user.role_code === "owner" || (Array.isArray(user.permissions) && user.permissions.includes(permission))
    : false;

  if (hasPerm) {
    return <>{children}</>;
  }

  if (mode === "hide") {
    return <>{fallback}</>;
  }

  const promptMessage = !user ? "未登录：请先在账户中心登录或注册后使用此功能" : disabledReason;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center cursor-not-allowed opacity-50 select-none">
          <span className="pointer-events-none w-full h-full inline-flex items-center">
            {children}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs text-rose-400 font-sans">{promptMessage}</p>
      </TooltipContent>
    </Tooltip>
  );
}
