import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  X,
  UserRound,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Clock,
  ArrowUpDown,
  DoorOpen,
  ExternalLink,
  SlidersHorizontal,
  Trees,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectFilter } from "@/lib/ProjectFilterContext";
import { getFloorSortScore } from "@/utils/floors";
import {
  SCOPE_TYPES,
  getScopeTypeLabel,
  getScopeDisplayLabel,
} from "@/constants/activityScope";
import {
  buildFloorSummaries,
  computeFloorGlobalPct,
  formatQtyWithUnit,
  getDepartamentoItemsForFloor,
  getEffectiveScopeType,
  getItemProgressPct,
  getPisoItemsForFloor,
  getProgressStyle,
  getRestrictionLabel,
  getStatusMeta,
  isTorreScopeItem,
  getVerticalShortLabel,
} from "@/utils/floorProgress";

const ALL = "__all__";
const VERTICAL_SCOPES = ["vertical_el", "vertical_tc", "vertical_cd"];
const NON_TOWER_VALUES = ["exteriores", "exterior"];

const STORAGE_KEYS = {
  project: "floorProgress:selectedProject",
  tower: "floorProgress:selectedTower",
  floor: "floorProgress:selectedFloor",
};

function readStored(key) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* localStorage no disponible, se ignora */
  }
}

function isRealTower(tower) {
  return (
    Boolean(tower) &&
    !NON_TOWER_VALUES.includes(String(tower).trim().toLowerCase())
  );
}

// Ordena usando getFloorSortScore (de @/utils/floors), que distingue
// Subterráneo (negativo), Piso N (positivo) y Cubierta (siempre al final).
// La función local anterior solo extraía el primer número del string, por lo
// que "Piso 3" y "Subterráneo 3" quedaban con el mismo valor y se mostraban
// como si fueran el mismo piso duplicado.
function sortFloorsDesc(floors) {
  return [...floors].sort(
    (a, b) => getFloorSortScore(b.floor) - getFloorSortScore(a.floor),
  );
}

// Etiqueta a mostrar: solo el número para "Piso N" (para que quede compacto
// en la lista), el nombre completo para cualquier otro caso (Subterráneo,
// Cubierta, Áreas Comunes, etc.) para no confundirlos entre sí.
function getFloorDisplayLabel(floor) {
  const raw = String(floor || "").trim();
  const clean = raw
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase();
  const match = clean.match(/^piso\s*(\d+)$/);
  return match ? match[1] : raw;
}

function getFloorStatusStyle(pct) {
  if (pct >= 100) {
    return { bg: "bg-emerald-500", text: "text-white", label: "100%" };
  }
  if (pct >= 75) {
    return { bg: "bg-teal-400", text: "text-teal-950", label: `${pct}%` };
  }
  if (pct >= 50) {
    return { bg: "bg-amber-400", text: "text-amber-950", label: `${pct}%` };
  }
  if (pct >= 25) {
    return { bg: "bg-orange-400", text: "text-orange-950", label: `${pct}%` };
  }
  if (pct > 0) {
    return { bg: "bg-red-300", text: "text-red-950", label: `${pct}%` };
  }
  return { bg: "bg-slate-200", text: "text-slate-500", label: `0%` };
}

function StatusIcon({ status }) {
  if (status === "completado") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  }
  if (status === "en_ejecucion") {
    return <Zap className="h-3.5 w-3.5 text-blue-600" />;
  }
  if (status === "bloqueado") {
    return <AlertTriangle className="h-3.5 w-3.5 text-red-600" />;
  }
  return <Clock className="h-3.5 w-3.5 text-slate-500" />;
}

