import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-md bg-muted/50", className)}
      role="status"
      aria-label="Loading"
      {...props}
    >
      <div className="absolute inset-0 ge-shimmer" />
    </div>
  );
}

export { Skeleton };
