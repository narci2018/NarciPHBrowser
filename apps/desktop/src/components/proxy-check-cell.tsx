import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  LuCircle,
  LuCircleCheck,
  LuCircleX,
  LuCopy,
  LuLoaderCircle,
  LuRefreshCw,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { relativeTime, type ProxyCheck, type StoredProxy } from "@/lib/proxies";

interface ProxyCheckCellProps {
  proxy: StoredProxy;
  onChecked: (check: ProxyCheck) => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-xs text-foreground">{value}</dd>
    </div>
  );
}

export function ProxyCheckCell({ proxy, onChecked }: ProxyCheckCellProps) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);
  const check = proxy.last_check ?? null;

  const run = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const result = await invoke<ProxyCheck>("check_proxy", {
        payload: { id: proxy.id, url: proxy.url },
      });
      onChecked(result);
      setOpen(true);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setChecking(false);
    }
  };

  const icon = checking ? (
    <LuLoaderCircle className="size-3.5 animate-spin" />
  ) : check?.ok ? (
    <LuCircleCheck className="size-3.5 text-success-text" />
  ) : check ? (
    <LuCircleX className="size-3.5 text-destructive" />
  ) : (
    <LuCircle className="size-3.5" />
  );

  const location = check?.ok
    ? [check.city, check.country].filter(Boolean).join(", ")
    : "";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("common.checkNamed", { name: proxy.name })}
          onClick={() => {
            if (!open) void run();
          }}
          className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              {checking
                ? t("common.checking")
                : !check
                  ? t("common.notCheckedYet")
                  : check.ok
                    ? t("common.lastCheckSucceeded")
                    : t("common.proxyCheckFailed")}
            </p>
            {check && (
              <span className="text-[11px] text-muted-foreground">
                {relativeTime(check.checked_at)}
              </span>
            )}
          </div>

          {check?.ok && (
            <dl className="divide-y divide-border rounded-md border border-border px-3 py-1">
              <div className="flex items-center justify-between gap-3 py-1">
                <dt className="text-xs text-muted-foreground">{t("common.exitIp")}</dt>
                <dd className="flex items-center gap-1">
                  <button
                    type="button"
                    className="cursor-pointer font-mono text-xs text-foreground underline-offset-2 hover:underline"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(check.ip ?? "")
                        .then(() => toast.success(t("common.exitIpCopied")));
                    }}
                  >
                    {check.ip}
                  </button>
                  <span className="text-muted-foreground">
                    <LuCopy className="size-3" />
                  </span>
                </dd>
              </div>
              <Row label={t("common.location")} value={location || "—"} />
              <Row label={t("common.took")} value={`${check.latency_ms} ms`} />
            </dl>
          )}

          {check && !check.ok && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {check.error || t("common.proxyUnreachable")}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={checking}
            onClick={() => {
              void run();
            }}
          >
            <LuRefreshCw className="size-3.5" />
            {check ? t("common.checkAgain") : t("common.checkProxy")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
