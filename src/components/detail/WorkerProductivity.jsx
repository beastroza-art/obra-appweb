import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users } from 'lucide-react';

export default function WorkerProductivity({ logs = [] }) {
  // Agregar datos de crew_workers desde los dailyLogs
  const workerData = [];
  
  logs.forEach(log => {
    if (log.crew_workers && Array.isArray(log.crew_workers)) {
      log.crew_workers.forEach(w => {
        workerData.push({
          date: log.date,
          name: w.name,
          role: w.role,
          hours: w.hours || 0,
          executed: w.executed || 0,
        });
      });
    }
  });

  const rendimiento = (hours, executed) => hours > 0 ? (executed / hours).toFixed(2) : '—';

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" />
          Productividad Individual en Este Ítem
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Integrante</TableHead>
                <TableHead className="text-xs">Cargo</TableHead>
                <TableHead className="text-xs text-right">Horas</TableHead>
                <TableHead className="text-xs text-right">Ejecutado</TableHead>
                <TableHead className="text-xs text-right">Rendimiento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workerData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    Sin registros de productividad individual
                  </TableCell>
                </TableRow>
              )}
              {workerData.map((w, idx) => (
                <TableRow key={idx} className="hover:bg-muted/30 text-xs">
                  <TableCell>{w.date || '—'}</TableCell>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell>{w.role || '—'}</TableCell>
                  <TableCell className="text-right">{w.hours}h</TableCell>
                  <TableCell className="text-right font-mono font-medium">{w.executed}</TableCell>
                  <TableCell className="text-right font-mono font-semibold text-accent">{rendimiento(w.hours, w.executed)} /h</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}