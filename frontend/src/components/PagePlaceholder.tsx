import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface PagePlaceholderProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  description?: string;
}

export function PagePlaceholder({ title, subtitle, icon: Icon, description }: PagePlaceholderProps) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <Card className="flex flex-1 items-center justify-center border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Coming soon</p>
            {description && (
              <p className="max-w-md text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
