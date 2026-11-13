import React from "react";
import { Card } from "@/components/ui/card";
import {
  TrendingUp,
  CheckCircle2,
  Clock,
  Target,
  AlertOctagon,
} from "lucide-react";

export default function KPICards({ masterItems = [], dailyLogs = [] }) {
  const totalItems = masterItems.length;

  // 1. % Avance General
  const plannedTotal = masterItems.reduce(
    (sum, item) => sum + (Number(item.planned_qty) || 100),
    0
  );
  const executedTotal = masterItems.reduce(
    (sum, item) => sum + (Number(item.executed_qty) || 0),
    0
  );
  const weightedProgress =
    plannedTotal > 0
      ? Number(((executedTotal / plannedTotal) * 100).toFixed(1))
      : 0;

  // 2. Culminación
  const completedItems = masterItems.filter((item) => {
    const planned = Number(item.planned_qty) || 100;
    const executed = Number(item.executed_qty) || 0;
    return executed >= planned || item.status === "completado";
  }).length;

  const completedPct =
    totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  // 3. En Ejecución
  const inProgressItems = masterItems.filter((item) => {
    const planned = Number(item.planned_qty) || 100;
    const executed = Number(item.executed_qty) || 0;
    return executed > 0 && executed < planned && item.status !== "completado";
  }).length;

  // 4. Por Iniciar
  const pendingItems = masterItems.filter((item) => {
    const executed = Number(item.executed_qty) || 0;
    return executed === 0 && item.status !== "completado";
  }).length;

  // Bloqueados
  const blockedItems = masterItems.filter(
    (item) => item.status === "bloqueado"
  ).length;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Avance General */}
      <Card className="border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Avance General
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-blue-600">
                {weightedProgress}%
              </span>
              <span className="text-xs font-medium text-slate-400">
                de 100%
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600 ring-1 ring-blue-500/10">
            <Target className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Promedio consolidado del proyecto
        </p>
      </Card>

      {/* 2. Culminación */}
      <Card className="border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Culminación
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-emerald-600">
                {completedItems}
              </span>
              <span className="text-xs font-medium text-slate-400">
                de {totalItems} tareas
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 ring-1 ring-emerald-500/10">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {completedPct}% del total finalizado al 100%
        </p>
      </Card>

      {/* 3. En Ejecución */}
      <Card className="border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              En Ejecución
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-amber-600">
                {inProgressItems}
              </span>
              <span className="text-xs font-medium text-slate-400">
                frentes activos
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600 ring-1 ring-amber-500/10">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>Tareas con avance en curso</span>
          {blockedItems > 0 && (
            <span className="flex items-center gap-1 font-semibold text-rose-600">
              <AlertOctagon className="h-3.5 w-3.5" />
              {blockedItems} bloqueado{blockedItems > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </Card>

      {/* 4. Por Iniciar */}
      <Card className="border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Por Iniciar
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-slate-700">
                {pendingItems}
              </span>
              <span className="text-xs font-medium text-slate-400">
                pendientes
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600 ring-1 ring-slate-200">
            <Clock className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Frentes en espera (0% de avance)
        </p>
      </Card>
    </div>
  );
}
