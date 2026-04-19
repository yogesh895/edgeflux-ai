import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DataError } from "@/components/DataError";
import { getRiskFactors, queryKeys } from "@/lib/api";
import type { RiskFactor } from "@/types";
import { cn } from "@/lib/utils";

type SortKey = "name" | "impact_usd_m" | "probability";
type SortDir = "asc" | "desc";

interface RiskFactorsTableProps {
  siteId: string;
}

export function RiskFactorsTable({ siteId }: RiskFactorsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("impact_usd_m");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const factorsQuery = useQuery({
    queryKey: queryKeys.riskFactors(siteId),
    queryFn: () => getRiskFactors(siteId),
    enabled: !!siteId,
  });

  const sorted = useMemo(() => {
    const data: RiskFactor[] = factorsQuery.data?.factors ?? [];
    const copy = [...data];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "desc" ? bv - av : av - bv;
      }
      return sortDir === "desc"
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });
    return copy;
  }, [factorsQuery.data, sortKey, sortDir]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  if (factorsQuery.isError) {
    return (
      <DataError
        message="Failed to load risk factors."
        onRetry={() => factorsQuery.refetch()}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead label="Factor" active={sortKey === "name"} dir={sortDir} onClick={() => toggle("name")} />
          <SortableHead
            label="Impact on P50 NPV ($M)"
            active={sortKey === "impact_usd_m"}
            dir={sortDir}
            onClick={() => toggle("impact_usd_m")}
            align="right"
          />
          <SortableHead
            label="Probability"
            active={sortKey === "probability"}
            dir={sortDir}
            onClick={() => toggle("probability")}
            align="right"
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {factorsQuery.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell colSpan={3}>
                <Skeleton className="h-5 w-full" />
              </TableCell>
            </TableRow>
          ))
        ) : (
          sorted.map((f) => (
            <TableRow key={f.name}>
              <TableCell className="font-medium">{f.name}</TableCell>
              <TableCell
                className={cn(
                  "text-right font-semibold tabular-nums",
                  f.impact_usd_m < 0 ? "text-[hsl(0_72%_60%)]" : "text-[hsl(150_55%_50%)]",
                )}
              >
                {f.impact_usd_m > 0 ? "+" : ""}
                {f.impact_usd_m}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {(f.probability * 100).toFixed(0)}%
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  const Icon = active ? (dir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" && "ml-auto",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </TableHead>
  );
}
