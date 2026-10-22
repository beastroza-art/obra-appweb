import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Eye,
  FileText,
  Pencil,
  Trash2,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  UserRound,
  Lock,
  Unlock,
} from "lucide-react";
import { Link } from "react-router-dom";
import { usePermissions } from "@/lib/PermissionsContext";
import { getFloorList } from "@/utils/floors";
import {
  SCOPE_TYPES,
  normalizeScopeTypeValue,
  getScopeDisplayLabel,
} from "@/constants/activityScope";

const statusBadge = {
  pendiente: "bg-slate-100 text-slate-600",
  en_ejecucion: "bg-blue-50 text-blue-700",
  completado: "bg-emerald-50 text-emerald-700",
  bloqueado: "bg-red-50 text-red-700",
  "piso bloqueado": "bg-rose-50 text-rose-700",
};

const statusLabel = {
  pendiente: "Pendiente",
  en_ejecucion: "En ejecución",
  completado: "Completado",
  bloqueado: "Bloqueado",
  "piso bloqueado": "Piso Bloqueado",
};

const PAGE_SIZE = 20;

function getProgressPct(item) {
  const planned = Number(item?.planned_qty || 0);
  const executed = Number(item?.executed_qty || 0);

  if (planned <= 0) return 0;

  return Math.min(Math.round((executed / planned) * 100), 100);
}

