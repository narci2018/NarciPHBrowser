import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { hostPortOf, parseImport, type ImportCandidate } from "@/lib/proxies";

interface ProxyImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ProxyImportDialog({ open, onOpenChange, onImported }: ProxyImportDialogProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    setText("");
    setBusy(false);
  }, [open]);

  const candidates = useMemo(() => (text.trim() ? parseImport(text) : []), [text]);

  const ready = candidates.filter(
    (candidate): candidate is Extract<ImportCandidate, { kind: "ready" }> =>
      candidate.kind === "ready",
  );
  const ambiguous = candidates.filter(
    (candidate): candidate is Extract<ImportCandidate, { kind: "ambiguous" }> =>
      candidate.kind === "ambiguous",
  );
  const invalid = candidates.filter(
    (candidate): candidate is Extract<ImportCandidate, { kind: "invalid" }> =>
      candidate.kind === "invalid",
  );

  const total = ready.length + ambiguous.length;

  const submit = async () => {
    if (busy || total === 0) return;
    setBusy(true);
    let done = 0;
    const items: { url: string; exitCountry?: string; suggestedName?: string }[] = [
      ...ready.map((candidate) => ({
        url: candidate.url,
        exitCountry: candidate.exitCountry,
        suggestedName: candidate.suggestedName,
      })),
      // Ambiguous lines have two plausible port positions; host:port:user:pass wins.
      ...ambiguous.map((candidate) => ({ url: candidate.options[0] })),
    ];
    try {
      for (const item of items) {
        const fallback = hostPortOf(item.url);
        const name = item.suggestedName?.trim() || fallback || item.url;
        await invoke("create_proxy", {
          spec: {
            name,
            url: item.url,
            exit_country: item.exitCountry ?? null,
          },
        });
        done += 1;
      }
      toast.success(t("common.importedCount", { count: done}));
      onImported();
      onOpenChange(false);
    } catch (error) {
      if (done > 0) {
        toast.error(t("common.importFailed", { count: done, error: String(error) }));
        onImported();
      } else {
        toast.error(String(error));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("common.importProxies")}</DialogTitle>
          <DialogDescription>
            {t("common.importProxiesDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            autoFocus
            rows={7}
            placeholder={t("common.importProxiesPlaceholder")}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />

          {candidates.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">
                {t("common.readyCount", { ready: ready.length, ambiguous: ambiguous.length, invalid: invalid.length })}
              </p>
              {ready.map((candidate, index) => (
                <p key={`r-${index}`} className="truncate font-mono text-[11px] text-success-text">
                  {candidate.url}
                </p>
              ))}
              {ambiguous.map((candidate, index) => (
                <p key={`a-${index}`} className="truncate font-mono text-[11px] text-warning-text">
                  {candidate.options[0]}
                </p>
              ))}
              {invalid.map((candidate, index) => (
                <p key={`i-${index}`} className="truncate text-[11px] text-destructive">
                  {candidate.source}: {candidate.reason}
                </p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || total === 0}
            onClick={() => {
              void submit();
            }}
          >
            {busy ? t("common.importing") : t("common.importCount", { count: total})}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
