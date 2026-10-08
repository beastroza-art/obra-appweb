import React from "react";
import { Layers3, Building2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { summarizeFloorList } from "@/utils/floors";
import { cn } from "@/lib/utils";
import {
  SCOPE_TYPES,
  getScopeTypeLabel,
  getScopeDisplayLabel,
  normalizeScopeTypeValue,
} from "@/constants/activityScope";

export default function ItemScopeSummary({ item, className, hideActivity = false }) {
  if (!item) return null;

  const scopeType = normalizeScopeTypeValue(item?.scope_type);
  const scopeLabel = getScopeDisplayLabel(item);
  const floorSummary = summarizeFloorList(item?.floor);
  const hasManyFloors =
    scopeType === SCOPE_TYPES.PISO && floorSummary.count > 6;
  const visibleFloors = hasManyFloors
    ? floorSummary.floors.slice(0, 6)
    : floorSummary.floors;

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {item.project && (
          <span className="font-medium text-foreground/80">{item.project}</span>
        )}
        {item.tower && (
          <span>{item.tower}</span>
        )}
        {item.activity && !hideActivity && <span>{item.activity}</span>}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className="max-w-full gap-1 border-slate-200 bg-white text-[11px] text-slate-600"
        >
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{getScopeTypeLabel(scopeType)}</span>
        </Badge>

        <Badge
          variant="secondary"
          className="max-w-full gap-1.5 border-0 bg-slate-100 text-xs text-slate-700"
          title={
            scopeType === SCOPE_TYPES.PISO
              ? floorSummary.floors.join(", ")
              : scopeLabel
          }
        >
          <Layers3 className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {scopeType === SCOPE_TYPES.PISO ? floorSummary.label : scopeLabel}
          </span>
        </Badge>

        {hasManyFloors && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
              >
                Ver pisos
              </Button>
            </PopoverTrigger>

            <PopoverContent align="start" className="w-[min(92vw,420px)] p-3">
              <div className="mb-2 text-xs font-medium text-foreground">
                {floorSummary.label}
              </div>

              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {floorSummary.floors.map((floor) => (
                  <Badge
                    key={floor}
                    variant="outline"
                    className="bg-background text-[11px] font-medium"
                  >
                    {floor}
                  </Badge>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {!hasManyFloors &&
          visibleFloors.map((floor) => null)}
      </div>
    </div>
  );
}
