import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Eye,
  FileText,
  Building2,
  Layers,
  ListTree,
  MapPin,
  MoreHorizontal,
  Pencil,
  Settings2,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import MasterPlanSidebar from "./MasterPlanSidebar";
import {
  aggregateProgress,
  applySidebarFilters,
  buildGroupedTree,
  buildRowsForFloors,
  COLUMN_DEFS,
  computePlanKpis,
  DEFAULT_VISIBLE_COLUMNS,
  formatNumber,
  getProgressBarClass,
  getProgressPct,
  loadExpandedState,
  logBelongsToFloor,
  paginateRows,
  releaseBadgeClass,
  releaseLabel,
  saveExpandedState,
  statusBadgeClass,
  statusLabel,
  EMPTY_SIDEBAR_FILTERS,
} from "./masterPlanUtils";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function ProgressCell({ pct, compact }) {
  return (
    <div className={cn("min-w-[110px] space-y-1", compact && "min-w-[96px]")}>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", getProgressBarClass(pct))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const key = status || "pendiente";
  return (
    <Badge
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[10px] font-medium shadow-none",
        statusBadgeClass[key] || statusBadgeClass.pendiente
      )}
    >
      {statusLabel[key] || key}
    </Badge>
  );
}

function ReleasePill({ value }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[10px] font-medium shadow-none",
        releaseBadgeClass[value] || releaseBadgeClass.no_liberado
      )}
    >
      {releaseLabel[value] || value}
    </Badge>
  );
}

function KpiCard({ label, value, icon: Icon, tone }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    red: "border-red-200 bg-red-50 text-red-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 shadow-sm",
        tones[tone] || tones.slate
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        </div>
        {Icon && <Icon className="h-5 w-5 shrink-0 opacity-60" />}
      </div>
    </div>
  );
}

function ProjectMasterRow({
  label,
  count,
  progressPct,
  expanded,
  onToggle,
  compact,
}) {
  return (
    <tr className="bg-primary/5 text-sm font-semibold text-foreground">
      <td colSpan={99} className="p-0">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex w-full flex-wrap items-center gap-3 border-b border-primary/15 px-3 py-2.5 text-left transition-colors hover:bg-primary/10",
            compact && "py-2"
          )}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
          )}
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{label}</span>
          <div className="min-w-[140px] max-w-[220px] flex-1">
            <ProgressCell pct={progressPct} compact={compact} />
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {count} actividades
          </Badge>
        </button>
      </td>
    </tr>
  );
}

function GroupRow({
  level,
  label,
  count,
  progressPct,
  expanded,
  onToggle,
  compact,
  icon: Icon = ListTree,
}) {
  const paddingLeft = 20 + level * 18;

  return (
    <tr className="bg-muted/35 text-xs font-medium text-foreground">
      <td colSpan={99} className="p-0">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex w-full flex-wrap items-center gap-2 border-b border-border/60 py-2 pr-3 text-left transition-colors hover:bg-muted/60",
            compact ? "py-1.5" : "py-2"
          )}
          style={{ paddingLeft }}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary/70" />
          <span className="truncate">{label}</span>
          {typeof progressPct === "number" && (
            <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
              {progressPct}%
            </span>
          )}
          <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">
            {count}
          </Badge>
        </button>
      </td>
    </tr>
  );
}

