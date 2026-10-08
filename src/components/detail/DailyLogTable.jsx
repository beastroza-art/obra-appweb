import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Plus, ChevronDown, ChevronUp, Trash2, Pencil } from 'lucide-react';
import { usePermissions } from '@/lib/PermissionsContext';

export default function DailyLogTable({ logs, onAddLog, onEditLog, onDeleteLog }) {
  const [expandedLog, setExpandedLog] = useState(null);
  const { canDelete } = usePermissions();

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            Bitácora Diaria
          </CardTitle>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={onAddLog}>
            <Plus className="w-3 h-3" /> Agregar Reporte
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs w-[110px] whitespace-nowrap">Fecha</TableHead>
                <TableHead className="text-xs">Supervisor</TableHead>
                <TableHead className="text-xs text-right">Ejecutado</TableHead>
                <TableHead className="text-xs text-right">Horas</TableHead>
                <TableHead className="text-xs text-center">Restricción</TableHead>
                <TableHead className="text-xs">Observaciones</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    Sin registros en la bitácora
                  </TableCell>
                </TableRow>
              )}
              {logs.map(log => {
                const isUnsigned = !log.capataz_signature || log.capataz_signature.trim() === "";
                return (
                  <React.Fragment key={log.id}>
                    <TableRow
                      className="hover:bg-muted/30 text-xs cursor-pointer"
                      onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                    >
                      <TableCell className="font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {log.crew_workers?.length > 0 && (
                            expandedLog === log.id ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />
                          )}
                          <span className="shrink-0">{log.date}</span>
                          {isUnsigned && (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200 text-[9px] font-bold py-0 px-1 h-4 select-none shrink-0">
                              Firma Pendiente
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{log.supervisor || '—'}</TableCell>
                      <TableCell className="text-right font-mono font-medium">{log.executed_today}</TableCell>
                      <TableCell className="text-right">{log.hours_worked || '—'}h</TableCell>
                      <TableCell className="text-center">
                        {log.has_restriction ? (
                          <Badge className="bg-red-50 text-red-700 text-[10px]">Sí</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {log.has_restriction && log.restriction_detail ? log.restriction_detail : log.observations || '—'}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              if (onEditLog) onEditLog(log);
                            }}
                            title="Editar / Firmar reporte"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (onDeleteLog) onDeleteLog(log);
                              }}
                              title="Eliminar reporte"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {expandedLog === log.id && log.crew_workers?.length > 0 && (
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={7} className="p-4">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground mb-3">
                            Integrantes de la cuadrilla — {log.crew_name}
                          </p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="border-b bg-background">
                                  <th className="text-left px-2 py-1.5">Nombre</th>
                                  <th className="text-left px-2 py-1.5">Rol</th>
                                  <th className="text-right px-2 py-1.5">Horas</th>
                                  <th className="text-right px-2 py-1.5">Ejecutado</th>
                                  <th className="text-right px-2 py-1.5">Rendimiento</th>
                                </tr>
                              </thead>
                              <tbody>
                                {log.crew_workers.map((w, idx) => (
                                  <tr key={idx} className="border-b hover:bg-muted/50">
                                    <td className="px-2 py-1.5 font-medium">{w.name}</td>
                                    <td className="px-2 py-1.5 text-muted-foreground">{w.role || '—'}</td>
                                    <td className="px-2 py-1.5 text-right">{w.hours || 0}h</td>
                                    <td className="px-2 py-1.5 text-right font-mono font-semibold">{w.executed || 0}</td>
                                    <td className="px-2 py-1.5 text-right font-mono text-accent font-semibold">
                                      {w.hours > 0 ? (w.executed / w.hours).toFixed(2) : '—'} /h
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}