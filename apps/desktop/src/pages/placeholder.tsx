import type { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";

interface PlaceholderPageProps {
  title: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
}

export function PlaceholderPage({ title, description, Icon }: PlaceholderPageProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="grid size-11 place-items-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Badge variant="outline" className="text-muted-foreground">
        Coming soon
      </Badge>
    </div>
  );
}
