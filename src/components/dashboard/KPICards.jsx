import React from 'react';
import { Card } from '@/components/ui/card';
import {
  ClipboardList,
  Target,
  TrendingUp,
  Percent,
  AlertTriangle,
  FileText,
} from 'lucide-react';

const kpiConfig = [
  {
    key: 'plannedItems',
    label: 'Ítems Planificados',
    icon: ClipboardList,
    iconColor: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  {
    key: 'plannedTotal',
    label: 'Planificado Total',
    icon: Target,
    iconColor: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
  },
  {
    key: 'executedTotal',
    label: 'Ejecutado Acumulado',
    icon: TrendingUp,
    iconColor: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
  },
  {
    key: 'weightedProgress',
    label: '% Avance Ponderado',
    icon: Percent,
    iconColor: 'text-amber-600',
    bgColor: 'bg-amber-50',
    suffix: '%',
  },
  {
    key: 'blocked',
    label: 'Frentes Bloqueados',
    icon: AlertTriangle,
    iconColor: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  {
    key: 'dailyReports',
    label: 'Reportes Diarios',
    icon: FileText,
    iconColor: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
];

export default function KPICards({ masterItems = [], dailyLogs = [] }) {
  const plannedItems = masterItems.length;
  const plannedTotal = masterItems.reduce(
    (sum, item) => sum + (item.planned_qty || 0),
    0
  );
  const executedTotal = masterItems.reduce(
    (sum, item) => sum + (item.executed_qty || 0),
    0
  );

  const weightedProgress =
    plannedTotal > 0 ? ((executedTotal / plannedTotal) * 100).toFixed(1) : '0.0';

  const blocked = masterItems.filter((item) => item.status === 'bloqueado').length;
  const dailyReports = dailyLogs.length;

  const values = {
    plannedItems,
    plannedTotal,
    executedTotal,
    weightedProgress,
    blocked,
    dailyReports,
  };

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {kpiConfig.map((kpi) => {
        const Icon = kpi.icon;

        return (
          <Card
            key={kpi.key}
            className="border-0 p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-start justify-between">
              <div className={`rounded-lg p-2 ${kpi.bgColor}`}>
                <Icon className={`h-4 w-4 ${kpi.iconColor}`} />
              </div>
            </div>

            <p className="text-2xl font-bold text-foreground">
              {values[kpi.key]}
              {kpi.suffix || ''}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">{kpi.label}</p>
          </Card>
        );
      })}
    </div>
  );
}