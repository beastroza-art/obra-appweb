import { getFloorList, getFloorNumber } from "@/utils/floors";
import {
  SCOPE_TYPES,
  normalizeScopeTypeValue,
  isVerticalScope,
  buildVerticalFloorLabel,
} from "@/constants/activityScope";

export function getItemProgressPct(item) {
  const planned = Number(item?.planned_qty || 0);
  const executed = Number(item?.executed_qty || 0);
  if (planned <= 0) return 0;
  return Math.min(Math.round((executed / planned) * 100), 100);
}

export function formatQtyWithUnit(item) {
  const executed = Number(item?.executed_qty || 0);
  const planned = Number(item?.planned_qty || 0);
  const unit = String(item?.unit || "und").trim() || "und";
  return `${executed} / ${planned} ${unit}`;
}

export function getEffectiveScopeType(item) {
  const scope = normalizeScopeTypeValue(item?.scope_type);
  if (scope) return scope;
  return SCOPE_TYPES.PISO;
}

export function isPisoScopeItem(item) {
  const scope = getEffectiveScopeType(item);
  return [
    SCOPE_TYPES.PISO,
    SCOPE_TYPES.MULTIPLES_PISOS,
    SCOPE_TYPES.PASILLO,
    SCOPE_TYPES.ESPACIOS_COMUNES,
    SCOPE_TYPES.SALAS_ASIGNABLES,
    SCOPE_TYPES.BODEGAS,
  ].includes(scope);
}

export function isTorreScopeItem(item) {
  return getEffectiveScopeType(item) === SCOPE_TYPES.TORRE;
}

export function isDepartamentoScopeItem(item) {
  return getEffectiveScopeType(item) === SCOPE_TYPES.DEPARTAMENTO;
}

export function itemMatchesFloor(item, floorName) {
  if (!floorName) return false;
  return getFloorList(item?.floor).includes(floorName);
}

export function getVerticalFloorRange(item) {
  const label = String(item?.floor || "").trim();
  const parts = label
    .split(/\s*(?:→|->|-|\/)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      from: parts[0],
      to: parts[parts.length - 1],
      fromNum: getFloorNumber(parts[0]),
      toNum: getFloorNumber(parts[parts.length - 1]),
    };
  }

  return {
    from: label,
    to: "",
    fromNum: getFloorNumber(label),
    toNum: null,
  };
}

export function verticalPassesThroughFloor(item, floorName) {
  if (!isVerticalScope(getEffectiveScopeType(item))) return false;

  const floorNum = getFloorNumber(floorName);
  if (floorNum === null) {
    const range = getVerticalFloorRange(item);
    return range.from === floorName || range.to === floorName;
  }

  const { fromNum, toNum } = getVerticalFloorRange(item);
  if (fromNum === null && toNum === null) return true;
  if (fromNum !== null && toNum !== null) {
    const min = Math.min(fromNum, toNum);
    const max = Math.max(fromNum, toNum);
    return floorNum >= min && floorNum <= max;
  }
  if (fromNum !== null) return floorNum === fromNum;
  if (toNum !== null) return floorNum === toNum;
  return false;
}

export function getPisoItemsForFloor(items, floorName, towerFilter) {
  return items.filter((item) => {
    if (towerFilter && towerFilter !== "__all__" && item.tower !== towerFilter) {
      return false;
    }
    if (!isPisoScopeItem(item)) return false;
    return itemMatchesFloor(item, floorName);
  });
}

export function getVerticalItemsForFloor(items, floorName, towerFilter) {
  return items.filter((item) => {
    if (towerFilter && towerFilter !== "__all__" && item.tower !== towerFilter) {
      return false;
    }
    return verticalPassesThroughFloor(item, floorName);
  });
}

export function getDepartamentoItemsForFloor(items, floorName, towerFilter) {
  return items.filter((item) => {
    if (towerFilter && towerFilter !== "__all__" && item.tower !== towerFilter) {
      return false;
    }
    if (!isDepartamentoScopeItem(item)) return false;
    return itemMatchesFloor(item, floorName);
  });
}

