import {
  getFloorList,
  getFloorNumber,
  getCanonicalFloorName,
  getFloorPriority,
} from "@/utils/floors";
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
  const canonicalTarget = getCanonicalFloorName(floorName);
  const canonicalItem = getCanonicalFloorName(item?.floor);

  if (canonicalTarget === canonicalItem) return true;

  const list = getFloorList(item?.floor).map(getCanonicalFloorName);
  if (list.includes(canonicalTarget)) return true;

  if (getFloorList(item?.floor).includes(floorName)) return true;

  return false;
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
  const cleanFloor = String(floorName || "").toLowerCase();
  const isBasement = cleanFloor.includes("subterraneo") || cleanFloor.includes("subterráneo");
  const isComun = cleanFloor.includes("comun") || cleanFloor.includes("común");

  return items.filter((item) => {
    const itemTower = String(item.tower || "").trim();
    const itemIsBasement =
      itemTower.toLowerCase().includes("subterraneo") ||
      itemTower.toLowerCase().includes("subterráneo") ||
      item.zone_type === "subterraneo" ||
      String(item.floor || "").toLowerCase().includes("subterraneo") ||
      String(item.floor || "").toLowerCase().includes("subterráneo");

    const itemIsComun =
      itemTower.toLowerCase().includes("comun") ||
      itemTower.toLowerCase().includes("común") ||
      item.zone_type === "areas_comunes" ||
      String(item.floor || "").toLowerCase().includes("comun") ||
      String(item.floor || "").toLowerCase().includes("común");

    if (isBasement) {
      if (!itemIsBasement) return false;
    } else if (isComun) {
      if (!itemIsComun) return false;
    } else {
      if (towerFilter && towerFilter !== "__all__" && itemTower !== towerFilter) {
        return false;
      }
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
  const cleanFloor = String(floorName || "").toLowerCase();
  const isBasement = cleanFloor.includes("subterraneo") || cleanFloor.includes("subterráneo");
  const isComun = cleanFloor.includes("comun") || cleanFloor.includes("común");

  return items.filter((item) => {
    const itemTower = String(item.tower || "").trim();
    const itemIsBasement =
      itemTower.toLowerCase().includes("subterraneo") ||
      itemTower.toLowerCase().includes("subterráneo") ||
      item.zone_type === "subterraneo" ||
      String(item.floor || "").toLowerCase().includes("subterraneo") ||
      String(item.floor || "").toLowerCase().includes("subterráneo");

    const itemIsComun =
      itemTower.toLowerCase().includes("comun") ||
      itemTower.toLowerCase().includes("común") ||
      item.zone_type === "areas_comunes" ||
      String(item.floor || "").toLowerCase().includes("comun") ||
      String(item.floor || "").toLowerCase().includes("común");

    if (isBasement) {
      if (!itemIsBasement) return false;
    } else if (isComun) {
      if (!itemIsComun) return false;
    } else {
      if (towerFilter && towerFilter !== "__all__" && itemTower !== towerFilter) {
        return false;
      }
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

export function buildFloorSummaries(items, towerFilter, configFloors = [], projectObj = null) {
  const isSubFilter = /subterr[aá]neo/i.test(String(towerFilter || ""));
  const isComunFilter = /com[uú]n/i.test(String(towerFilter || ""));

  const floorNames = new Set();

  // 1. Caso: Filtrado exclusivo por Subterráneo
  if (isSubFilter) {
    let maxSub = 0;

    try {
      let subs = projectObj?.subterraneos;
      if (typeof subs === "string") subs = JSON.parse(subs);
      if (Array.isArray(subs)) {
        subs.forEach((s) => {
          const match = String(s).match(/-?\d+/);
          const num = match ? Math.abs(parseInt(match[0], 10)) : 1;
          if (num > maxSub) maxSub = num;
        });
      }
    } catch {}

    items.forEach((item) => {
      const isSub =
        /subterr[aá]neo/i.test(String(item.tower || "")) ||
        item.zone_type === "subterraneo" ||
        /subterr[aá]neo/i.test(String(item.floor || ""));
      if (isSub) {
        const match = String(item.floor).match(/-?\d+/);
        const num = match ? Math.abs(parseInt(match[0], 10)) : 1;
        if (num > maxSub) maxSub = num;
      }
    });

    if (maxSub === 0) maxSub = 1;

    for (let s = 1; s <= maxSub; s++) {
      floorNames.add(`Subterráneo -${s}`);
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
      .sort((a, b) => getFloorPriority(b.floor) - getFloorPriority(a.floor));
  }

  // 2. Caso: Filtrado exclusivo por Áreas Comunes
  if (isComunFilter) {
    floorNames.add("Áreas Comunes");

    return [...floorNames].map((floor) => {
      const pisoItemsOnly = getPisoItemsForFloor(items, floor, towerFilter);
      const deptoItemsOnly = getDepartamentoItemsForFloor(items, floor, towerFilter);
      const pisoItems = [...pisoItemsOnly, ...deptoItemsOnly];
      const pct = computeFloorGlobalPct(pisoItems);
      const qtySummary = computeFloorQtySummary(pisoItems);
      const startDate = getEarliestStartDate(pisoItems);

      return {
        floor,
        floorNum: 0,
        pct,
        pisoItems,
        qtySummary,
        startDate,
        itemCount: pisoItems.length,
      };
    });
  }

  // 3. Torre específica o Todo el Edificio:
  // Agregar pisos de la torre
  if (Array.isArray(configFloors)) {
    configFloors.forEach((f) => {
      if (f && typeof f === "string") {
        const trimmed = f.trim();
        if (!trimmed.includes("→") && !trimmed.includes("->")) {
          floorNames.add(getCanonicalFloorName(trimmed));
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
              floorNames.add(getCanonicalFloorName(trimmed));
            }
          }
        });
      }
    } catch {}
  }

  // Subterráneos que pertenecen a la base del edificio
  let maxSub = 0;
  try {
    let subs = projectObj?.subterraneos;
    if (typeof subs === "string") subs = JSON.parse(subs);
    if (Array.isArray(subs)) {
      subs.forEach((s) => {
        const match = String(s).match(/-?\d+/);
        const num = match ? Math.abs(parseInt(match[0], 10)) : 0;
        if (num > maxSub) maxSub = num;
      });
    }
  } catch {}

  items.forEach((item) => {
    const isSub =
      /subterr[aá]neo/i.test(String(item.tower || "")) ||
      item.zone_type === "subterraneo" ||
      /subterr[aá]neo/i.test(String(item.floor || ""));
    if (isSub) {
      const match = String(item.floor).match(/-?\d+/);
      const num = match ? Math.abs(parseInt(match[0], 10)) : 0;
      if (num > maxSub) maxSub = num;
    }
  });

  if (maxSub > 0) {
    for (let s = 1; s <= maxSub; s++) {
      floorNames.add(`Subterráneo -${s}`);
    }
  }

  // Áreas comunes en nivel de acceso
  let hasComunes = false;
  try {
    let areas = projectObj?.areas_comunes;
    if (typeof areas === "string") areas = JSON.parse(areas);
    if (Array.isArray(areas) && areas.length > 0) hasComunes = true;
  } catch {}
  if (
    items.some(
      (i) =>
        /com[uú]n/i.test(String(i.tower || "")) ||
        i.zone_type === "areas_comunes" ||
        /com[uú]n/i.test(String(i.floor || ""))
    )
  ) {
    hasComunes = true;
  }
  if (hasComunes) {
    floorNames.add("Áreas Comunes");
  }

  // Pisos de las partidas
  items.forEach((item) => {
    const isBasement =
      /subterr[aá]neo/i.test(String(item.tower || "")) ||
      item.zone_type === "subterraneo" ||
      /subterr[aá]neo/i.test(String(item.floor || ""));
    const isComun =
      /com[uú]n/i.test(String(item.tower || "")) ||
      item.zone_type === "areas_comunes" ||
      /com[uú]n/i.test(String(item.floor || ""));

    if (!isBasement && !isComun) {
      if (towerFilter && towerFilter !== "__all__" && item.tower !== towerFilter) {
        return;
      }
    }

    if (isPisoScopeItem(item) || isDepartamentoScopeItem(item)) {
      getFloorList(item.floor).forEach((floor) => {
        const canonical = getCanonicalFloorName(floor);
        if (canonical && !canonical.includes("→") && !canonical.includes("->")) {
          floorNames.add(canonical);
        }
      });
    }

    if (isVerticalScope(getEffectiveScopeType(item))) {
      const { fromNum, toNum } = getVerticalFloorRange(item);
      if (fromNum !== null && toNum !== null) {
        const min = Math.min(fromNum, toNum);
        const max = Math.max(fromNum, toNum);
        for (let n = min; n <= max; n += 1) {
          floorNames.add(`Piso ${n}`);
        }
      }
    }
  });

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
    .sort((a, b) => getFloorPriority(b.floor) - getFloorPriority(a.floor));
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
