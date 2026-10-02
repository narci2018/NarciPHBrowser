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
import { THEME_OPTIONS, type ThemeMode } from "@/lib/themes";

interface DownloadState {
  phase: string;
  percent: number;
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
  const versions = parseVersions(versionLine);
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        <Section title="Appearance" description="How the application looks.">
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-xs text-foreground">Theme</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                System follows your operating system setting.
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
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>

        <Section title="Engine" description="The browser build profiles launch into.">
          <Row label="Target" value={versions.engine} />
          <Row label="Core" value={versions.core} />
          <Row label="Sidecar" value={versions.sidecar} />
        </Section>

        {download && (
          <Section
            title="Downloading engine"
            description="The profile list is available as soon as the install finishes."
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
          <Section title="Engine">
            <div className="space-y-2 px-4 py-3">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </Section>
        )}

        <Section
          title="Profiles store"
          description="Where identities are kept: seed, options and hand edits."
        >
          <Row label="Stored as" value="seed + options (sparse overrides)" />
          <Row label="Identity" value="drawn on read, never stored" />
        </Section>

        <Section title="Application" description="Build and window information.">
          <Row label="Application" value="NarciPHBrowser" />
          <Row label="Window" value="Frameless, Windows controls" />
        </Section>
      </div>
    </div>
  );
}