function DataRow({
  row,
  projectSupervisorByName,
  itemLogs,
  visibleColumns,
  compact,
  expandedDetail,
  onToggleDetail,
  onEdit,
  onDelete,
  onDailyLog,
}) {
  const pct = getProgressPct(row);
  const cellClass = cn("align-middle", compact ? "py-1.5" : "py-2.5");
  const unit = row.unit ? ` ${row.unit}` : "";

  return (
    <>
      <tr className="group border-b text-xs hover:bg-muted/25">
        <td className={cn(cellClass, "w-8 p-1")}>
          <button
            type="button"
            onClick={onToggleDetail}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
            title="Ver más detalle"
          >
            {expandedDetail ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        </td>

        <td
          className={cn(
            cellClass,
            "sticky left-10 z-[2] min-w-[200px] max-w-[280px] bg-background pl-14 font-medium shadow-[2px_0_0_0_hsl(var(--border))]",
            compact && "text-[11px]"
          )}
        >
          {row.activity || "—"}
        </td>

        <td className={cn(cellClass, "min-w-[150px] whitespace-nowrap font-mono text-[10px] text-muted-foreground")}>
          {row.start_date || "—"}
          <span className="mx-1 text-border">→</span>
          {row.end_date || "—"}
        </td>

        <td className={cn(cellClass, "min-w-[120px] font-mono text-[11px]")}>
          <span className="text-muted-foreground">{formatNumber(row.planned_qty)}</span>
          <span className="mx-1 text-muted-foreground">/</span>
          <span className="font-semibold text-foreground">
            {formatNumber(row.executed_qty)}
            {unit}
          </span>
        </td>

        <td className={cn(cellClass, "min-w-[110px]")}>{row.crew_name || "—"}</td>

        <td className={cn(cellClass, "min-w-[120px]")}>
          <ProgressCell pct={pct} compact={compact} />
        </td>

        <td className={cn(cellClass, "min-w-[110px]")}>
          <StatusPill status={row.status} />
        </td>

        {visibleColumns.release && (
          <td className={cn(cellClass, "min-w-[110px]")}>
            <ReleasePill value={row.release_status} />
          </td>
        )}

        {visibleColumns.supervisor && (
          <td className={cn(cellClass, "min-w-[120px] text-muted-foreground")}>
            {projectSupervisorByName[row.project] || "—"}
          </td>
        )}

        {visibleColumns.restrictions && (
          <td
            className={cn(cellClass, "max-w-[180px] truncate text-muted-foreground")}
            title={row.restrictions || ""}
          >
            {row.restrictions || "—"}
          </td>
        )}

        {visibleColumns.observations && (
          <td
            className={cn(cellClass, "max-w-[180px] truncate text-muted-foreground")}
            title={row.observations || ""}
          >
            {row.observations || "—"}
          </td>
        )}

        <td className={cn(cellClass, "sticky right-0 z-[2] bg-background text-center shadow-[-2px_0_0_0_hsl(var(--border))]")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={`/item/${row.id}`} state={{ from: "/master-plan" }} className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5" />
                  Ver detalle
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDailyLog(row)} className="gap-2 hidden">
                <FileText className="h-3.5 w-3.5" />
                Reporte diario
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(row)} className="gap-2">
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(row)} className="gap-2 text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
                Borrar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

      {expandedDetail && (
        <tr className="bg-muted/15 text-xs">
          <td colSpan={99} className="p-0">
            <div
              className="grid gap-3 border-b border-l-2 border-l-primary/30 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4"
              style={{ paddingLeft: 56 }}
            >
              <div className="sm:col-span-2">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Ubicación
                </p>
                <p>
                  {row.project} · {row.tower || "—"} · {row.displayFloor || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Supervisor
                </p>
                <p>{projectSupervisorByName[row.project] || "Sin asignar"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Cuadrilla
                </p>
                <p>{row.crew_name || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Restricciones
                </p>
                <p className="text-muted-foreground">{row.restrictions || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Reportes diarios
                </p>
                <p className="font-medium">{itemLogs.length}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Observaciones
                </p>
                <p className="text-muted-foreground">{row.observations || "—"}</p>
              </div>
              {itemLogs.length > 0 && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
                    Últimos reportes
                  </p>
                  <div className="space-y-1">
                    {itemLogs.slice(0, 5).map((log) => (
                      <div
                        key={log.id}
                        className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-1.5"
                      >
                        <FileText className="h-3 w-3 text-primary" />
                        <span className="font-medium">{log.date || "Sin fecha"}</span>
                        <span className="text-muted-foreground">
                          {log.supervisor || "Sin supervisor"}
                        </span>
                        <span className="font-mono text-emerald-700">
                          +{formatNumber(log.executed_today)}
                        </span>
                        {log.has_restriction && (
                          <Badge className="gap-1 bg-red-50 text-[10px] text-red-700">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Restricción
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function MasterPlanView({
  items = [],
  projects = [],
  dailyLogs = [],
  onEdit,
  onDelete,
  onDailyLog,
  showFilterSidebar = true,
  sidebarFilters: controlledSidebarFilters,
  onSidebarFiltersChange,
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [internalSidebarFilters, setInternalSidebarFilters] =
    useState(EMPTY_SIDEBAR_FILTERS);
  const sidebarFilters = controlledSidebarFilters ?? internalSidebarFilters;
  const setSidebarFilters = onSidebarFiltersChange ?? setInternalSidebarFilters;
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE_COLUMNS);
  const [compact, setCompact] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expandedNodes, setExpandedNodes] = useState({});
  const [expandedRows, setExpandedRows] = useState({});

  const projectSupervisorByName = useMemo(
    () =>
      projects.reduce((acc, project) => {
        if (project.name) acc[project.name] = project.supervisor || "";
        return acc;
      }, {}),
    [projects]
  );

  const allRows = useMemo(() => buildRowsForFloors(items), [items]);

  const optionSets = useMemo(() => {
    const countBy = (list, keyFn) =>
      list.reduce((acc, row) => {
        const key = keyFn(row);
        if (!key) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

    const projectCounts = countBy(allRows, (row) => row.project);
    const towerCounts = countBy(allRows, (row) => row.tower);
    const floorCounts = countBy(allRows, (row) => row.displayFloor);
    const activityCounts = countBy(allRows, (row) => row.activity);
    const statusCounts = countBy(allRows, (row) => row.status || "pendiente");
    const releaseCounts = countBy(allRows, (row) => row.release_status || "no_liberado");

    const supervisorCounts = allRows.reduce((acc, row) => {
      const name = projectSupervisorByName[row.project] || "Sin supervisor";
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});

    const toOptions = (counts) =>
      Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b, "es"))
        .map(([value, count]) => ({ value, label: value, count }));

    return {
      projects: toOptions(projectCounts),
      towers: toOptions(towerCounts),
      floors: toOptions(floorCounts),
      activities: toOptions(activityCounts),
      supervisors: toOptions(supervisorCounts),
      statusCounts,
      releaseCounts,
    };
  }, [allRows, projectSupervisorByName]);

  const filteredRows = useMemo(() => {
    if (!showFilterSidebar) return allRows;
    return applySidebarFilters(allRows, sidebarFilters, projectSupervisorByName);
  }, [allRows, showFilterSidebar, sidebarFilters, projectSupervisorByName]);

  const tree = useMemo(() => buildGroupedTree(filteredRows), [filteredRows]);

  useEffect(() => {
    setExpandedNodes(loadExpandedState(tree));
  }, [tree]);

  useEffect(() => {
    setPage(1);
  }, [sidebarFilters, items, pageSize]);

  const flatVisibleRows = useMemo(() => {
    const result = [];

    tree.forEach((project) => {
      if (!expandedNodes[project.id]) return;

      project.children.forEach((tower) => {
        if (!expandedNodes[tower.id]) return;

        tower.children.forEach((floor) => {
          if (!expandedNodes[floor.id]) return;
          floor.rows.forEach((row) => result.push(row));
        });
      });
    });

    return result;
  }, [tree, expandedNodes]);

  const { rows: pageRows, page: safePage, totalPages } = useMemo(
    () => paginateRows(flatVisibleRows, page, pageSize),
    [flatVisibleRows, page, pageSize]
  );

  const pageRowIds = useMemo(
    () => new Set(pageRows.map((row) => row.displayRowId)),
    [pageRows]
  );

  const kpis = useMemo(() => computePlanKpis(filteredRows), [filteredRows]);

  const logsByItemId = useMemo(
    () =>
      dailyLogs.reduce((acc, log) => {
        const key = Number(log.master_item_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push(log);
        return acc;
      }, {}),
    [dailyLogs]
  );

  const handleDailyLog = (row) => {
    if (!onDailyLog) return;

    onDailyLog({
      ...row,
      floor: row.displayFloor || row.floor,
      originalFloorScope: row.floor,
    });
  };

  const toggleNode = (id) => {
    setExpandedNodes((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveExpandedState(next);
      return next;
    });
  };

  const expandAll = () => {
    const next = {};
    tree.forEach((project) => {
      next[project.id] = true;
      project.children.forEach((tower) => {
        next[tower.id] = true;
        tower.children.forEach((floor) => {
          next[floor.id] = true;
        });
      });
    });
    setExpandedNodes(next);
    saveExpandedState(next);
  };

  const collapseAll = () => {
    const next = {};
    tree.forEach((project) => {
      next[project.id] = false;
      project.children.forEach((tower) => {
        next[tower.id] = false;
        tower.children.forEach((floor) => {
          next[floor.id] = false;
        });
      });
    });
    setExpandedNodes(next);
    saveExpandedState(next);
  };

  const optionalColCount =
    (visibleColumns.release ? 1 : 0) +
    (visibleColumns.supervisor ? 1 : 0) +
    (visibleColumns.restrictions ? 1 : 0) +
    (visibleColumns.observations ? 1 : 0);

  const baseColCount = 8 + optionalColCount;

  const getProjectRows = (project) =>
    project.children.flatMap((tower) =>
      tower.children.flatMap((floor) => floor.rows)
    );

  const getTowerRows = (tower) =>
    tower.children.flatMap((floor) => floor.rows);

  const renderGroupedBody = () => {
    const body = [];

    tree.forEach((project) => {
      const projectRows = getProjectRows(project);
      const projectHasPageRows = projectRows.some((row) =>
        pageRowIds.has(row.displayRowId)
      );

      if (!projectHasPageRows) return;

      body.push(
        <ProjectMasterRow
          key={project.id}
          label={project.label}
          count={projectRows.length}
          progressPct={aggregateProgress(projectRows)}
          expanded={expandedNodes[project.id]}
          onToggle={() => toggleNode(project.id)}
          compact={compact}
        />
      );

      if (!expandedNodes[project.id]) return;

      project.children.forEach((tower) => {
        const towerRows = getTowerRows(tower);
        const towerHasPageRows = towerRows.some((row) =>
          pageRowIds.has(row.displayRowId)
        );

        if (!towerHasPageRows) return;

        body.push(
          <GroupRow
            key={tower.id}
            level={1}
            label={`Torre ${tower.label}`}
            count={towerRows.length}
            progressPct={aggregateProgress(towerRows)}
            expanded={expandedNodes[tower.id]}
            onToggle={() => toggleNode(tower.id)}
            compact={compact}
          />
        );

        if (!expandedNodes[tower.id]) return;

        tower.children.forEach((floor) => {
          const floorHasPageRows = floor.rows.some((row) =>
            pageRowIds.has(row.displayRowId)
          );

          if (!floorHasPageRows) return;

          body.push(
            <GroupRow
              key={floor.id}
              level={2}
              label={floor.label}
              count={floor.rows.length}
              progressPct={aggregateProgress(floor.rows)}
              expanded={expandedNodes[floor.id]}
              onToggle={() => toggleNode(floor.id)}
              compact={compact}
              icon={MapPin}
            />
          );

          if (!expandedNodes[floor.id]) return;

          floor.rows.forEach((row) => {
            if (!pageRowIds.has(row.displayRowId)) return;

            const itemLogs = (logsByItemId[Number(row.id)] || []).filter((log) =>
              logBelongsToFloor(log, row)
            );

            body.push(
              <DataRow
                key={row.displayRowId}
                row={row}
                projectSupervisorByName={projectSupervisorByName}
                itemLogs={itemLogs}
                visibleColumns={visibleColumns}
                compact={compact}
                expandedDetail={expandedRows[row.displayRowId]}
                onToggleDetail={() =>
                  setExpandedRows((prev) => ({
                    ...prev,
                    [row.displayRowId]: !prev[row.displayRowId],
                  }))
                }
                onEdit={onEdit}
                onDelete={onDelete}
                onDailyLog={handleDailyLog}
              />
            );
          });
        });
      });
    });

    return body;
  };

  return (
    <Card className="overflow-hidden border shadow-sm">
      <CardHeader className="space-y-4 border-b bg-muted/10 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ClipboardList className="h-4 w-4 text-primary" />
            Plan Maestro
            <Badge variant="secondary" className="text-xs">
              Vista jerárquica
            </Badge>
            <Badge variant="outline" className="text-xs">
              {filteredRows.length} filas · {kpis.totalActivities} actividades
            </Badge>
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={expandAll}>
              Expandir todo
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={collapseAll}>
              Contraer todo
            </Button>
            <Button
              type="button"
              variant={compact ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setCompact((value) => !value)}
            >
              {compact ? "Modo compacto" : "Modo cómodo"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <Settings2 className="h-3.5 w-3.5" />
                  Columnas
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Columnas visibles</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {COLUMN_DEFS.filter((col) => !col.primary).map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={visibleColumns[col.id]}
                    onCheckedChange={(checked) =>
                      setVisibleColumns((prev) => ({ ...prev, [col.id]: checked }))
                    }
                  >
                    {col.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Actividades"
            value={kpis.totalActivities}
            icon={Layers}
            tone="slate"
          />
          <KpiCard
            label="En ejecución"
            value={kpis.inProgress}
            icon={TrendingUp}
            tone="blue"
          />
          <KpiCard label="Bloqueadas" value={kpis.blocked} icon={Ban} tone="red" />
          <KpiCard
            label="% Avance general"
            value={`${kpis.avgProgress}%`}
            icon={TrendingUp}
            tone="emerald"
          />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="flex min-h-[480px] flex-col lg:flex-row">
          {showFilterSidebar && (
            <MasterPlanSidebar
              collapsed={sidebarCollapsed}
              onCollapsedChange={setSidebarCollapsed}
              filters={sidebarFilters}
              onFiltersChange={setSidebarFilters}
              optionSets={optionSets}
              onClear={() => setSidebarFilters(EMPTY_SIDEBAR_FILTERS)}
            />
          )}

          <div className="min-w-0 flex-1">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                  <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-foreground">
                    <th className="sticky left-0 z-30 w-8 bg-muted/95 p-2" />
                    <th className="sticky left-10 z-30 min-w-[200px] bg-muted/95 p-2 pl-14 text-left">
                      Actividad
                    </th>
                    <th className="min-w-[150px] p-2 text-left">Fechas</th>
                    <th className="min-w-[120px] p-2 text-left">Plan / Ejecutado</th>
                    <th className="min-w-[110px] p-2 text-left">Cuadrilla</th>
                    <th className="min-w-[120px] p-2 text-left">% Avance</th>
                    <th className="min-w-[110px] p-2 text-left">Estado</th>
                    {visibleColumns.release && (
                      <th className="min-w-[110px] p-2 text-left">Liberación</th>
                    )}
                    {visibleColumns.supervisor && (
                      <th className="min-w-[120px] p-2 text-left">Supervisor</th>
                    )}
                    {visibleColumns.restrictions && (
                      <th className="min-w-[140px] p-2 text-left">Restricciones</th>
                    )}
                    {visibleColumns.observations && (
                      <th className="min-w-[140px] p-2 text-left">Observaciones</th>
                    )}
                    <th className="sticky right-0 z-30 min-w-[72px] bg-muted/95 p-2 text-center shadow-[-2px_0_0_0_hsl(var(--border))]">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={baseColCount}
                        className="py-16 text-center text-sm text-muted-foreground"
                      >
                        No hay ítems que coincidan con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    renderGroupedBody()
                  )}
                </tbody>
              </table>
            </div>

            {filteredRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/10 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Mostrando {pageRows.length} de {flatVisibleRows.length} filas visibles
                  {flatVisibleRows.length !== filteredRows.length &&
                    ` (${filteredRows.length} total filtradas)`}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => setPageSize(Number(value))}
                  >
                    <SelectTrigger className="h-8 w-[110px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size} / pág.
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
