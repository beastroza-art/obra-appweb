import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Clock,
  Zap,
  AlertTriangle,
  Lock,
  PenTool,
  Layers,
} from "lucide-react";

/**
 * Barra de Chips / Pills de Situación Operativa
 * Permite filtrar rápidamente por:
 * - Todos
 * - En Ejecución / Liberados
 * - Atrasados
 * - Bloqueados
 * - Pendientes de Firma
 * - Por Iniciar (Futuros)
 * - Terminados
 */
export default function OperationalStatusBar({
  items = [],
  dailyLogs = [],
  selectedStatus = "all",
  onSelectStatus,
  className = "",
}) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Set de IDs de master_items que tienen reportes diarios sin firma de capataz
  const unsignedItemIds = useMemo(() => {
    const set = new Set();
    if (!Array.isArray(dailyLogs)) return set;
    dailyLogs.forEach((log) => {
      const hasSig =
        log.capataz_signature && String(log.capataz_signature).trim() !== "";
      if (!hasSig && log.master_item_id) {
        set.add(Number(log.master_item_id));
      }
    });
    return set;
  }, [dailyLogs]);

  // Contadores dinámicos según los items disponibles en la vista actual
  const counts = useMemo(() => {
    let completed = 0;
    let overdue = 0;
    let inProgress = 0;
    let blocked = 0;
    let pending = 0;
    let pendingSignature = 0;

    (items || []).forEach((item) => {
      const planned = Number(item.planned_qty || 0);
      const executed = Number(item.executed_qty || 0);
      const pct =
        planned > 0
          ? Math.min(Math.round((executed / planned) * 100), 100)
          : 0;

      const isCompleted =
        pct >= 100 ||
        item.status === "completado" ||
        item.release_status === "terminado";

      const hasActiveRestriction = Boolean(
        item.restrictions &&
        String(item.restrictions).trim() &&
        !["—", "-", "sin restriccion", "sin restricción", "ninguna", "no"].includes(
          String(item.restrictions).trim().toLowerCase()
        )
      );

      const isBlocked =
        !isCompleted && (
          item.status === "bloqueado" ||
          item.status === "piso bloqueado" ||
          (hasActiveRestriction && item.status !== "en_ejecucion")
        );

      const isOverdue =
        !isCompleted && item.end_date && item.end_date < todayStr;

      const hasUnsigned = unsignedItemIds.has(Number(item.id));

      if (isCompleted) {
        completed++;
      } else {
        if (isOverdue) overdue++;
        if (isBlocked) blocked++;

        if (!isOverdue && !isBlocked) {
          const isInProgress =
            pct > 0 ||
            (item.start_date && item.start_date <= todayStr) ||
            item.status === "en_ejecucion" ||
            item.release_status === "liberado";

          if (isInProgress) {
            inProgress++;
          } else {
            pending++;
          }
        }
      }

      if (hasUnsigned) {
        pendingSignature++;
      }
    });

    return {
      all: items.length,
      in_progress: inProgress,
      overdue,
      blocked,
      pending_signature: pendingSignature,
      pending,
      completed,
    };
  }, [items, unsignedItemIds, todayStr]);

  const pills = [
    {
      id: "all",
      label: "Todos",
      icon: Layers,
      count: counts.all,
      activeColor: "bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/20",
      inactiveColor: "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200",
      badgeActive: "bg-slate-800 text-white",
      badgeInactive: "bg-slate-200/80 text-slate-800",
    },
    {
      id: "in_progress",
      label: "En Ejecución",
      icon: Zap,
      count: counts.in_progress,
      activeColor: "bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/25",
      inactiveColor: "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200",
      badgeActive: "bg-blue-700 text-white",
      badgeInactive: "bg-blue-100 text-blue-800",
    },
    {
      id: "overdue",
      label: "Atrasados",
      icon: AlertTriangle,
      count: counts.overdue,
      activeColor: "bg-red-600 text-white shadow-sm ring-2 ring-red-500/25",
      inactiveColor: "bg-red-50 hover:bg-red-100 text-red-700 border-red-200",
      badgeActive: "bg-red-700 text-white",
      badgeInactive: "bg-red-100 text-red-800 font-bold",
    },
    {
      id: "blocked",
      label: "Bloqueados",
      icon: Lock,
      count: counts.blocked,
      activeColor: "bg-rose-600 text-white shadow-sm ring-2 ring-rose-500/25",
      inactiveColor: "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200",
      badgeActive: "bg-rose-700 text-white",
      badgeInactive: "bg-rose-100 text-rose-800",
    },
    {
      id: "pending_signature",
      label: "Por Firmar",
      icon: PenTool,
      count: counts.pending_signature,
      activeColor: "bg-amber-600 text-white shadow-sm ring-2 ring-amber-500/25",
      inactiveColor: "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200",
      badgeActive: "bg-amber-700 text-white",
      badgeInactive: "bg-amber-100 text-amber-900 font-bold",
    },
    {
      id: "pending",
      label: "Por Iniciar",
      icon: Clock,
      count: counts.pending,
      activeColor: "bg-slate-700 text-white shadow-sm ring-2 ring-slate-600/20",
      inactiveColor: "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200",
      badgeActive: "bg-slate-800 text-white",
      badgeInactive: "bg-slate-200 text-slate-700",
    },
    {
      id: "completed",
      label: "Terminados",
      icon: CheckCircle2,
      count: counts.completed,
      activeColor: "bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/25",
      inactiveColor: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200",
      badgeActive: "bg-emerald-700 text-white",
      badgeInactive: "bg-emerald-100 text-emerald-800 font-bold",
    },
  ];

  const handlePillClick = (pillId) => {
    if (selectedStatus === pillId) {
      onSelectStatus?.("all");
    } else {
      onSelectStatus?.(pillId);
    }
  };

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
        <span className="font-semibold uppercase tracking-wider text-slate-600">
          Situación Operativa:
        </span>
        {selectedStatus !== "all" && (
          <button
            type="button"
            onClick={() => onSelectStatus?.("all")}
            className="text-primary hover:underline font-medium text-[11px]"
          >
            ✕ Quitar filtro ({pills.find((p) => p.id === selectedStatus)?.label})
          </button>
        )}
      </div>

      <div className="w-full">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {pills.map((pill) => {
            const Icon = pill.icon;
            const isSelected = selectedStatus === pill.id;

            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => handlePillClick(pill.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-semibold transition-all select-none cursor-pointer shadow-3xs",
                  isSelected ? pill.activeColor : pill.inactiveColor
                )}
              >
                <Icon
                  className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    isSelected ? "text-white" : "opacity-80"
                  )}
                />
                <span>{pill.label}</span>
                <span
                  className={cn(
                    "ml-0.5 px-1.5 py-0.2 rounded-full text-[10.5px] font-bold tabular-nums",
                    isSelected ? pill.badgeActive : pill.badgeInactive
                  )}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
