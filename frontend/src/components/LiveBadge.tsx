import { useIsFetching, useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getHealth, queryKeys } from "@/lib/api";

/** "Live" badge — green when /api/health is reachable & ok, amber "Offline" otherwise. */
export function LiveBadge() {
  const fetching = useIsFetching();
  const { data, isError } = useQuery({
    queryKey: queryKeys.health,
    queryFn: getHealth,
    refetchInterval: 30_000,
    retry: false,
  });
  const isLive = !isError && data?.status === "ok";

  return (
    <span
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium sm:inline-flex",
        isLive
          ? "border-[hsl(150_55%_50%/0.3)] bg-[hsl(150_55%_50%/0.1)] text-[hsl(150_55%_50%)]"
          : "border-[hsl(38_92%_55%/0.3)] bg-[hsl(38_92%_55%/0.1)] text-[hsl(38_92%_65%)]",
      )}
      title={
        isLive
          ? fetching > 0
            ? `${fetching} queries in flight`
            : "All data sources live"
          : "Backend unreachable"
      }
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          isLive ? "bg-[hsl(150_55%_50%)]" : "bg-[hsl(38_92%_55%)]",
          fetching > 0 && isLive && "animate-pulse",
        )}
      />
      {isLive ? "Live" : "Offline"}
    </span>
  );
}
