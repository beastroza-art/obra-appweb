import { getFloorList } from "@/utils/floors";
import { SCOPE_TYPES, getScopeDisplayLabel, normalizeScopeTypeValue } from "@/constants/activityScope";

export const STATUS_OPTIONS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_ejecucion", label: "En ejecución" },
  { value: "bloqueado", label: "Bloqueado" },
  { value: "completado", label: "Completado" },
];

export const RELEASE_OPTIONS = [
  { value: "liberado", label: "Liberado" },
  { value: "no_liberado", label: "No liberado" },
  { value: "parcial", label: "Parcial" },
  { value: "terminado", label: "Terminado" },
];

export const statusBadgeClass = {
  pendiente: "border border-slate-200 bg-slate-100 text-slate-700",
  en_ejecucion: "border border-blue-200 bg-blue-50 text-blue-700",
  completado: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  bloqueado: "border border-red-200 bg-red-50 text-red-700",
  "piso bloqueado": "border border-red-250 bg-rose-50 text-rose-700",
};

export const releaseBadgeClass = {
  liberado: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  no_liberado: "border border-red-200 bg-red-50 text-red-700",
  parcial: "border border-amber-200 bg-amber-50 text-amber-800",
  terminado: "border border-emerald-200 bg-emerald-100 text-emerald-800",
};

export const statusLabel = {
  pendiente: "Pendiente",
  en_ejecucion: "En ejecución",
  completado: "Completado",
  bloqueado: "Bloqueado",
  "piso bloqueado": "Piso Bloqueado",
};

export const releaseLabel = {
  liberado: "Liberado",
  no_liberado: "No liberado",
  parcial: "Parcial",
  terminado: "Terminado",
};

export const DEFAULT_VISIBLE_COLUMNS = {
  supervisor: false,
  restrictions: false,
  observations: false,
  release: true,
};

export const COLUMN_DEFS = [
  { id: "release", label: "Liberación", primary: false },
  { id: "supervisor", label: "Supervisor", primary: false },
  { id: "restrictions", label: "Restricciones", primary: false },
  { id: "observations", label: "Observaciones", primary: false },
];

const EXPAND_STORAGE_KEY = "master-plan-expanded-nodes";

export const EMPTY_SIDEBAR_FILTERS = {
  projects: [],
  towers: [],
  floors: [],
  activities: [],
  status: [],
  release: [],
  supervisor: [],
  search: "",
};

export function getProgressPct(item) {
  const planned = Number(item?.planned_qty || 0);
  const executed = Number(item?.executed_qty || 0);
  if (planned <= 0) return 0;
  return Math.min(Math.round((executed / planned) * 100), 100);
}

export function getProgressBarClass(pct) {
  if (pct >= 75) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-400";
  if (pct >= 25) return "bg-orange-400";
  if (pct > 0) return "bg-red-400";
  return "bg-slate-200";
}

export function formatNumber(value) {
  const number = Number(value || 0);
  if (Number.isInteger(number)) return number;
  return number.toFixed(2);
}