export function getTorreItemsForTower(items, towerFilter) {
  if (!towerFilter || towerFilter === "__all__") return [];
  return items.filter(
    (item) => item.tower === towerFilter && isTorreScopeItem(item),
  );
}

export function computeFloorGlobalPct(items) {
  if (!items.length) return 0;
  let totalPct = 0;
  items.forEach((item) => {
    totalPct += getItemProgressPct(item);
  });
  return Math.round(totalPct / items.length);
}

export function computeFloorQtySummary(pisoItems) {
  const byUnit = {};

  pisoItems.forEach((item) => {
    const unit = String(item?.unit || "und").trim() || "und";
    if (!byUnit[unit]) {
      byUnit[unit] = { executed: 0, planned: 0 };
    }
    byUnit[unit].executed += Number(item.executed_qty || 0);
    byUnit[unit].planned += Number(item.planned_qty || 0);
  });

  return Object.entries(byUnit).map(([unit, totals]) => ({
    unit,
    ...totals,
    label: `${totals.executed} / ${totals.planned} ${unit}`,
  }));
}

export function getEarliestStartDate(items) {
  return items.reduce((earliest, item) => {
    if (!item?.start_date) return earliest;
    if (!earliest || item.start_date < earliest) return item.start_date;
    return earliest;
  }, "");
}

export function buildFloorSummaries(items, towerFilter, configFloors = []) {
  const floorNames = new Set();

  // Add all project configuration floors if provided
  if (Array.isArray(configFloors)) {
    configFloors.forEach((f) => {
      if (f && typeof f === "string") {
        const trimmed = f.trim();
        if (!trimmed.includes("→") && !trimmed.includes("->")) {
          floorNames.add(trimmed);
        }
      }
    });
  } else if (typeof configFloors === "string") {
    try {
      const parsed = JSON.parse(configFloors);
      if (Array.isArray(parsed)) {
        parsed.forEach((f) => {
          if (f && typeof f === "string") {
            const trimmed = f.trim();
            if (!trimmed.includes("→") && !trimmed.includes("->")) {
              floorNames.add(trimmed);
            }
          }
        });
      }
    } catch {
      // ignore JSON parse failure
    }
  }

  items.forEach((item) => {
    if (towerFilter && towerFilter !== "__all__" && item.tower !== towerFilter) {
      return;
    }

    if (isPisoScopeItem(item) || isDepartamentoScopeItem(item)) {
      getFloorList(item.floor).forEach((floor) => {
        const trimmed = String(floor || "").trim();
        if (trimmed && !trimmed.includes("→") && !trimmed.includes("->")) {
          floorNames.add(trimmed);
        }
      });
    }

    if (isVerticalScope(getEffectiveScopeType(item))) {
      const { from, to, fromNum, toNum } = getVerticalFloorRange(item);
      if (from) {
        const trimmedFrom = String(from || "").trim();
        if (trimmedFrom && !trimmedFrom.includes("→") && !trimmedFrom.includes("->")) {
          floorNames.add(trimmedFrom);
        }
      }
      if (to) {
        const trimmedTo = String(to || "").trim();
        if (trimmedTo && !trimmedTo.includes("→") && !trimmedTo.includes("->")) {
          floorNames.add(trimmedTo);
        }
      }
      if (fromNum !== null && toNum !== null) {
        const min = Math.min(fromNum, toNum);
        const max = Math.max(fromNum, toNum);
        for (let n = min; n <= max; n += 1) {
          floorNames.add(`Piso ${n}`);
        }
      }
    }
  });

  // Calculate lowest subterranean number and highest piso number
  let minSub = 0;
  let maxPiso = 1;
  let hasCubierta = false;

  floorNames.forEach((name) => {
    const clean = String(name || "").trim().toLowerCase();
    if (clean.includes("cubierta") || clean.includes("azotea")) {
      hasCubierta = true;
    }
    const subMatch = clean.match(/subterraneo\s*(\d+)/i) || clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/subterraneo\s*(\d+)/i);
    if (subMatch) {
      const num = parseInt(subMatch[1], 10);
      if (num > minSub) minSub = num;
    }
    const floorMatch = clean.match(/piso\s*(\d+)/i);
    if (floorMatch) {
      const num = parseInt(floorMatch[1], 10);
      if (num > maxPiso) maxPiso = num;
    }
  });

  // Fill in gapless subterranean levels if any subterranean floor exists
  if (minSub > 0) {
    for (let s = minSub; s >= 1; s--) {
      floorNames.add(`Subterráneo ${s}`);
    }
  }

  // Fill in gapless piso levels
  if (maxPiso > 0) {
    for (let p = 1; p <= maxPiso; p++) {
      floorNames.add(`Piso ${p}`);
    }
  }

  if (hasCubierta || items.some(i => String(i.scope_type || "").includes("vertical"))) {
    floorNames.add("Cubierta");
  }

  return [...floorNames]
    .map((floor) => {
      const pisoItemsOnly = getPisoItemsForFloor(items, floor, towerFilter);
      const deptoItemsOnly = getDepartamentoItemsForFloor(items, floor, towerFilter);
      const pisoItems = [...pisoItemsOnly, ...deptoItemsOnly];
      const pct = computeFloorGlobalPct(pisoItems);
      const qtySummary = computeFloorQtySummary(pisoItems);
      const startDate = getEarliestStartDate(pisoItems);

      return {
        floor,
        floorNum: getFloorNumber(floor) ?? -1,
        pct,
        pisoItems,
        qtySummary,
        startDate,
        itemCount: pisoItems.length,
      };
    })
    .sort((a, b) => {
      if (b.floorNum !== a.floorNum) return b.floorNum - a.floorNum;
      return String(a.floor).localeCompare(String(b.floor), "es", {
        numeric: true,
      });
    });
}

