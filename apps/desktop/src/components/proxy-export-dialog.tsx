import { useEffect, useMemo, useRef, useState } from "react";
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
      toast.success("Copied to clipboard");
    } catch {
      selectAll();
      toast.error("Clipboard unavailable — selected, press Ctrl+C");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Export proxies</DialogTitle>
          <DialogDescription>
            {proxies.length} prox{proxies.length === 1 ? "y" : "ies"}. TXT is one URL per line;
            JSON also carries the name and exit country for a round-trip import.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={format} onValueChange={(value) => setFormat(value as "txt" | "json")}>
          <TabsList>
            <TabsTrigger value="txt">TXT</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
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
            Close
          </Button>
          <Button type="button" size="sm" onClick={() => void copy()}>
            <LuCopy className="size-3.5" />
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
