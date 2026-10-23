import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiWifi } from "react-icons/fi";
import { GoGear, GoKebabHorizontal } from "react-icons/go";
import {
  LuAppWindow,
  LuBot,
  LuCloud,
  LuInfo,
  LuKeyboard,
  LuPlug,
  LuPuzzle,
  LuTrash2,
  LuUser,
  LuUsers,
} from "react-icons/lu";
import { useInputModality } from "@/hooks/use-input-modality";
import { MOTION_SPRING_POSITION } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Logo } from "./icons/logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { toast } from "sonner";

export type AppPage =
  | "profiles"
  | "groups"
  | "proxies"
  | "extensions"
  | "agent"
  | "integrations"
  | "apps"
  | "account"
  | "shortcuts"
  | "settings"
  | "about";

/** Shared-element indicator that slides between the active rail items. */
function ActiveIndicator() {
  const reduceMotion = useReducedMotion();
  const inputModality = useInputModality();
  const animate = !reduceMotion && inputModality === "pointer";
  return (
    <motion.span
      aria-hidden="true"
      initial={false}
      layoutId={animate ? "rail-indicator" : undefined}
      transition={animate ? MOTION_SPRING_POSITION : { duration: 0 }}
      className="absolute inset-y-1.5 left-[-7px] w-[2px] rounded-full bg-foreground"
    />
  );
}

import { useAccountStore } from "@/lib/account-store";

interface RailItem {
  page: AppPage;
  Icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  permission?: string;
}

const TOP_ITEMS: RailItem[] = [
  { page: "profiles", Icon: LuUser, labelKey: "common.profilesTitle", permission: "profile:list" },
  { page: "groups", Icon: LuUsers, labelKey: "common.groupsTitle", permission: "profile:list" },
  { page: "proxies", Icon: FiWifi, labelKey: "common.networkTitle", permission: "proxy:use" },
  { page: "extensions", Icon: LuPuzzle, labelKey: "common.extensionsTitle" },
  { page: "agent", Icon: LuBot, labelKey: "common.agentTitle" },
  { page: "integrations", Icon: LuPlug, labelKey: "common.integrationsTitle" },
  { page: "apps", Icon: LuAppWindow, labelKey: "common.appsTitle" },
  { page: "account", Icon: LuCloud, labelKey: "common.accountTitle" },
];

interface MoreMenuItem {
  page: AppPage;
  Icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  hintKey: string;
}

const MORE_ITEMS: MoreMenuItem[] = [
  {
    page: "shortcuts",
    Icon: LuKeyboard,
    labelKey: "common.shortcutsTitle",
    hintKey: "common.shortcutsHint",
  },
];

interface RailNavProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  onOpenTrash: () => void;
  onOpenAbout: () => void;
}

export function RailNav({ currentPage, onNavigate, onOpenTrash, onOpenAbout }: RailNavProps) {
  const { t } = useTranslation();
  const { user } = useAccountStore();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleNav = (targetPage: AppPage) => {
    if (!user && targetPage !== "account") {
      toast.warning("您当前未登录，请先在「账户」中登录或注册后使用此功能", {
        id: "auth-login-required",
      });
      onNavigate("account");
      return;
    }
    onNavigate(targetPage);
  };

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [moreOpen]);

  return (
    <nav className="relative flex w-10 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-2">
      <button
        type="button"
        aria-label={t("common.applicationName")}
        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md bg-transparent text-foreground select-none"
        onClick={() => handleNav("profiles")}
      >
        <Logo className="size-5" />
      </button>

      <div className="my-1 h-px w-5 shrink-0 bg-border" />

      <div className="flex min-h-0 w-full flex-col items-center gap-1 overflow-y-auto [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {TOP_ITEMS.filter(({ permission }) => {
          if (!permission) return true;
          return user ? (user.role_code === 'owner' || (Array.isArray(user.permissions) && user.permissions.includes(permission))) : true;
        }).map(({ page, Icon, labelKey }) => {
          const active = currentPage === page;
          const isLocked = !user && page !== "account";
          return (
            <Tooltip key={page} delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => handleNav(page)}
                  aria-label={t(labelKey)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative grid size-7 shrink-0 cursor-pointer place-items-center rounded-md transition-colors duration-100",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    isLocked && "opacity-75"
                  )}
                >
                  {active && <ActiveIndicator />}
                  <Icon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {isLocked ? `${t(labelKey)} (需要登录)` : t(labelKey)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex-1" />

      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              setMoreOpen((v) => !v);
            }}
            aria-label={t("common.more")}
            aria-expanded={moreOpen}
            className={cn(
              "grid size-7 shrink-0 cursor-pointer place-items-center rounded-md transition-colors duration-100",
              moreOpen
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <GoKebabHorizontal className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{t("common.more")}</TooltipContent>
      </Tooltip>

      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => handleNav("settings")}
            aria-label={t("common.settingsTitle")}
            aria-current={currentPage === "settings" ? "page" : undefined}
            className={cn(
              "relative grid size-7 shrink-0 cursor-pointer place-items-center rounded-md transition-colors duration-100",
              currentPage === "settings"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              !user && "opacity-75"
            )}
          >
            {currentPage === "settings" && <ActiveIndicator />}
            <GoGear className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {!user ? `${t("common.settingsTitle")} (需要登录)` : t("common.settingsTitle")}
        </TooltipContent>
      </Tooltip>

      {moreOpen && (
        <>
          <button
            type="button"
            aria-label={t("common.closeMenu")}
            className="fixed inset-0 z-30 cursor-default bg-transparent"
            onClick={() => {
              setMoreOpen(false);
            }}
          />
          <div
            role="menu"
            aria-label={t("common.more")}
            className="absolute bottom-14 left-11 z-40 w-56 rounded-lg bg-card p-1 text-card-foreground shadow-sm"
          >
            {MORE_ITEMS.map(({ page, Icon, labelKey, hintKey }) => (
              <button
                key={page}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  handleNav(page);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-100 hover:bg-accent hover:text-accent-foreground"
              >
                <span className="grid size-5 shrink-0 place-items-center text-muted-foreground">
                  <Icon className="size-3" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-medium text-foreground">
                    {t(labelKey)} {!user && "(需要登录)"}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {t(hintKey)}
                  </span>
                </span>
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false);
                if (!user) {
                  toast.warning("您当前未登录，请先在「账户」中登录或注册", { id: "auth-login-required" });
                  onNavigate("account");
                  return;
                }
                onOpenTrash();
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-100 hover:bg-accent hover:text-accent-foreground"
            >
              <span className="grid size-5 shrink-0 place-items-center text-muted-foreground">
                <LuTrash2 className="size-3" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-medium text-foreground">{t("common.trash")} {!user && "(需要登录)"}</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {t("common.trashHint")}
                </span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false);
                onOpenAbout();
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-100 hover:bg-accent hover:text-accent-foreground"
            >
              <span className="grid size-5 shrink-0 place-items-center text-muted-foreground">
                <LuInfo className="size-3" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-medium text-foreground">
                  {t("common.about")}
                </span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {t("common.aboutHint")}
                </span>
              </span>
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
