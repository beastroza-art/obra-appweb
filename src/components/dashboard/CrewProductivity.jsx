import React from 'react';
import { differenceInCalendarDays } from 'date-fns';
import { Users } from 'lucide-react';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const statusColors = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-red-500',
  none: 'bg-slate-300',
};

const statusLabels = {
  green: 'Sobre meta',
  yellow: 'En meta',
  red: 'Bajo meta',
  none: 'Sin avance',
};

function getWorkerCount(logs, members) {
  const workerSet = new Set();

  logs.forEach((log) => {
    log.crew_workers?.forEach((worker) => {
      if (worker.name) workerSet.add(worker.name);
    });
  });

  return workerSet.size || (members?.length || 0);
}

function getParsedMembers(crew_members) {
  if (Array.isArray(crew_members)) return crew_members;
  if (typeof crew_members === "string") {
    try {
      const parsed = JSON.parse(crew_members);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getLogCrewHours(log) {
  const workerHours = Array.isArray(log.crew_workers)
    ? log.crew_workers.map((worker) => Number(worker.hours || 0))
    : [];

  const totalWorkerHours = workerHours.reduce((sum, hours) => sum + hours, 0);
  const maxWorkerHours = Math.max(...workerHours, 0);
  const logHours = Number(log.hours_worked || 0);

  if (logHours <= 0) return maxWorkerHours;

  // Legacy logs may have stored person-hours, e.g. 2 workers x 8h = 16h.
  // For crew productivity we want shift hours, so collapse that case to 8h.
  if (workerHours.length > 1 && logHours === totalWorkerHours) {
    return maxWorkerHours;
  }

  return logHours;
}

function getExpectedProgress(items, logs) {
  const itemsWithLogs = new Set(logs.map((log) => log.master_item_id));
  const today = new Date();

  let totalExpected = 0;
  let itemsEvaluated = 0;

  items.forEach((item) => {
    if (!itemsWithLogs.has(item.id)) return;

    if (!item.start_date || !item.end_date) {
      itemsEvaluated++;
      totalExpected += item.planned_qty || 0;
      return;
    }

    itemsEvaluated++;

    const start = new Date(item.start_date);
    const end = new Date(item.end_date);

    if (today < start) return;

    const totalDays = differenceInCalendarDays(end, start) + 1;
    const elapsedDays = Math.min(
      differenceInCalendarDays(today, start) + 1,
      totalDays
    );

    totalExpected += (item.planned_qty || 0) * (elapsedDays / totalDays);
  });

  return { totalExpected, itemsEvaluated };
}

function getCrewStatus(totalExecuted, totalExpected, itemsEvaluated) {
  if (totalExecuted === 0) {
    return 'none';
  }
  if (itemsEvaluated === 0 || totalExpected <= 0) {
    return 'green';
  }

  const vsExpected = totalExecuted / totalExpected;

  if (vsExpected >= 0.9) return 'green';
  if (vsExpected >= 0.6) return 'yellow';
  return 'red';
}

export default function CrewProductivity({ masterItems = [], dailyLogs = [] }) {
  const crewMap = {};
  const itemsById = Object.fromEntries(
    masterItems.map((item) => [item.id, item])
  );

  masterItems.forEach((item) => {
    const crew = item.crew_name || 'Sin asignar';

    if (!crewMap[crew]) {
      crewMap[crew] = {
        crew,
        members: getParsedMembers(item.crew_members),
        items: [],
        logs: [],
      };
    } else {
      if (crewMap[crew].members.length === 0) {
        crewMap[crew].members = getParsedMembers(item.crew_members);
      }
    }

    crewMap[crew].items.push(item);
  });

  dailyLogs.forEach((log) => {
    const item = itemsById[log.master_item_id];
    const crew = item?.crew_name || 'Sin asignar';

    if (crewMap[crew]) {
      crewMap[crew].logs.push(log);
    }
  });

  const crews = Object.values(crewMap).map((crewData) => {
    const totalHours = crewData.logs.reduce(
      (sum, log) => sum + getLogCrewHours(log),
      0
    );

    const totalExecuted = crewData.items.reduce(
      (sum, item) => sum + (item.executed_qty || 0),
      0
    );

    const totalPlanned = crewData.items.reduce(
      (sum, item) => sum + (item.planned_qty || 0),
      0
    );

    const rendimiento =
      totalHours > 0 ? (totalExecuted / totalHours).toFixed(2) : '—';

    const workerCount = getWorkerCount(crewData.logs, crewData.members);
    const { totalExpected, itemsEvaluated } = getExpectedProgress(
      crewData.items,
      crewData.logs
    );

    const status = getCrewStatus(totalExecuted, totalExpected, itemsEvaluated);

    return {
      ...crewData,
      totalHours,
      totalExecuted,
      totalPlanned,
      rendimiento,
      workerCount,
      status,
    };
  });

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Users className="h-4 w-4 text-accent" />
          Productividad por Cuadrilla
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Cuadrilla</TableHead>
                <TableHead className="text-center text-xs">Personal</TableHead>
                <TableHead className="text-right text-xs">Horas</TableHead>
                <TableHead className="text-right text-xs">Ejecutado</TableHead>
                <TableHead className="text-right text-xs">Planificado</TableHead>
                <TableHead className="text-right text-xs">Rend.</TableHead>
                <TableHead className="text-center text-xs">Estado</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {crews.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    Sin datos de cuadrillas
                  </TableCell>
                </TableRow>
              )}

              {crews.map((crew) => (
                <TableRow key={crew.crew} className="hover:bg-muted/30">
                  <TableCell className="text-sm font-medium">
                    {crew.crew}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {crew.workerCount} pers.
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {crew.totalHours}h
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {crew.totalExecuted}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {crew.totalPlanned}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {crew.rendimiento}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="gap-1.5 text-xs">
                      <div
                        className={`h-2 w-2 rounded-full ${statusColors[crew.status]}`}
                      />
                      {statusLabels[crew.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
