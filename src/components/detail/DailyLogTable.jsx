import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Plus, ChevronDown, ChevronUp, Trash2, Pencil, Users } from 'lucide-react';
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
                <TableHead className="text-xs text-right">% Avance</TableHead>
                <TableHead className="text-xs text-center">Restricción</TableHead>
                <TableHead className="text-xs">Observaciones</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
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
                      <TableCell className="text-right font-mono font-bold text-emerald-700">+{log.executed_today}%</TableCell>
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
                      <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                        <TableCell colSpan={6} className="p-3">
                          <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs">
                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                <Users className="w-3.5 h-3.5 text-slate-500" />
                                <span>
                                  Personal presente en faena ({log.crew_workers.length} {log.crew_workers.length === 1 ? 'integrante' : 'integrantes'})
                                </span>
                              </div>
                              {log.crew_name && (
                                <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 font-medium">
                                  Cuadrilla: {log.crew_name}
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                              {log.crew_workers.map((w, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2.5 rounded-md border border-slate-200/80 bg-slate-50/60 p-2 transition-colors hover:bg-slate-50 hover:border-slate-300"
                                >
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold uppercase shadow-2xs">
                                    {(w.name || '?').charAt(0)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-semibold text-slate-800">
                                      {w.name}
                                    </p>
                                    <p className="truncate text-[10px] text-muted-foreground font-medium">
                                      {w.role || 'Operario'}
                                    </p>
                                  </div>
                                </div>
                              ))}
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
