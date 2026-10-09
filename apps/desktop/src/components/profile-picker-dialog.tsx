import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { LuUser } from "react-icons/lu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProfilePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (profileId: string) => void;
}

export function ProfilePickerDialog({ open, onOpenChange, onPick }: ProfilePickerDialogProps) {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    invoke<{ profiles: { id: string; name: string }[] }>("list_profiles")
      .then((result) => setProfiles(result.profiles))
      .catch((error) => toast.error(String(error)))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("common.assignToProfile")}</DialogTitle>
          <DialogDescription>
            {t("common.assignToProfileDescription")}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-72 rounded-md border border-border">
          <div className="divide-y divide-border">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => onPick(profile.id)}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/50"
              >
                <LuUser className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {profile.name}
                </span>
              </button>
            ))}
            {profiles.length === 0 && !loading && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t("common.noProfilesForPicker")}
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
