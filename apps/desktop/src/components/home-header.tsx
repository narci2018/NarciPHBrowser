import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { GoPlus } from "react-icons/go";
import { LuCircleHelp, LuCircleStop, LuDownload, LuSearch, LuTrash2, LuUpload, LuX } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { PermissionGuard } from "./permission-guard";

const HOLD_MS = 150;
const DRAG_THRESHOLD_PX = 3;

const isInteractiveTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  const el = target.closest(
    "button, a, [role='button'], input, select, textarea, [contenteditable=''], [contenteditable='true']",
  );
  return el !== null;
};

const SearchSyntaxHelp = () => {
  const { t } = useTranslation();
  return (
    <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={t("common.searchHelp")}
        className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-accent-foreground"
      >
        <LuCircleHelp className="size-3.5" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 p-0">
      <div className="space-y-3 p-3 text-xs">
        <div>
          <p className="font-medium text-foreground">{t("common.searchHelpTitle")}</p>
          <p className="mt-1 text-muted-foreground">
            {t("common.searchHelpDescription")}
          </p>
        </div>
        <div>
          <p className="font-medium text-foreground">{t("common.searchHelpExamples")}</p>
          <div className="mt-1.5 space-y-1.5">
            <div>
              <code className="font-mono text-[11px] text-foreground">de</code>
              <p className="text-muted-foreground">
                {t("common.searchExampleDe")}
              </p>
            </div>
            <div>
              <code className="font-mono text-[11px] text-foreground">
                windows
              </code>
              <p className="text-muted-foreground">
                {t("common.searchExampleWindows")}
              </p>
            </div>
            <div>
              <code className="font-mono text-[11px] text-foreground">
                proxy
              </code>
              <p className="text-muted-foreground">
                {t("common.searchExampleProxy")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
  );
};

interface Props {
  onCreateProfileDialogOpen: (open: boolean) => void;
  onStopAllBrowsers?: () => void;
  onImportProfiles: () => void;
  onExportProfiles: () => void;
  onOpenTrash: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  totalProfiles: number;
  pageTitle?: string;
}

const HomeHeader = ({
  onCreateProfileDialogOpen,
  onStopAllBrowsers,
  onImportProfiles,
  onExportProfiles,
  onOpenTrash,
  searchQuery,
  onSearchQueryChange,
  totalProfiles,
  pageTitle,
}: Props) => {
  const { t } = useTranslation();
  const holdTimeoutRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartedRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  const clearHold = useCallback(() => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }, []);

  const beginDrag = useCallback(() => {
    if (dragStartedRef.current) return;
    dragStartedRef.current = true;
    clearHold();
    void getCurrentWindow().startDragging();
  }, [clearHold]);

  useEffect(() => {
    return () => {
      clearHold();
    };
  }, [clearHold]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (isInteractiveTarget(e.target)) return;

      dragStartedRef.current = false;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      activePointerIdRef.current = e.pointerId;

      clearHold();
      holdTimeoutRef.current = window.setTimeout(() => {
        holdTimeoutRef.current = null;
        beginDrag();
      }, HOLD_MS);
    },
    [beginDrag, clearHold],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (
        dragStartedRef.current ||
        dragStartRef.current === null ||
        activePointerIdRef.current !== e.pointerId
      ) {
        return;
      }
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        beginDrag();
      }
    },
    [beginDrag],
  );

  const handlePointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      clearHold();
      dragStartRef.current = null;
      activePointerIdRef.current = null;
      dragStartedRef.current = false;
    },
    [clearHold],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isInteractiveTarget(e.target)) return;
      clearHold();
      void getCurrentWindow().toggleMaximize();
    },
    [clearHold],
  );

  const showProfileToolbar = !pageTitle;

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onDoubleClick={handleDoubleClick}
      className={cn(
        "flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card select-none",
        "pl-3 pr-[144px]",
      )}
    >
      {pageTitle ? (
        <span className="ml-2 text-xs font-semibold text-card-foreground">
          {pageTitle}
        </span>
      ) : (
        <span className="ml-1 flex h-7 shrink-0 items-center gap-1.5 px-1 text-xs font-medium text-foreground">
          {t("common.all")}
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {totalProfiles}
          </span>
        </span>
      )}

      {!showProfileToolbar && <div className="flex-1" />}

      {showProfileToolbar && (
        <div className="relative shrink-0">
          <Input
            type="text"
            placeholder={t("common.searchProfiles")}
            value={searchQuery}
            onChange={(e) => {
              onSearchQueryChange(e.target.value);
            }}
            className="h-7 w-36 pr-7 pl-8 text-xs min-[860px]:w-52"
          />
          <LuSearch className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 transform text-muted-foreground" />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                onSearchQueryChange("");
              }}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 transform rounded-sm p-0.5 transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={t("common.clearSearch")}
            >
              <LuX className="size-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          ) : null}
        </div>
      )}

      {showProfileToolbar && <SearchSyntaxHelp />}

      {showProfileToolbar && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={onOpenTrash}
                aria-label={t("common.openTrash")}
                className="flex h-7 w-7 items-center justify-center px-0 text-muted-foreground hover:text-foreground"
              >
                <LuTrash2 className="size-3.5" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("common.trashTooltip")}</TooltipContent>
        </Tooltip>
      )}

      {showProfileToolbar && (
        <PermissionGuard permission="profile:import" mode="disable" disabledReason="当前角色无导入环境权限">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onImportProfiles}
                  className="flex h-7 items-center gap-1.5 px-2.5 text-xs"
                >
                  <LuDownload className="size-3.5" />
                  {t("common.import")}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{t("common.importTooltip")}</TooltipContent>
          </Tooltip>
        </PermissionGuard>
      )}

      {showProfileToolbar && (
        <PermissionGuard permission="profile:export" mode="disable" disabledReason="企业安全策略：当前角色禁止导出环境配置与凭证">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onExportProfiles}
                  disabled={totalProfiles === 0}
                  className="flex h-7 items-center gap-1.5 px-2.5 text-xs"
                >
                  <LuUpload className="size-3.5" />
                  {t("common.export")}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{t("common.exportTooltip")}</TooltipContent>
          </Tooltip>
        </PermissionGuard>
      )}

      {showProfileToolbar && (
        <PermissionGuard permission="profile:create" mode="disable" disabledReason="当前角色无新建环境权限或配额已达上限">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">
                <Button
                  size="sm"
                  onClick={() => {
                    onCreateProfileDialogOpen(true);
                  }}
                  className="flex h-7 items-center gap-1.5 px-2.5 text-xs"
                >
                  <GoPlus className="size-3.5" />
                  {t("common.new")}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{t("common.newTooltip")}</TooltipContent>
          </Tooltip>
        </PermissionGuard>
      )}

      {showProfileToolbar && onStopAllBrowsers && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={onStopAllBrowsers}
                className="flex h-7 items-center gap-1.5 px-2.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive/40 dark:text-destructive-foreground dark:hover:bg-destructive/20"
              >
                <LuCircleStop className="size-3.5" />
                {t("common.stopAll")}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("common.stopAllTooltip")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

export default HomeHeader;