function getDaysDelayed(item) {
  const pct = getProgressPct(item);
  if (pct >= 100) return 0;

  if (!item?.end_date) return 0;

  const endDate = new Date(item.end_date + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (today > endDate) {
    const diffTime = today - endDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  return 0;
}

function formatNumber(value) {
  const number = Number(value || 0);

  if (Number.isInteger(number)) return number;

  return number.toFixed(2);
}

function FloorsDisplay({ floor, compact = false, selectedFloor = null }) {
  const floors = getFloorList(floor);

  if (floors.length === 0) return "—";

  const hasSelected = selectedFloor && floors.includes(selectedFloor);
  const floorsToShow = hasSelected ? [selectedFloor] : floors;

  const visibleCount = compact ? 2 : 4;
  const visibleFloors = floorsToShow.slice(0, visibleCount);
  const remainingCount = floorsToShow.length - visibleFloors.length;

  return (
    <div
      className="flex max-w-[220px] flex-wrap items-center gap-1"
      title={floorsToShow.join(", ")}
    >
      {visibleFloors.map((item) => (
        <span
          key={item}
          className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-foreground/80"
        >
          {item}
        </span>
      ))}

      {remainingCount > 0 && (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          +{remainingCount}
        </Badge>
      )}
    </div>
  );
}

function buildRowsForFloors(items) {
  return items.flatMap((item) => {
    const scopeType = normalizeScopeTypeValue(item.scope_type);

    if (scopeType !== SCOPE_TYPES.PISO) {
      return [
        {
          ...item,
          displayFloor: getScopeDisplayLabel(item, true),
          displayRowId: `${item.id}-default`,
          isPrimaryFloorRow: true,
        },
      ];
    }

    const floors = getFloorList(item.floor);

    if (floors.length === 0) {
      return [
        {
          ...item,
          displayFloor: "",
          displayRowId: `${item.id}-default`,
          isPrimaryFloorRow: true,
        },
      ];
    }

    return floors.map((floor, index) => ({
      ...item,
      displayFloor: floor,
      displayRowId: `${item.id}-${index}`,
      isPrimaryFloorRow: index === 0,
    }));
  });
}

function normalizeFloor(value) {
  return String(value || "").trim();
}

function logBelongsToFloor(log, row) {
  const logFloor = normalizeFloor(log.floor);
  const rowFloor = normalizeFloor(row.displayFloor);

  if (!rowFloor) return !logFloor;
  if (logFloor === rowFloor) return true;

  return row.isPrimaryFloorRow && logFloor === normalizeFloor(row.floor);
}

export default function MasterPlanTable({
  items = [],
  masterItems = [],
  projects = [],
  dailyLogs = [],
  selectedFloor = null,
  onEdit,
  onDelete,
  onDailyLog,
  onEditDailyLog,
  onDeleteLog,
  onToggleBlock,
}) {
  const [expandedItems, setExpandedItems] = useState({});
  const [page, setPage] = useState(1);
  const { canDelete } = usePermissions();
  const displayRows = useMemo(() => buildRowsForFloors(items), [items]);
  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return displayRows.slice(start, start + PAGE_SIZE);
  }, [displayRows, safePage]);

  useEffect(() => {
    setPage(1);
    setExpandedItems({});
  }, [items]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const projectSupervisorByName = useMemo(() => {
    return projects.reduce((acc, project) => {
      if (project.name) acc[project.name] = project.supervisor || "";
      return acc;
    }, {});
  }, [projects]);

  const childToParentMap = useMemo(() => {
    const map = {};
    (masterItems || []).forEach((mi) => {
      if (mi.parent_id) {
        map[Number(mi.id)] = Number(mi.parent_id);
      }
    });
    return map;
  }, [masterItems]);

  const logsByItemId = useMemo(() => {
    return dailyLogs.reduce((acc, log) => {
      const key = Number(log.master_item_id);

      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(log);

      const parentId = childToParentMap[key];
      if (parentId && parentId !== key) {
        if (!acc[parentId]) {
          acc[parentId] = [];
        }
        acc[parentId].push(log);
      }

      return acc;
    }, {});
  }, [dailyLogs, childToParentMap]);

  const toggleExpand = (itemId) => {
    setExpandedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const safeOnEdit = (item) => {
    if (onEdit) onEdit(item);
  };

  const safeOnDelete = (item) => {
    if (onDelete) onDelete(item);
  };

  const safeOnDailyLog = (item) => {
    if (!onDailyLog) return;

    onDailyLog({
      ...item,
      floor: item.displayFloor || item.floor,
      originalFloorScope: item.floor,
    });
  };

  const safeOnDeleteLog = (log, item) => {
    if (onDeleteLog) onDeleteLog(log, item);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <ClipboardList className="h-4 w-4 text-accent" />
          Plan Maestro
          <Badge variant="secondary" className="ml-2 text-xs">
            {items.length} ítems
          </Badge>
          {displayRows.length > PAGE_SIZE && (
            <Badge variant="outline" className="ml-1 text-xs">
              Pág. {safePage}/{totalPages}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {displayRows.length > PAGE_SIZE && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <p className="text-xs text-muted-foreground">
              Mostrando {pageRows.length} de {displayRows.length} filas del plan maestro
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={safePage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs tabular-nums">
                {safePage} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={safePage >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3 md:hidden">
          {displayRows.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay ítems en el plan maestro. Crea uno nuevo para comenzar.
            </div>
          )}
          {pageRows.map((row) => {
            const pct =
              row.planned_qty > 0
                ? Math.round(((row.executed_qty || 0) / row.planned_qty) * 100)
                : 0;
            const allItemLogs = logsByItemId[Number(row.id)] || [];
            const hasAnyUnsignedLog = allItemLogs.some(
              (log) => !log.capataz_signature || log.capataz_signature.trim() === "",
            );
            const itemLogs = allItemLogs.filter(
              (log) => logBelongsToFloor(log, row),
            );
            const hasUnsignedLogs = itemLogs.some(
              (log) => !log.capataz_signature || log.capataz_signature.trim() === "",
            );
            const isCompleted = row.status === "completado" || pct >= 100;
            const displayStatus = (isCompleted && (hasAnyUnsignedLog || hasUnsignedLogs)) ? "pendiente" : row.status;
            return (
              <div
                key={row.displayRowId}
                className="rounded-lg border p-3 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{row.activity}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.project} — {row.tower || "—"}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <UserRound className="h-3 w-3" />
                      {projectSupervisorByName[row.project] || "Sin supervisor"}
                    </p>
                    <div className="mt-1">
                      <FloorsDisplay floor={row.displayFloor} compact selectedFloor={selectedFloor} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge
                      className={`text-[10px] ${statusBadge[displayStatus] || statusBadge.pendiente}`}
                    >
                      {statusLabel[displayStatus] || displayStatus}
                    </Badge>
                    {(() => {
                      const days = getDaysDelayed(row);
                      return days > 0 ? (
                        <Badge className="text-[10px] bg-red-100 text-red-700 border border-red-200 hover:bg-red-100">
                          {days}d de atraso
                        </Badge>
                      ) : null;
                    })()}
                  </div>
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">Inicio:</span>{" "}
                    {row.start_date || "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Término:</span>{" "}
                    {row.end_date || "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Plan:</span>{" "}
                    {row.planned_qty} {row.unit}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ejecutado:</span>{" "}
                    {row.executed_qty || 0}
                  </div>
                </div>
                <div className="mb-2 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">% Avance</span>
                    <span className="font-medium">{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{row.crew_name || "Sin cuadrilla"}</span>
                  <span>{itemLogs.length} reportes</span>
                </div>
                <div className="mt-2 flex items-center justify-end gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] hidden"
                    onClick={() => safeOnDailyLog(row)}
                  >
                    <FileText className="mr-1 h-3 w-3" /> Reporte
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link
                          to={`/item/${row.id}`}
                          state={{ from: "/master-plan" }}
                          className="flex items-center gap-2"
                        >
                          <Eye className="w-3.5 h-3.5" /> Ver Detalle
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onEdit(row)}
                        className="gap-2"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </DropdownMenuItem>
                      {onToggleBlock && (
                        <DropdownMenuItem
                          onClick={() => onToggleBlock(row)}
                          className="gap-2"
                        >
                          {row.status === "bloqueado" || row.status === "piso bloqueado" ? (
                            <>
                              <Unlock className="w-3.5 h-3.5" /> Desbloquear
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5" /> Bloquear
                            </>
                          )}
                        </DropdownMenuItem>
                      )}
                      {canDelete && (
                        <DropdownMenuItem
                          onClick={() => safeOnDelete(row)}
                          className="gap-2 text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-8 text-xs" />
                <TableHead className="text-xs">Proyecto</TableHead>
                <TableHead className="text-xs hidden xl:table-cell">Supervisor</TableHead>
                <TableHead className="text-xs hidden lg:table-cell">Torre</TableHead>
                <TableHead className="text-xs">Piso</TableHead>
                <TableHead className="text-xs text-center min-w-[70px]">Atrasos</TableHead>
                <TableHead className="text-xs">Actividad</TableHead>
                <TableHead className="min-w-[92px] whitespace-nowrap text-xs hidden lg:table-cell">
                  F. Inicio
                </TableHead>
                <TableHead className="min-w-[92px] whitespace-nowrap text-xs hidden lg:table-cell">
                  F. Término
                </TableHead>
                <TableHead className="text-right text-xs">Plan</TableHead>
                <TableHead className="text-right text-xs">Ejecutado</TableHead>
                <TableHead className="text-xs hidden lg:table-cell">Und</TableHead>
                <TableHead className="text-xs hidden lg:table-cell">Cuadrilla</TableHead>
                <TableHead className="min-w-[100px] text-xs">
                  % Avance
                </TableHead>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="text-xs hidden xl:table-cell">Restricciones</TableHead>
                <TableHead className="text-center text-xs">Acciones</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {displayRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={100}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No hay ítems en el plan maestro. Crea uno nuevo para
                    comenzar.
                  </TableCell>
                </TableRow>
              )}

              {pageRows.map((row) => {
                const itemId = Number(row.id);
                const pct = getProgressPct(row);
                const daysDelayed = getDaysDelayed(row);
                const allItemLogs = logsByItemId[itemId] || [];
                const hasAnyUnsignedLog = allItemLogs.some(
                  (log) => !log.capataz_signature || log.capataz_signature.trim() === "",
                );
                const itemLogs = allItemLogs.filter((log) =>
                  logBelongsToFloor(log, row),
                );
                const hasUnsignedLogs = itemLogs.some(
                  (log) => !log.capataz_signature || log.capataz_signature.trim() === "",
                );
                const isCompleted = row.status === "completado" || pct >= 100;
                const displayStatus = (isCompleted && (hasAnyUnsignedLog || hasUnsignedLogs)) ? "pendiente" : row.status;
                const isExpanded = expandedItems[row.displayRowId];

                return (
                  <React.Fragment key={row.displayRowId}>
                    <TableRow className="text-xs hover:bg-muted/30">
                      <TableCell className="p-1">
                        {itemLogs.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(row.displayRowId)}
                            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-muted"
                            title={
                              isExpanded
                                ? "Ocultar reportes"
                                : "Ver reportes diarios"
                            }
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </button>
                        ) : (
                          <span className="block h-6 w-6" />
                        )}
                      </TableCell>

                      <TableCell className="font-medium">
                        {row.project || "—"}
                      </TableCell>

                      <TableCell className="text-muted-foreground hidden xl:table-cell">
                        {projectSupervisorByName[row.project] || "—"}
                      </TableCell>

                      <TableCell className="hidden lg:table-cell">{row.tower || "—"}</TableCell>
                       <TableCell className="min-w-[160px] max-w-[240px]">
                        <FloorsDisplay floor={row.displayFloor} selectedFloor={selectedFloor} />
                      </TableCell>

                      <TableCell className="text-center font-mono font-medium">
                        {daysDelayed > 0 ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200">
                            {daysDelayed}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </TableCell>

                      <TableCell className="font-medium">
                        {row.activity || "—"}
                      </TableCell>

                      <TableCell className="min-w-[92px] whitespace-nowrap font-mono text-muted-foreground hidden lg:table-cell">
                        {row.start_date || "—"}
                      </TableCell>

                      <TableCell className="min-w-[92px] whitespace-nowrap font-mono text-muted-foreground hidden lg:table-cell">
                        {row.end_date || "—"}
                      </TableCell>

                      <TableCell className="text-right font-mono">
                        {formatNumber(row.planned_qty)}
                      </TableCell>

                      <TableCell className="text-right font-mono font-medium">
                        {formatNumber(row.executed_qty)}
                      </TableCell>

                      <TableCell className="text-muted-foreground hidden lg:table-cell">
                        {row.unit || "—"}
                      </TableCell>

                      <TableCell className="hidden lg:table-cell">{row.crew_name || "—"}</TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <span className="font-medium">{pct}%</span>
                          <Progress value={pct} className="h-1.5" />
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge
                          className={`text-[10px] ${
                            statusBadge[displayStatus] || statusBadge.pendiente
                          }`}
                        >
                          {statusLabel[displayStatus] || displayStatus || "Pendiente"}
                        </Badge>
                      </TableCell>

                      <TableCell
                        className="max-w-[120px] truncate text-muted-foreground hidden xl:table-cell"
                        title={row.restrictions || ""}
                      >
                        {row.restrictions || "—"}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            title="Registrar Reporte Diario / Avance"
                            onClick={() => safeOnDailyLog(row)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link
                                  to={`/item/${row.id}`}
                                  state={{ from: "/master-plan" }}
                                  className="flex items-center gap-2"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Ver Detalle
                                </Link>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={() => safeOnDailyLog(row)}
                                className="gap-2"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Reporte Diario
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={() => safeOnEdit(row)}
                                className="gap-2"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Editar
                              </DropdownMenuItem>
                              {onToggleBlock && (
                                <DropdownMenuItem
                                  onClick={() => onToggleBlock(row)}
                                  className="gap-2"
                                >
                                  {row.status === "bloqueado" || row.status === "piso bloqueado" ? (
                                    <>
                                      <Unlock className="h-3.5 w-3.5" />
                                      Desbloquear
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="h-3.5 w-3.5" />
                                      Bloquear
                                    </>
                                  )}
                                </DropdownMenuItem>
                              )}

                              {canDelete && (
                                <DropdownMenuItem
                                  onClick={() => safeOnDelete(row)}
                                  className="gap-2 text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Borrar
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow className="border-l-2 border-l-accent/30 bg-muted/10 text-xs">
                        <TableCell className="p-0" />
                        <TableCell colSpan={100} className="p-0">
                          <div className="divide-y divide-border/40">
                            {itemLogs.map((log) => (
                              <div
                                key={`${row.displayRowId}-${log.id}`}
                                className="flex flex-wrap items-center justify-between gap-4 p-3 pl-6 pr-4 hover:bg-muted/20"
                              >
                                <div className="flex items-center gap-2 min-w-[200px]">
                                  <FileText className="h-3.5 w-3.5 text-accent" />
                                  <span className="font-semibold text-foreground">
                                    {log.date || "Sin fecha"}
                                  </span>
                                  <span className="text-muted-foreground">
                                    — {log.supervisor || "Sin supervisor"}
                                  </span>
                                  {(!log.capataz_signature || log.capataz_signature.trim() === "") && (
                                    <Badge className="bg-amber-100 text-amber-850 hover:bg-amber-200 border border-amber-200 text-[9px] font-bold py-0 px-1.5 h-4 select-none shrink-0">
                                      Firma Pendiente
                                    </Badge>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground">
                                  <div>
                                    Ejecutado:{" "}
                                    <span className="font-mono font-bold text-emerald-700 text-xs">
                                      +{formatNumber(log.executed_today)}
                                    </span>{" "}
                                    {row.unit}
                                  </div>

                                  {log.hours_worked && (
                                    <div>
                                      Horas:{" "}
                                      <span className="font-medium text-foreground">
                                        {formatNumber(log.hours_worked)}h
                                      </span>
                                    </div>
                                  )}

                                  {Array.isArray(log.crew_workers) &&
                                    log.crew_workers.length > 0 && (
                                      <div>
                                        Personal:{" "}
                                        <span className="font-medium text-foreground">
                                          {log.crew_workers.length} pers.
                                        </span>
                                      </div>
                                    )}

                                  {log.has_restriction && (
                                    <Badge className="gap-1 bg-red-50 text-[10px] text-red-700 hover:bg-red-100 border border-red-200">
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      Restricción
                                    </Badge>
                                  )}

                                  {log.observations && (
                                    <div
                                      className="max-w-[200px] truncate text-[11px]"
                                      title={log.observations}
                                    >
                                      Obs: {log.observations}
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground rounded"
                                    onClick={() => {
                                      if (onEditDailyLog) {
                                        onEditDailyLog(log, row);
                                      }
                                    }}
                                    title="Editar / Firmar reporte diario"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  {canDelete && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                                      onClick={() => {
                                        const confirmed = window.confirm(
                                          `¿Eliminar el reporte del ${log.date}?`
                                        );
                                        if (confirmed) {
                                          safeOnDeleteLog(log, row);
                                        }
                                      }}
                                      title="Eliminar reporte diario"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
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