function ActivityCard({ item, compact = false }) {
  const navigate = useNavigate();
  const pct = getItemProgressPct(item);
  const style = getProgressStyle(pct);
  const statusMeta = getStatusMeta(item.status);
  const restriction = getRestrictionLabel(item);
  const hasRestriction =
    restriction !== "Sin restricción" && restriction !== "Liberación parcial";

  const isDepartamento =
    getEffectiveScopeType(item) === SCOPE_TYPES.DEPARTAMENTO;

  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-3 shadow-sm",
        compact && "p-2.5",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight">
          {item.activity || "Actividad"}
        </p>
        <Badge className={cn("shrink-0 text-[10px]", style.badge)}>
          {pct}%
        </Badge>
      </div>

      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all", style.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground/80">
          {formatQtyWithUnit(item)}
        </span>
        <div className="flex items-center gap-3">
          {item.crew_name && (
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3.5 w-3.5 text-orange-500" />
              {item.crew_name}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 font-medium",
              statusMeta.className,
            )}
          >
            <StatusIcon status={item.status} />
            {statusMeta.label}
          </span>
        </div>
      </div>

      {/* Chip de departamentos (solo para ítems de alcance "departamento") */}
      {isDepartamento && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          <DoorOpen className="h-3 w-3 shrink-0" />
          <span>{getScopeDisplayLabel(item)}</span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <div
          className={cn(
            "inline-flex items-center gap-1 text-[11px]",
            hasRestriction ? "text-red-600" : "text-orange-600",
          )}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{restriction}</span>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1.5 text-[11px]"
          onClick={() => navigate(`/item/${item.id}`, { state: { from: "/" } })}
        >
          <ExternalLink className="h-3 w-3" />
          Ver detalle
        </Button>
      </div>
    </div>
  );
}

function VerticalItemRow({ item }) {
  const pct = getItemProgressPct(item);
  const style = getProgressStyle(pct);
  const rangeLabel = getVerticalShortLabel(item);

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-white px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">
          {item.activity || "Vertical"}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {rangeLabel} · {getScopeTypeLabel(item.scope_type)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <Badge className={cn("text-[10px]", style.badge)}>{pct}%</Badge>
        <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
          {formatQtyWithUnit(item)}
        </p>
      </div>
    </div>
  );
}

/**
 * Franja fija del proyecto: Exteriores (alcance "torre") y Verticales
 * (alcance vertical_el / vertical_tc / vertical_cd). No varían según
 * el piso ni la torre seleccionados: son las mismas tareas se mire lo que se mire.
 */
