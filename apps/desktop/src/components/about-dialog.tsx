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
    { label: "Sidecar", value: line.match(/sidecar\s+(\S+)/)?.[1] ?? "—" },
    { label: "Core", value: line.match(/core\s+([^,)]+)/)?.[1]?.trim() ?? "—" },
    { label: "Engine", value: line.match(/engine\s+([^)]+)/)?.[1]?.trim() ?? "—" },
  ];
};

export function AboutDialog({ open, onOpenChange, versionLine }: AboutDialogProps) {
  const versions = parseVersions(versionLine);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Logo className="size-8 text-foreground" />
            <div>
              <DialogTitle>NarciPHBrowser</DialogTitle>
              <DialogDescription className="mt-1">
                Deterministic fingerprint profiles
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-hidden rounded-md border border-border bg-card">
          {versions.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 border-b border-border px-3 py-2 last:border-b-0"
            >
              <span className="text-[11px] text-muted-foreground">{row.label}</span>
              <span className="truncate font-mono text-[11px] text-foreground" title={row.value}>
                {row.value}
              </span>
            </div>
          ))}
          {versions.length === 0 && (
            <div className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
              starting…
            </div>
          )}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Identities are drawn from a seed plus options and never stored. The same
          seed always presents the same machine, and a coherence check refuses any
          combination the pages would catch.
        </p>
      </DialogContent>
    </Dialog>
  );
}
