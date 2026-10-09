import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LuCopy } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatExport, type StoredProxy } from "@/lib/proxies";

interface ProxyExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proxies: StoredProxy[];
}

export function ProxyExportDialog({ open, onOpenChange, proxies }: ProxyExportDialogProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<"txt" | "json">("txt");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) return;
    setFormat("txt");
  }, [open]);

  const content = useMemo(() => formatExport(proxies, format), [proxies, format]);

  const selectAll = () => {
    const node = textareaRef.current;
    if (!node) return;
    node.focus();
    node.select();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(t("common.copied"));
    } catch {
      selectAll();
      toast.error(t("common.copyFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("common.exportProxies")}</DialogTitle>
          <DialogDescription>
            {t("common.exportProxiesDescription", { count: proxies.length})}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={format} onValueChange={(value) => setFormat(value as "txt" | "json")}>
          <TabsList>
            <TabsTrigger value="txt">{t("common.txt")}</TabsTrigger>
            <TabsTrigger value="json">{t("common.json")}</TabsTrigger>
          </TabsList>
        </Tabs>

        <Textarea
          ref={textareaRef}
          readOnly
          rows={9}
          className="font-mono text-xs"
          value={content}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t("common.close")}
          </Button>
          <Button type="button" size="sm" onClick={() => void copy()}>
            <LuCopy className="size-3.5" />
            {t("common.copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