function TorreFixedPanel({ exteriorItems, verticalItems }) {
  const exteriorPct = computeFloorGlobalPct(exteriorItems);
  const exteriorStyle = getProgressStyle(exteriorPct);

  const verticalPct = computeFloorGlobalPct(verticalItems);
  const verticalStyle = getProgressStyle(verticalPct);

  const groups = [
    {
      id: "exteriores",
      label: "Exteriores",
      icon: Trees,
      pct: exteriorPct,
      style: exteriorStyle,
      items: exteriorItems,
      renderItem: (item) => <ActivityCard key={item.id} item={item} compact />,
    },
    {
      id: "verticales",
      label: "Verticales",
      icon: ArrowUpDown,
      pct: verticalPct,
      style: verticalStyle,
      items: verticalItems,
      renderItem: (item) => <VerticalItemRow key={item.id} item={item} />,
    },
  ];

  return (
    <Accordion type="multiple" className="mb-4 flex flex-col gap-3">
      {groups.map((g) => (
        <AccordionItem
          key={g.id}
          value={g.id}
          className="rounded-xl border bg-white shadow-sm overflow-hidden"
        >
          <AccordionTrigger className="py-3 hover:no-underline px-4 bg-slate-50/50">
            <div className="flex flex-1 items-center gap-3 pr-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white shadow-sm">
                <g.icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold text-slate-800">
                {g.label}
              </span>

              <div className="ml-auto flex items-center gap-3">
                <Badge
                  className={cn(
                    "text-[10px] font-bold rounded-full px-2 py-0.5 pointer-events-none border-0",
                    g.style.badge,
                  )}
                >
                  {g.pct}%
                </Badge>
                <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
                  {g.items.length} {g.items.length === 1 ? "ítem" : "ítems"}
                </span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-2.5 px-4 py-3 bg-white border-t border-slate-100">
            <p className="text-[10px] text-muted-foreground">
              Fijo para todo el proyecto. No cambia al elegir otra torre ni otro piso.
            </p>
            {g.items.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">
                Sin actividades registradas para esta torre.
              </p>
            ) : (
              <div className="space-y-2.5">{g.items.map(g.renderItem)}</div>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function FloorDetailPanel({ floorData, towerFilter, masterItems, onClose }) {
  const { floor, pisoItems, pct, startDate } = floorData;

  // Áreas del piso (alcance piso y afines) vs Departamentos, separados.
  // El % global del piso NO cambia: sigue calculándose sobre pisoItems (piso + depto)
  // en floorProgress.js. Aquí solo separamos la vista.
  const areaItems = useMemo(
    () => getPisoItemsForFloor(masterItems, floor, towerFilter),
    [masterItems, floor, towerFilter],
  );

  const departamentoItems = useMemo(
    () => getDepartamentoItemsForFloor(masterItems, floor, towerFilter),
    [masterItems, floor, towerFilter],
  );

  const totalPlanned = useMemo(
    () =>
      pisoItems.reduce((sum, item) => sum + Number(item.planned_qty || 0), 0),
    [pisoItems],
  );

  const totalExecuted = useMemo(
    () =>
      pisoItems.reduce((sum, item) => sum + Number(item.executed_qty || 0), 0),
    [pisoItems],
  );

  const globalStyle = getProgressStyle(pct);
  const qtyLabel = `${totalExecuted} / ${totalPlanned} und ejecutadas`;

  const areaPct = computeFloorGlobalPct(areaItems);
  const areaStyle = getProgressStyle(areaPct);
  const areaPlanned = areaItems.reduce(
    (s, i) => s + Number(i.planned_qty || 0),
    0,
  );
  const areaExecuted = areaItems.reduce(
    (s, i) => s + Number(i.executed_qty || 0),
    0,
  );

  const deptoPct = computeFloorGlobalPct(departamentoItems);
  const deptoStyle = getProgressStyle(deptoPct);
  const deptoPlanned = departamentoItems.reduce(
    (s, i) => s + Number(i.planned_qty || 0),
    0,
  );
  const deptoExecuted = departamentoItems.reduce(
    (s, i) => s + Number(i.executed_qty || 0),
    0,
  );

  const defaultOpen = [
    "piso",
    departamentoItems.length ? "departamento" : null,
  ].filter(Boolean);

  return (
    <div className="flex min-h-[420px] flex-1 flex-col rounded-xl border bg-white shadow-sm">
      <div className="flex items-start justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-2xl font-bold tabular-nums">
            {getFloorDisplayLabel(floor)}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground font-medium">
            {qtyLabel}
            {startDate ? ` · Inicio: ${startDate}` : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 hover:bg-slate-100 rounded-full"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">
              Avance global del piso
            </span>
            <span className={cn("font-bold tabular-nums", globalStyle.text)}>
              {pct}%
            </span>
          </div>
          <Progress
            value={pct}
            className="h-2.5 rounded-full bg-slate-100"
            indicatorClassName={cn(
              "h-full rounded-full transition-all",
              globalStyle.bar,
            )}
          />
        </div>

        <Accordion
          type="multiple"
          defaultValue={defaultOpen}
          className="space-y-3"
        >
          {/* ÁREAS DEL PISO (alcance piso, pasillo, comunes, salas, múltiples pisos) */}
          <AccordionItem
            value="piso"
            className="rounded-xl border bg-white shadow-sm overflow-hidden"
          >
            <AccordionTrigger className="py-3 hover:no-underline px-4 bg-slate-50/50">
              <div className="flex flex-1 items-center gap-3 pr-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white shadow-sm">
                  <Building2 className="h-4 w-4" />
                </div>
                <span className="text-sm font-bold text-slate-800">
                  Áreas del piso
                </span>

                <div className="ml-auto flex items-center gap-3">
                  <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                    {areaExecuted}/{areaPlanned}
                  </span>
                  <Badge
                    className={cn(
                      "text-[10px] font-bold rounded-full px-2 py-0.5 pointer-events-none border-0",
                      areaStyle.badge,
                    )}
                  >
                    {areaPct}%
                  </Badge>
                  <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
                    {areaItems.length}{" "}
                    {areaItems.length === 1 ? "ítem" : "ítems"}
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 px-4 py-3 bg-white border-t border-slate-100">
              {areaItems.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  No hay actividades de piso en este nivel.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {areaItems.map((item) => (
                    <ActivityCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* DEPARTAMENTOS (alcance "departamento") */}
          {departamentoItems.length > 0 && (
            <AccordionItem
              value="departamento"
              className="rounded-xl border bg-white shadow-sm overflow-hidden"
            >
              <AccordionTrigger className="py-3 hover:no-underline px-4 bg-amber-50/40">
                <div className="flex flex-1 items-center gap-3 pr-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-100 text-amber-700 shadow-sm">
                    <DoorOpen className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold text-slate-800">
                    Departamentos
                  </span>

                  <div className="ml-auto flex items-center gap-3">
                    <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                      {deptoExecuted}/{deptoPlanned}
                    </span>
                    <Badge
                      className={cn(
                        "text-[10px] font-bold rounded-full px-2 py-0.5 pointer-events-none border-0",
                        deptoStyle.badge,
                      )}
                    >
                      {deptoPct}%
                    </Badge>
                    <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
                      {departamentoItems.length}{" "}
                      {departamentoItems.length === 1 ? "ítem" : "ítems"}
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 px-4 py-3 bg-white border-t border-slate-100">
                <p className="text-[10px] text-muted-foreground">
                  Actividades registradas por departamento. Sí suman al % global
                  del piso.
                </p>
                <div className="space-y-2.5">
                  {departamentoItems.map((item) => (
                    <ActivityCard key={item.id} item={item} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>
    </div>
  );
}

/** Pestañas de torre. Se ocultan si el proyecto tiene una sola torre. */
function TowerTabs({ towers, selectedTower, onSelect }) {
  if (towers.length <= 1) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {towers.map((tower) => (
        <Button
          key={tower}
          type="button"
          variant={selectedTower === tower ? "default" : "outline"}
          size="sm"
          className="h-8 rounded-full px-4 text-xs"
          onClick={() => onSelect(tower)}
        >
          {tower}
        </Button>
      ))}
    </div>
  );
}

/**
 * Lista de pisos, ordenada de mayor a menor. En mobile es una fila horizontal
 * con scroll (más compacta); en pantallas grandes (lg+) pasa a ser una
 * columna vertical con scroll, ubicada al costado del detalle.
 */
function FloorList({ floors, selectedFloor, onSelectFloor }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 lg:max-h-[560px] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pb-0 lg:pr-1">
      {floors.map((f) => {
        const style = getFloorStatusStyle(f.pct);
        const isSelected = selectedFloor === f.floor;

        return (
          <button
            key={f.floor}
            type="button"
            onClick={() => onSelectFloor(f.floor)}
            className={cn(
              "flex shrink-0 items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left transition-all lg:shrink lg:w-full",
              isSelected
                ? "border-orange-500 ring-2 ring-orange-500 ring-offset-1 shadow-sm"
                : "border-slate-200 hover:border-slate-300",
            )}
          >
            <span className="whitespace-nowrap text-xs font-semibold text-slate-700">
              {getFloorDisplayLabel(f.floor)}
            </span>
            <span
              className={cn(
                "whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold",
                style.bg,
                style.text,
              )}
            >
              {style.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Campo de filtro reutilizable (select de shadcn con label). */
function FilterField({ label, value, onValueChange, placeholder, children }) {
  return (
    <div className="flex min-w-[200px] flex-1 flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

export default function FloorProgress({ masterItems = [], projects = [] }) {
  const { selectedProject: globalProject, setSelectedProject: setGlobalProject } = useProjectFilter();
  const [selectedProject, setSelectedProject] = useState(() => {
    if (globalProject !== undefined && globalProject !== null) {
      return globalProject;
    }
    return readStored(STORAGE_KEYS.project) || "";
  });
  const [selectedTower, setSelectedTower] = useState(() => readStored(STORAGE_KEYS.tower));
  const [selectedFloor, setSelectedFloor] = useState(() => readStored(STORAGE_KEYS.floor));

  // Sincronizar si cambia el proyecto global externamente
  useEffect(() => {
    if (globalProject !== undefined && globalProject !== null && globalProject !== selectedProject) {
      setSelectedProject(globalProject);
      setSelectedTower(null);
      setSelectedFloor(null);
    }
  }, [globalProject]);

  // Persiste cada selección para que, si el usuario entra al detalle de un
  // ítem y vuelve, encuentre la misma obra / torre / piso que tenía elegidos.
  useEffect(() => {
    writeStored(STORAGE_KEYS.project, selectedProject);
  }, [selectedProject]);

  useEffect(() => {
    writeStored(STORAGE_KEYS.tower, selectedTower);
  }, [selectedTower]);

  useEffect(() => {
    writeStored(STORAGE_KEYS.floor, selectedFloor);
  }, [selectedFloor]);

  // Único filtro visible: Obra, y es obligatorio elegir una (no hay "Todas").
  // Torre pasa a ser pestañas y Piso se elige directo en la lista;
  // Área/Alcance y Actividad ya no se filtran aparte.
  const projectOptions = useMemo(
    () =>
      [...new Set(masterItems.map((i) => i.project).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "es"),
      ),
    [masterItems],
  );

  // Si lo que quedó guardado ya no existe entre las obras disponibles, se limpia
  // (pero no se fuerza ninguna obra por defecto: el usuario debe elegir).
  useEffect(() => {
    if (selectedProject && !projectOptions.includes(selectedProject)) {
      setSelectedProject(null);
    }
  }, [projectOptions, selectedProject]);

  const projectItems = useMemo(
    () => masterItems.filter((item) => item.project === selectedProject),
    [masterItems, selectedProject],
  );

  const towerOptions = useMemo(
    () =>
      [...new Set(projectItems.map((i) => i.tower).filter(isRealTower))].sort(
        (a, b) => a.localeCompare(b, "es"),
      ),
    [projectItems],
  );

  // Mantiene una torre seleccionada válida al cambiar de obra o al cargar datos.
  useEffect(() => {
    if (!towerOptions.length) {
      if (selectedTower !== null) setSelectedTower(null);
      return;
    }
    if (!selectedTower || !towerOptions.includes(selectedTower)) {
      setSelectedTower(towerOptions[0]);
    }
  }, [towerOptions, selectedTower]);

  const towerItems = useMemo(
    () =>
      projectItems.filter(
        (item) => !selectedTower || item.tower === selectedTower,
      ),
    [projectItems, selectedTower],
  );

  // Exteriores = alcance "torre", fijo para todo el proyecto (no varía por
  // torre ni por piso: las tareas de exteriores se ven siempre, elijas la
  // torre que elijas).
  const exteriorItems = useMemo(
    () => projectItems.filter(isTorreScopeItem),
    [projectItems],
  );

  // Verticales = fijo para todo el proyecto, tampoco varía por torre ni por piso.
  const verticalItems = useMemo(
    () =>
      projectItems.filter((item) =>
        VERTICAL_SCOPES.includes(getEffectiveScopeType(item)),
      ),
    [projectItems],
  );

  // Pisos predefinidos en el proyecto (columna "floors" de la obra), aunque
  // todavía no tengan ninguna tarea cargada en master_items.
  const currentProjectFloors = useMemo(() => {
    const project = projects.find((p) => p.name === selectedProject);
    if (!project || !project.floors) return [];
    try {
      const parsed =
        typeof project.floors === "string"
          ? JSON.parse(project.floors)
          : project.floors;
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }, [projects, selectedProject]);

  // buildFloorSummaries ya sabe completar los pisos definidos en el proyecto
  // que todavía no tengan ítems cargados (tercer parámetro configFloors).
  const floorSummaries = useMemo(
    () => buildFloorSummaries(towerItems, selectedTower || ALL, currentProjectFloors),
    [towerItems, selectedTower, currentProjectFloors],
  );

  const floorsSorted = useMemo(
    () => sortFloorsDesc(floorSummaries),
    [floorSummaries],
  );

  // Mantiene una selección de piso válida dentro de la torre activa.
  useEffect(() => {
    if (!floorsSorted.length) {
      if (selectedFloor !== null) setSelectedFloor(null);
      return;
    }
    if (
      !selectedFloor ||
      !floorsSorted.some((entry) => entry.floor === selectedFloor)
    ) {
      setSelectedFloor(floorsSorted[0].floor);
    }
  }, [floorsSorted, selectedFloor]);

  const selectedFloorData = useMemo(
    () => floorSummaries.find((entry) => entry.floor === selectedFloor) || null,
    [floorSummaries, selectedFloor],
  );

  const handleProjectChange = (value) => {
    setSelectedProject(value);
    setGlobalProject(value);
    setSelectedTower(null);
    setSelectedFloor(null);
  };

  const handleTowerChange = (tower) => {
    setSelectedTower(tower);
    setSelectedFloor(null);
  };

  const hasFloors = floorsSorted.length > 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Building2 className="h-4 w-4 text-accent" />
          Avance por Piso
        </CardTitle>
      </CardHeader>

      <CardContent>
        {/* ===== FILTRO ÚNICO: OBRA (obligatorio, sin "Todas") ===== */}
        <div className="mb-4 flex flex-wrap items-end gap-2.5 rounded-lg border bg-muted/20 p-3">
          <div className="flex w-full items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground sm:w-auto sm:pb-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-orange-500" />
            Filtros
          </div>

          <FilterField
            label="Obra"
            value={selectedProject || ""}
            onValueChange={handleProjectChange}
            placeholder="Elegí una obra"
          >
            {projectOptions.length === 0 ? (
              <SelectItem value={ALL} disabled>
                Sin obras
              </SelectItem>
            ) : (
              projectOptions.map((project) => (
                <SelectItem key={project} value={project}>
                  {project}
                </SelectItem>
              ))
            )}
          </FilterField>
        </div>

        {!selectedProject ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Elegí una obra para ver su avance.
          </div>
        ) : (
          <>
            {/* Pestañas de torre (solo si hay más de una) */}
            <TowerTabs
              towers={towerOptions}
              selectedTower={selectedTower}
              onSelect={handleTowerChange}
            />

            {!hasFloors ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Sin datos de pisos para los filtros seleccionados.
              </div>
            ) : (
              <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                <div className="w-full shrink-0 lg:w-[200px]">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Pisos
                  </p>
                  <FloorList
                    floors={floorsSorted}
                    selectedFloor={selectedFloor}
                    onSelectFloor={setSelectedFloor}
                  />
                </div>

                {selectedFloorData ? (
                  <FloorDetailPanel
                    floorData={selectedFloorData}
                    towerFilter={selectedTower || ALL}
                    masterItems={towerItems}
                    onClose={() => setSelectedFloor(null)}
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed py-16 text-sm text-muted-foreground">
                    Selecciona un piso para ver el desglose.
                  </div>
                )}
              </div>
            )}

            {/* Franja fija por torre: Exteriores + Verticales (siempre visible,
               aunque no tengan tareas cargadas todavía). Va después de Pisos
               porque es lo que se consulta con menos frecuencia. */}
            <TorreFixedPanel
              exteriorItems={exteriorItems}
              verticalItems={verticalItems}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}