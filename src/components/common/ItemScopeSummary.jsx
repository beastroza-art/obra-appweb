import React from "react";
import { Layers3, Building2, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  const scopeLabel = getScopeDisplayLabel(item, true);
  const floorSummary = summarizeFloorList(item?.floor);

  const depts = String(item?.departments || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const isMultiFloor = scopeType === SCOPE_TYPES.MULTIPLES_PISOS;
  const isDept = scopeType === SCOPE_TYPES.DEPARTAMENTO;

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {item.project && (
          <span className="font-semibold text-foreground/80">{item.project}</span>
        )}
        {item.tower && (
          <>
            <span>•</span>
            <span>{item.tower}</span>
          </>
        )}
        {item.activity && !hideActivity && (
          <>
            <span>•</span>
            <span>{item.activity}</span>
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {/* Caso A: Múltiples Pisos interactivo con Popover */}
        {isMultiFloor ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer"
              >
                <Layers3 className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                <span>Múltiples Pisos ({floorSummary.count} pisos)</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(92vw,400px)] p-3 z-50">
              <div className="mb-2.5 flex items-center justify-between border-b pb-2">
                <span className="text-xs font-bold text-slate-800">
                  Pisos Asignados ({floorSummary.count} niveles)
                </span>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {item.tower}
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-56 overflow-y-auto pr-1">
                {floorSummary.floors.map((fl) => (
                  <span
                    key={fl}
                    className="flex items-center justify-center rounded border border-slate-200 bg-slate-50 py-1 px-1.5 text-xs font-medium text-slate-800 text-center shadow-2xs hover:bg-slate-100 transition-colors"
                  >
                    {fl}
                  </span>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : isDept && depts.length > 0 ? (
          /* Caso B: Por Departamento interactivo con Popover en cuadrícula ordenada */
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer"
              >
                <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span>{item.floor || "Piso"} ({depts.length} departamentos)</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(92vw,440px)] p-3 z-50">
              <div className="mb-2.5 flex items-center justify-between border-b pb-2">
                <span className="text-xs font-bold text-slate-800">
                  Departamentos ({depts.length} unidades en {item.floor})
                </span>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {item.tower}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 max-h-60 overflow-y-auto pr-1">
                {depts.map((d) => (
                  <span
                    key={d}
                    className="flex items-center justify-center rounded border border-blue-200 bg-blue-50/80 py-1 px-1 text-xs font-semibold text-blue-900 text-center shadow-2xs hover:bg-blue-100 transition-colors"
                  >
                    {/^\d+$/.test(d) ? `Dpto ${d}` : d}
                  </span>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          /* Caso C: Pisos normales o Recintos Técnicos limpios */
          <>
            {scopeType !== SCOPE_TYPES.DEPARTAMENTO && scopeType !== SCOPE_TYPES.PISO && (
              <Badge
                variant="outline"
                className="max-w-full gap-1 border-slate-200 bg-white text-[11px] text-slate-600"
              >
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{getScopeTypeLabel(scopeType)}</span>
              </Badge>
            )}

            <Badge
              variant="secondary"
              className="max-w-full gap-1.5 border-0 bg-slate-100 text-xs text-slate-700"
              title={scopeLabel}
            >
              <Layers3 className="h-3 w-3 shrink-0" />
              <span className="truncate">{scopeLabel}</span>
            </Badge>
          </>
        )}
      </div>
    </div>
  );
}
