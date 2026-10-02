import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { FaDownload } from "react-icons/fa";
import { FiWifi } from "react-icons/fi";
import { GoGear, GoKebabHorizontal } from "react-icons/go";
import {
  LuBot,
  LuCloud,
  LuCookie,
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

export type AppPage =
  | "profiles"
  | "proxies"
  | "extensions"
  | "groups"
  | "cookieBot"
  | "agent"
  | "integrations"
  | "account"
  | "import"
  | "shortcuts"
  | "settings"
  | "about"
  | "trash";

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

interface RailItem {
  page: AppPage;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const TOP_ITEMS: RailItem[] = [
  { page: "profiles", Icon: LuUser, label: "Profiles" },
  { page: "proxies", Icon: FiWifi, label: "Network" },
  { page: "extensions", Icon: LuPuzzle, label: "Extensions" },
  { page: "groups", Icon: LuUsers, label: "Groups" },
  { page: "cookieBot", Icon: LuCookie, label: "Cookie Bot" },
  { page: "agent", Icon: LuBot, label: "Agent" },
  { page: "integrations", Icon: LuPlug, label: "Integrations" },
  { page: "account", Icon: LuCloud, label: "Account" },
];

interface MoreMenuItem {
  page: AppPage;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
}

const MORE_ITEMS: MoreMenuItem[] = [
  {
    page: "import",
    Icon: FaDownload,
    label: "Import profile",
    hint: "Bring a profile in from a file",
  },
  {
    page: "shortcuts",
    Icon: LuKeyboard,
    label: "Keyboard shortcuts",
    hint: "See every shortcut",
  },
  {
    page: "trash",
    Icon: LuTrash2,
    label: "Trash",
    hint: "Restore or permanently delete",
  },
];

interface RailNavProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  onOpenAbout: () => void;
}

export function RailNav({ currentPage, onNavigate, onOpenAbout }: RailNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);

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
        aria-label="NarciPHBrowser"
        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md bg-transparent text-foreground select-none"
        onClick={() => onNavigate("profiles")}
      >
        <Logo className="size-5" />
      </button>

      <div className="my-1 h-px w-5 shrink-0 bg-border" />

      <div className="flex min-h-0 w-full flex-col items-center gap-1 overflow-y-auto [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {TOP_ITEMS.map(({ page, Icon, label }) => {
          const active = currentPage === page;
          return (
            <Tooltip key={page} delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(page);
                  }}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative grid size-7 shrink-0 cursor-pointer place-items-center rounded-md transition-colors duration-100",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {active && <ActiveIndicator />}
                  <Icon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
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
            aria-label="More"
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
        <TooltipContent side="right">More</TooltipContent>
      </Tooltip>

      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              onNavigate("settings");
            }}
            aria-label="Settings"
            aria-current={currentPage === "settings" ? "page" : undefined}
            className={cn(
              "relative grid size-7 shrink-0 cursor-pointer place-items-center rounded-md transition-colors duration-100",
              currentPage === "settings"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {currentPage === "settings" && <ActiveIndicator />}
            <GoGear className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Settings</TooltipContent>
      </Tooltip>

      {moreOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 cursor-default bg-transparent"
            onClick={() => {
              setMoreOpen(false);
            }}
          />
          <div
            role="menu"
            aria-label="More"
            className="absolute bottom-14 left-11 z-40 w-56 rounded-lg bg-card p-1 text-card-foreground shadow-sm"
          >
            {MORE_ITEMS.map(({ page, Icon, label, hint }) => (
              <button
                key={page}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onNavigate(page);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-100 hover:bg-accent hover:text-accent-foreground"
              >
                <span className="grid size-5 shrink-0 place-items-center text-muted-foreground">
                  <Icon className="size-3" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-medium text-foreground">
                    {label}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {hint}
                  </span>
                </span>
              </button>
            ))}
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
                  About
                </span>
                <span className="truncate text-[10px] text-muted-foreground">
                  Versions and build info
                </span>
              </span>
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
