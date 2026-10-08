import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import ItemScopeSummary from '@/components/common/ItemScopeSummary';
import { getUnitLabel } from '@/constants/activityScope';

const statusLabel = {
  pendiente: 'Pendiente', en_ejecucion: 'En ejecución', completado: 'Completado', bloqueado: 'Bloqueado',
  'piso bloqueado': 'Piso Bloqueado',
};
const statusColor = {
  pendiente: 'bg-slate-100 text-slate-600', en_ejecucion: 'bg-blue-50 text-blue-700',
  completado: 'bg-emerald-50 text-emerald-700', bloqueado: 'bg-red-50 text-red-700',
  'piso bloqueado': 'bg-rose-50 text-rose-700',
};

export default function ItemInfo({ item, hasUnsignedLogs }) {
  const rawPct = item.planned_qty > 0 ? Math.round((item.executed_qty || 0) / item.planned_qty * 100) : 0;
  const pct = Math.min(rawPct, 100);
  const isCompleted = item.status === 'completado' || pct >= 100;
  const displayStatus = (isCompleted && hasUnsignedLogs) ? 'pendiente' : item.status;

  let crewSize = item.crew_size || 0;
  if (!crewSize && item.crew_members) {
    if (Array.isArray(item.crew_members)) {
      crewSize = item.crew_members.length;
    } else if (typeof item.crew_members === 'string') {
      try {
        const parsed = JSON.parse(item.crew_members);
        if (Array.isArray(parsed)) crewSize = parsed.length;
      } catch (e) {}
    }
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">{item.activity}</h2>
            <ItemScopeSummary item={item} hideActivity />
          </div>
          <Badge className={`${statusColor[displayStatus]} shrink-0`}>
            {statusLabel[displayStatus]}
          </Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-muted-foreground">F. Inicio</p>
            <p className="text-sm font-medium">{item.start_date || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">F. Término</p>
            <p className="text-sm font-medium">{item.end_date || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cuadrilla</p>
            <p className="text-sm font-medium">{item.crew_name || '—'} ({crewSize} pers.)</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Ejecutado / Plan </p>
            <p className="text-sm font-medium">{item.executed_qty || 0} / {item.planned_qty} {getUnitLabel(item.unit)}</p>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Avance</span>
            <span className="font-semibold">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
        {item.restrictions && (
          <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-100">
            <p className="text-xs font-medium text-red-700">Restricciones: {item.restrictions}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}