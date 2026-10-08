const SCOPE_TYPES = {
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

const LEGACY_SCOPE_ALIASES = {
  vertical: SCOPE_TYPES.VERTICAL_EL,
  obra: SCOPE_TYPES.TORRE,
};

const VERTICAL_SCOPE_TYPES = [
  SCOPE_TYPES.VERTICAL_EL,
  SCOPE_TYPES.VERTICAL_TC,
  SCOPE_TYPES.VERTICAL_CD,
];

const SCOPE_TYPE_OPTIONS = [
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

const MEASUREMENT_UNITS = [
  { value: "und", label: "Unidad (und)" },
  { value: "m", label: "Metro (m)" },
  { value: "ml", label: "Metro lineal (ml)" },
  { value: "eje", label: "Eje" },
  { value: "depto", label: "Departamento (depto)" },
  { value: "punto", label: "Punto" },
];

const VALID_SCOPE_TYPES = [
  ...SCOPE_TYPE_OPTIONS.map((option) => option.value),
  "vertical",
  "obra",
];
const VALID_UNITS = MEASUREMENT_UNITS.map((unit) => unit.value);

function normalizeScopeTypeValue(scopeType) {
  const normalized = String(scopeType || SCOPE_TYPES.PISO).trim().toLowerCase();
  return LEGACY_SCOPE_ALIASES[normalized] || normalized;
}

function isVerticalScope(scopeType) {
  return VERTICAL_SCOPE_TYPES.includes(normalizeScopeTypeValue(scopeType));
}

function getUnitLabel(unit) {
  const match = MEASUREMENT_UNITS.find((entry) => entry.value === unit);
  return match ? match.label : unit || "und";
}

function getScopeTypeLabel(scopeType) {
  const normalized = normalizeScopeTypeValue(scopeType);
  const match = SCOPE_TYPE_OPTIONS.find((entry) => entry.value === normalized);
  return match ? match.label : scopeType || "Por Piso";
}

function buildVerticalFloorLabel(floorFrom, floorTo) {
  const primary = String(floorFrom || "").trim();
  const secondary = String(floorTo || "").trim();

  if (!primary && !secondary) return "";
  if (primary && secondary && primary !== secondary) {
    return `${primary} → ${secondary}`;
  }
  return primary || secondary || "";
}

function getVerticalScopeDisplayLabel(item) {
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

module.exports = {
  SCOPE_TYPES,
  VERTICAL_SCOPE_TYPES,
  LEGACY_SCOPE_ALIASES,
  SCOPE_TYPE_OPTIONS,
  MEASUREMENT_UNITS,
  VALID_SCOPE_TYPES,
  VALID_UNITS,
  normalizeScopeTypeValue,
  isVerticalScope,
  getUnitLabel,
  getScopeTypeLabel,
  buildVerticalFloorLabel,
  getVerticalScopeDisplayLabel,
};
