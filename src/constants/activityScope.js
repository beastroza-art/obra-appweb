export const SCOPE_TYPES = {
  TORRE: "torre",
  PISO: "piso",
  DEPARTAMENTO: "departamento",
  VERTICAL_EL: "vertical_el",
  VERTICAL_TC: "vertical_tc",
  VERTICAL_CD: "vertical_cd",
  MULTIPLES_PISOS: "multiples_pisos",
  PASILLO: "pasillo",
  ESPACIOS_COMUNES: "espacios_comunes",
  SALAS_ASIGNABLES: "salas_asignables",
  BODEGAS: "bodegas",
};

export const LEGACY_SCOPE_ALIASES = {
  vertical: SCOPE_TYPES.VERTICAL_EL,
  obra: SCOPE_TYPES.TORRE,
};

export const VERTICAL_SCOPE_TYPES = [
  SCOPE_TYPES.VERTICAL_EL,
  SCOPE_TYPES.VERTICAL_TC,
  SCOPE_TYPES.VERTICAL_CD,
];

export const SCOPE_TYPE_OPTIONS = [
  { value: SCOPE_TYPES.TORRE, label: "Por Torre" },
  { value: SCOPE_TYPES.PISO, label: "Por Piso" },
  { value: SCOPE_TYPES.DEPARTAMENTO, label: "Por Departamento" },
  { value: SCOPE_TYPES.VERTICAL_EL, label: "Vertical EL" },
  { value: SCOPE_TYPES.VERTICAL_TC, label: "Vertical TC" },
  { value: SCOPE_TYPES.VERTICAL_CD, label: "Vertical CD" },
  { value: SCOPE_TYPES.MULTIPLES_PISOS, label: "Múltiples Pisos" },
  { value: SCOPE_TYPES.PASILLO, label: "Pasillo" },
  { value: SCOPE_TYPES.ESPACIOS_COMUNES, label: "Espacios Comunes" },
  { value: SCOPE_TYPES.SALAS_ASIGNABLES, label: "Salas Asignables" },
  { value: SCOPE_TYPES.BODEGAS, label: "Bodegas" },
];

export const MEASUREMENT_UNITS = [
  { value: "und", label: "Unidad (und)" },
  { value: "m", label: "Metro (m)" },
  { value: "ml", label: "Metro lineal (ml)" },
  { value: "eje", label: "Eje" },
  { value: "depto", label: "Departamento (depto)" },
  { value: "punto", label: "Punto" },
];

export const VALID_UNITS = MEASUREMENT_UNITS.map((unit) => unit.value);

export function normalizeScopeTypeValue(scopeType) {
  const normalized = String(scopeType || SCOPE_TYPES.PISO).trim().toLowerCase();
  return LEGACY_SCOPE_ALIASES[normalized] || normalized;
}

export function isVerticalScope(scopeType) {
  return VERTICAL_SCOPE_TYPES.includes(normalizeScopeTypeValue(scopeType));
}

export function getUnitLabel(unit) {
  const match = MEASUREMENT_UNITS.find((entry) => entry.value === unit);
  return match ? match.label : unit || "und";
}

export function getScopeTypeLabel(scopeType) {
  const normalized = normalizeScopeTypeValue(scopeType);
  const match = SCOPE_TYPE_OPTIONS.find((entry) => entry.value === normalized);
  return match ? match.label : scopeType || "Por Piso";
}

export function buildVerticalFloorLabel(floorFrom, floorTo) {
  const primary = String(floorFrom || "").trim();
  const secondary = String(floorTo || "").trim();

  if (!primary && !secondary) return "";
  if (primary && secondary && primary !== secondary) {
    return `${primary} → ${secondary}`;
  }
  return primary || secondary || "";
}

export function getVerticalScopeDisplayLabel(item) {
  const scope = normalizeScopeTypeValue(item?.scope_type);
  let vLabel = "Vertical EL";
  if (scope === SCOPE_TYPES.VERTICAL_CD) {
    vLabel = "Vertical CD";
  } else if (scope === SCOPE_TYPES.VERTICAL_TC) {
    vLabel = "Vertical TC";
  }
  const range = buildVerticalFloorLabel(item?.floor, "");

  if (range) {
    return `${vLabel} · recorrido ${range}`;
  }

  return vLabel;
}

