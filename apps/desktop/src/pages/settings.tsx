import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { LuSave } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import i18n from "@/i18n";
import { THEME_OPTIONS, type ThemeMode } from "@/lib/themes";

/** Language names are shown in their own language, so they are not translated. */
const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh", label: "简体中文" },
];

interface DownloadState {
  phase: string;
  percent: number;
}

interface SecurityInfo {
  store_sealed: boolean;
  store_seal_note: string;
}

interface SettingsPageProps {
  versionLine: string;
  download: DownloadState | null;
}

const parseVersions = (line: string) => {
  const sidecar = line.match(/sidecar\s+(\S+)/)?.[1] ?? "—";
  const core = line.match(/core\s+([^,)]+)/)?.[1]?.trim() ?? "—";
  const engine = line.match(/engine\s+([^)]+)/)?.[1]?.trim() ?? "—";
  return { sidecar, core, engine };
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs text-foreground" title={value}>
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium text-card-foreground">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function SettingsPage({ versionLine, download }: SettingsPageProps) {
  const { t } = useTranslation();
  const versions = parseVersions(versionLine);
  const { theme, setTheme } = useTheme();
  const [security, setSecurity] = useState<SecurityInfo | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);

  useEffect(() => {
    invoke<SecurityInfo>("security_info")
      .then(setSecurity)
      .catch(() => setSecurity(null));
  }, []);

  const saveDiagnostics = async () => {
    if (diagnosticsBusy) return;
    setDiagnosticsBusy(true);
    try {
      const result = await invoke<{ cancelled?: boolean; path?: string }>(
        "collect_diagnostics",
        {},
      );
      if (!result.cancelled) {
        toast.success(t("common.diagnosticsSaved"), { description: result.path });
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDiagnosticsBusy(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        <Section title={t("common.appearance")} description={t("common.appearanceDescription")}>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-xs text-foreground">{t("common.theme")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("common.systemFollows")}
              </p>
            </div>
            <Select
              value={theme}
              onValueChange={(value) => setTheme(value as ThemeMode)}
            >
              <SelectTrigger size="sm" className="w-32 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-xs text-foreground">{t("common.language")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("common.languageDescription")}
              </p>
            </div>
            <Select
              value={i18n.resolvedLanguage ?? "en"}
              onValueChange={(value) => {
                void i18n.changeLanguage(value);
              }}
            >
              <SelectTrigger size="sm" className="w-32 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>

        <Section title={t("common.engine")} description={t("common.engineDescription")}>
          <Row label={t("common.target")} value={versions.engine} />
          <Row label={t("common.core")} value={versions.core} />
          <Row label={t("common.sidecar")} value={versions.sidecar} />
        </Section>

        {download && (
          <Section
            title={t("common.downloadingEngine")}
            description={t("common.downloadingEngineDescription")}
          >
            <div className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{download.phase}</span>
                <span className="tabular-nums text-foreground">
                  {Math.round(download.percent)}%
                </span>
              </div>
              <Progress value={download.percent} />
            </div>
          </Section>
        )}

        {!versionLine && (
          <Section title={t("common.engine")}>
            <div className="space-y-2 px-4 py-3">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </Section>
        )}

        <Section
          title={t("common.profilesStore")}
          description={t("common.profilesStoreDescription")}
        >
          <Row label={t("common.storedAs")} value={t("common.seedOptions")} />
          <Row label={t("common.identityDrawn")} value={t("common.drawnOnRead")} />
        </Section>

        <Section title={t("common.security")} description={t("common.securityDescription")}>
          {security === null ? (
            <div className="space-y-2 px-4 py-3">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ) : (
            <div className="border-b border-border px-4 py-2.5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">{t("common.storeFiles")}</span>
                <span className="text-xs text-foreground">
                  {security.store_sealed ? t("common.sealed") : t("common.plaintext")}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {security.store_seal_note}
              </p>
            </div>
          )}
        </Section>

        <Section title={t("common.application")} description={t("common.applicationDescription")}>
          <Row label={t("common.application")} value={t("common.applicationName")} />
          <Row label={t("common.window")} value={t("common.windowFrameless")} />
        </Section>

        <Section
          title={t("common.diagnostics")}
          description={t("common.diagnosticsDescription")}
        >
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <p className="text-xs text-muted-foreground">
              {t("common.diagnosticsHint")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5 text-xs"
              disabled={diagnosticsBusy}
              onClick={() => void saveDiagnostics()}
            >
              <LuSave className="size-3.5" />
              {diagnosticsBusy ? t("common.saving") : t("common.saveDiagnostics")}
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
