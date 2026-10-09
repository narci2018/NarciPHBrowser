import { useTranslation } from "react-i18next";
import { Logo } from "@/components/icons/logo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionLine: string;
}

const parseVersions = (line: string) => {
  if (!line) return [];
  return [
    { labelKey: "common.sidecar", value: line.match(/sidecar\s+(\S+)/)?.[1] ?? "—" },
    { labelKey: "common.core", value: line.match(/core\s+([^,)]+)/)?.[1]?.trim() ?? "—" },
    { labelKey: "common.engine", value: line.match(/engine\s+([^)]+)/)?.[1]?.trim() ?? "—" },
  ];
};

export function AboutDialog({ open, onOpenChange, versionLine }: AboutDialogProps) {
  const { t } = useTranslation();
  const versions = parseVersions(versionLine);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Logo className="size-8 text-foreground" />
            <div>
              <DialogTitle>{t("common.aboutTitle")}</DialogTitle>
              <DialogDescription className="mt-1">
                {t("common.aboutDescription")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-hidden rounded-md border border-border bg-card">
          {versions.map((row) => (
            <div
              key={row.labelKey}
              className="flex items-center justify-between gap-4 border-b border-border px-3 py-2 last:border-b-0"
            >
              <span className="text-[11px] text-muted-foreground">{t(row.labelKey)}</span>
              <span className="truncate font-mono text-[11px] text-foreground" title={row.value}>
                {row.value}
              </span>
            </div>
          ))}
          {versions.length === 0 && (
            <div className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
              {t("common.versionsStarting")}
            </div>
          )}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("common.aboutBody")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