export function getVerticalShortLabel(item) {
  const range = getVerticalFloorRange(item);
  const fromNum = range.fromNum;
  const toNum = range.toNum;

  if (fromNum !== null && toNum !== null && fromNum !== toNum) {
    return `P${fromNum}→P${toNum}`;
  }

  const built = buildVerticalFloorLabel(range.from, range.to);
  return built || item?.activity || "Vertical";
}

export function getRestrictionLabel(item) {
  const text = String(item?.restrictions || "").trim();
  if (text) return text;
  if (item?.release_status === "parcial") return "Liberación parcial";
  return "Sin restricción";
}

export const STATUS_META = {
  completado: {
    label: "Completado",
    className: "text-emerald-700",
    badgeClass: "bg-emerald-500 text-white",
  },
  en_ejecucion: {
    label: "En ejecución",
    className: "text-blue-700",
    badgeClass: "bg-sky-500 text-white",
  },
  pendiente: {
    label: "Pendiente",
    className: "text-slate-600",
    badgeClass: "bg-slate-400 text-white",
  },
  bloqueado: {
    label: "Bloqueado",
    className: "text-red-700",
    badgeClass: "bg-red-500 text-white",
  },
  "piso bloqueado": {
    label: "Piso Bloqueado",
    className: "text-rose-700",
    badgeClass: "bg-rose-500 text-white",
  },
};

export function getStatusMeta(status) {
  return STATUS_META[status] || STATUS_META.pendiente;
}

export function getProgressStyle(pct) {
  if (pct >= 100) {
    return {
      badge: "bg-emerald-500 text-white",
      bar: "bg-emerald-500",
      text: "text-emerald-600",
    };
  }
  if (pct >= 75) {
    return {
      badge: "bg-emerald-400 text-white",
      bar: "bg-emerald-400",
      text: "text-emerald-600",
    };
  }
  if (pct >= 50) {
    return {
      badge: "bg-amber-400 text-amber-900",
      bar: "bg-amber-400",
      text: "text-amber-600",
    };
  }
  if (pct >= 25) {
    return {
      badge: "bg-orange-400 text-orange-900",
      bar: "bg-orange-400",
      text: "text-orange-600",
    };
  }
  if (pct > 0) {
    return {
      badge: "bg-red-400 text-white",
      bar: "bg-red-300",
      text: "text-red-600",
    };
  }
  return {
    badge: "bg-slate-300 text-slate-700",
    bar: "bg-slate-300",
    text: "text-slate-500",
  };
}