export function buildRowsForFloors(items) {
  return items.flatMap((item) => {
    const scopeType = normalizeScopeTypeValue(item.scope_type);

    if (scopeType !== SCOPE_TYPES.PISO) {
      return [{
        ...item,
        displayFloor: getScopeDisplayLabel(item, true),
        displayRowId: `${item.id}-default`,
        isPrimaryFloorRow: true,
      }];
    }

    const floors = getFloorList(item.floor);

    if (floors.length === 0) {
      return [{
        ...item,
        displayFloor: "",
        displayRowId: `${item.id}-default`,
        isPrimaryFloorRow: true,
      }];
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

export function logBelongsToFloor(log, row) {
  const logFloor = normalizeFloor(log.floor);
  const rowFloor = normalizeFloor(row.displayFloor);

  if (!rowFloor) return !logFloor;
  if (logFloor === rowFloor) return true;

  return row.isPrimaryFloorRow && logFloor === normalizeFloor(row.floor);
}

export function aggregateProgress(rows) {
  if (!rows?.length) return 0;

  return Math.round(
    rows.reduce((sum, row) => sum + getProgressPct(row), 0) / rows.length
  );
}

export function collectRowsFromTree(tree) {
  const result = [];

  tree.forEach((project) => {
    project.children.forEach((tower) => {
      tower.children.forEach((floor) => {
        floor.rows.forEach((row) => result.push(row));
      });
    });
  });

  return result;
}

export function buildGroupedTree(rows) {
  const tree = [];

  rows.forEach((row) => {
    const projectKey = row.project || "Sin proyecto";
    const towerKey = row.tower || "Sin torre";
    const floorKey = row.displayFloor || "Sin piso";

    let projectNode = tree.find((node) => node.key === projectKey);
    if (!projectNode) {
      projectNode = {
        type: "project",
        key: projectKey,
        label: projectKey,
        id: `project:${projectKey}`,
        children: [],
      };
      tree.push(projectNode);
    }

    let towerNode = projectNode.children.find((node) => node.key === towerKey);
    if (!towerNode) {
      towerNode = {
        type: "tower",
        key: towerKey,
        label: towerKey,
        id: `tower:${projectKey}:${towerKey}`,
        children: [],
      };
      projectNode.children.push(towerNode);
    }

    let floorNode = towerNode.children.find((node) => node.key === floorKey);
    if (!floorNode) {
      floorNode = {
        type: "floor",
        key: floorKey,
        label: floorKey,
        id: `floor:${projectKey}:${towerKey}:${floorKey}`,
        rows: [],
      };
      towerNode.children.push(floorNode);
    }

    floorNode.rows.push(row);
  });

  tree.forEach((project) => {
    project.children.forEach((tower) => {
      tower.children.sort((a, b) =>
        String(a.label).localeCompare(String(b.label), "es", { numeric: true })
      );
    });
  });

  return tree;
}

export function collectExpandableIds(tree) {
  const ids = [];

  tree.forEach((project) => {
    ids.push(project.id);
    project.children.forEach((tower) => {
      ids.push(tower.id);
      tower.children.forEach((floor) => {
        ids.push(floor.id);
      });
    });
  });

  return ids;
}

export function loadExpandedState(tree) {
  const allIds = collectExpandableIds(tree);

  try {
    const raw = localStorage.getItem(EXPAND_STORAGE_KEY);
    if (!raw) {
      return Object.fromEntries(allIds.map((id) => [id, true]));
    }

    const saved = JSON.parse(raw);
    return Object.fromEntries(
      allIds.map((id) => [id, saved[id] !== false])
    );
  } catch {
    return Object.fromEntries(allIds.map((id) => [id, true]));
  }
}

export function saveExpandedState(expanded) {
  try {
    localStorage.setItem(EXPAND_STORAGE_KEY, JSON.stringify(expanded));
  } catch {
    // ignore quota errors
  }
}

export function computePlanKpis(rows) {
  const uniqueItems = new Map();

  rows.forEach((row) => {
    uniqueItems.set(row.id, row);
  });

  const items = [...uniqueItems.values()];
  const totalActivities = items.length;
  const inProgress = items.filter((item) => item.status === "en_ejecucion").length;
  const blocked = items.filter((item) => item.status === "bloqueado").length;
  const avgProgress = items.length
    ? Math.round(
        items.reduce((sum, item) => sum + getProgressPct(item), 0) / items.length
      )
    : 0;

  return {
    totalRows: rows.length,
    totalActivities,
    inProgress,
    blocked,
    avgProgress,
  };
}

export function applySidebarFilters(rows, filters, projectSupervisorByName) {
  return rows.filter((row) => {
    if (filters.status?.length && !filters.status.includes(row.status)) {
      return false;
    }

    if (filters.release?.length && !filters.release.includes(row.release_status)) {
      return false;
    }

    if (filters.supervisor?.length) {
      const supervisor = projectSupervisorByName[row.project] || "";
      if (!filters.supervisor.includes(supervisor)) return false;
    }

    if (filters.projects?.length && !filters.projects.includes(row.project)) {
      return false;
    }

    if (filters.towers?.length && !filters.towers.includes(row.tower)) {
      return false;
    }

    if (filters.floors?.length && !filters.floors.includes(row.displayFloor)) {
      return false;
    }

    if (filters.activities?.length && !filters.activities.includes(row.activity)) {
      return false;
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      const searchable = `
        ${row.project || ""}
        ${row.tower || ""}
        ${row.displayFloor || ""}
        ${row.activity || ""}
        ${row.crew_name || ""}
        ${row.restrictions || ""}
        ${row.observations || ""}
      `.toLowerCase();

      if (!searchable.includes(search)) return false;
    }

    return true;
  });
}

export function filterItemsBySidebarFilters(items, sidebarFilters, projectSupervisorByName) {
  if (!sidebarFilters) return items;

  const hasActiveFilter =
    sidebarFilters.projects?.length ||
    sidebarFilters.towers?.length ||
    sidebarFilters.floors?.length ||
    sidebarFilters.activities?.length ||
    sidebarFilters.status?.length ||
    sidebarFilters.release?.length ||
    sidebarFilters.supervisor?.length ||
    sidebarFilters.search;

  if (!hasActiveFilter) return items;

  const rows = buildRowsForFloors(items);
  const filteredRows = applySidebarFilters(rows, sidebarFilters, projectSupervisorByName);
  const allowedIds = new Set(filteredRows.map((row) => row.id));

  return items.filter((item) => allowedIds.has(item.id));
}

export function paginateRows(rows, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    page: safePage,
    totalPages,
    rows: rows.slice(start, start + pageSize),
  };
}