export function getScopeDisplayLabel(item, hideDepartments = false) {
  const scope = normalizeScopeTypeValue(item?.scope_type);

  switch (scope) {
    case SCOPE_TYPES.TORRE:
      return item?.tower || "Torre";
    case SCOPE_TYPES.DEPARTAMENTO: {
      if (hideDepartments) {
        return item?.floor || "Departamento";
      }
      const depts = String(item?.departments || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const floor = item?.floor ? ` (${item.floor})` : "";
      return depts.length > 0
        ? `Deptos ${depts.join(", ")}${floor}`
        : `Departamento${floor}`;
    }
    case SCOPE_TYPES.VERTICAL_EL:
    case SCOPE_TYPES.VERTICAL_TC:
    case SCOPE_TYPES.VERTICAL_CD:
      return getVerticalScopeDisplayLabel(item);
    case SCOPE_TYPES.PASILLO:
      return `Pasillo (${item?.floor || "Sin piso"})`;
    case SCOPE_TYPES.ESPACIOS_COMUNES:
      return `Espacios Comunes (${item?.floor || "Sin piso"})`;
    case SCOPE_TYPES.SALAS_ASIGNABLES:
      return `Salas Asignables (${item?.floor || "Sin piso"})`;
    case SCOPE_TYPES.BODEGAS:
      return `Bodegas (${item?.floor || "Sin piso"})`;
    case SCOPE_TYPES.MULTIPLES_PISOS:
      return item?.floor || "Múltiples Pisos";
    default:
      return item?.floor || "Sin piso";
  }
}

export const SCOPE_LEGEND = [
  {
    scope: SCOPE_TYPES.TORRE,
    label: "Por Torre",
    description: "Aplica a toda la torre",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  {
    scope: SCOPE_TYPES.PISO,
    label: "Por Piso",
    description: "Aplica a un piso específico",
    color: "text-violet-700 bg-violet-50 border-violet-200",
  },
  {
    scope: SCOPE_TYPES.DEPARTAMENTO,
    label: "Por Departamento",
    description: "Aplica a departamentos individuales",
    color: "text-amber-700 bg-amber-50 border-amber-200",
  },
  {
    scope: SCOPE_TYPES.VERTICAL_EL,
    label: "Vertical EL",
    description: "Riser eléctrico por torre (m, und, punto)",
    color: "text-red-700 bg-red-50 border-red-200",
  },
  {
    scope: SCOPE_TYPES.VERTICAL_TC,
    label: "Vertical TC",
    description: "Riser telecomunicaciones por torre",
    color: "text-sky-700 bg-sky-50 border-sky-200",
  },
  {
    scope: SCOPE_TYPES.VERTICAL_CD,
    label: "Vertical CD",
    description: "Riser corrientes débiles por torre",
    color: "text-orange-700 bg-orange-50 border-orange-200",
  },
  {
    scope: SCOPE_TYPES.MULTIPLES_PISOS,
    label: "Múltiples Pisos",
    description: "Aplica a varios pisos agrupados",
    color: "text-indigo-700 bg-indigo-50 border-indigo-200",
  },
  {
    scope: SCOPE_TYPES.PASILLO,
    label: "Pasillo",
    description: "Aplica al pasillo de un piso",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  {
    scope: SCOPE_TYPES.ESPACIOS_COMUNES,
    label: "Espacios Comunes",
    description: "Aplica a espacios comunes",
    color: "text-rose-700 bg-rose-50 border-rose-200",
  },
  {
    scope: SCOPE_TYPES.SALAS_ASIGNABLES,
    label: "Salas Asignables",
    description: "Aplica a salas asignables",
    color: "text-cyan-700 bg-cyan-50 border-cyan-200",
  },
  {
    scope: SCOPE_TYPES.BODEGAS,
    label: "Bodegas",
    description: "Aplica a bodegas",
    color: "text-amber-800 bg-amber-50 border-amber-200",
  },
];
