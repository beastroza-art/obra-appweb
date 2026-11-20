import { getScopeDisplayLabel } from "@/constants/activityScope";

export const RESTRICTION_CATEGORIES = [
  {
    id: "civiles",
    name: "Obras Civiles / Frentes",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-300",
    icon: "🏗️",
    keywords: ["frente", "civil", "losa", "tabique", "muro", "descimbre", "andamio", "hormigón", "hormigon", "apuntalado", "enfierradura"],
  },
  {
    id: "interferencias",
    name: "Interferencias",
    badgeClass: "bg-purple-100 text-purple-800 border-purple-300",
    icon: "⚡",
    keywords: ["interferencia", "clima", "ventilación", "ventilacion", "sanitaria", "red húmeda", "red humeda", "cielo falso", "estructura", "ducto", "trazado"],
  },
  {
    id: "materiales",
    name: "Materiales y Equipos",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-300",
    icon: "📦",
    keywords: ["material", "stock", "proveedor", "tránsito", "transito", "izaje", "elevación", "elevacion", "entrega", "insumo", "compra", "bodega", "cable"],
  },
  {
    id: "ingenieria",
    name: "Ingeniería y RDI",
    badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-300",
    icon: "📐",
    keywords: ["plano", "rdi", "ito", "modificación", "modificacion", "arquitectura", "ingeniería", "ingenieria", "especificación", "definición", "calculista"],
  },
  {
    id: "servicios",
    name: "Servicios y Clima",
    badgeClass: "bg-rose-100 text-rose-800 border-rose-300",
    icon: "🌧️",
    keywords: ["energía", "energia", "eléctrica", "electrica", "agua", "corte", "clima", "lluvia", "viento", "humedad", "seguridad", "acceso", "maniobra", "faena"],
  },
];

export function detectRestrictionCategory(text) {
  if (!text || typeof text !== "string") {
    return {
      id: "general",
      name: "General",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
      icon: "📌",
    };
  }

  const lower = text.toLowerCase();

  for (const cat of RESTRICTION_CATEGORIES) {
    if (cat.keywords.some((k) => lower.includes(k))) {
      return cat;
    }
  }

  return {
    id: "general",
    name: "General",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    icon: "📌",
  };
}

export function formatRestrictionLocation(restriction, masterItems = []) {
  if (!restriction) return "—";

  // If it's a master item
  if (restriction.type === "item_maestro") {
    const item = masterItems.find((i) => String(i.id) === String(restriction.id)) || restriction.rawItem;
    if (!item) return restriction.location || "—";

    const towerPrefix = item.tower ? `${item.tower} · ` : "";

    // If it's a child item from multi-floor
    if (item.parent_id) {
      const parent = masterItems.find((p) => String(p.id) === String(item.parent_id));
      const parentScope = parent ? getScopeDisplayLabel(parent, true) : "";
      return `${towerPrefix}${item.floor || "Piso"}${parentScope ? ` (de ${parentScope})` : ""}`;
    }

    const scopeLabel = getScopeDisplayLabel(item, true);
    return `${towerPrefix}${scopeLabel}`;
  }

  // If it's a daily log
  if (restriction.type === "reporte_diario") {
    if (restriction.relatedId) {
      const item = masterItems.find((i) => String(i.id) === String(restriction.relatedId));
      if (item) {
        const towerPrefix = item.tower ? `${item.tower} · ` : "";
        if (item.parent_id) {
          const parent = masterItems.find((p) => String(p.id) === String(item.parent_id));
          const parentScope = parent ? getScopeDisplayLabel(parent, true) : "";
          return `${towerPrefix}${item.floor || restriction.floor || "Piso"}${parentScope ? ` (de ${parentScope})` : ""}`;
        }
        const scopeLabel = getScopeDisplayLabel(item, true);
        return `${towerPrefix}${scopeLabel}`;
      }
    }

    const towerPrefix = restriction.tower ? `${restriction.tower} · ` : "";
    return `${towerPrefix}${restriction.floor || "General"}`;
  }

  return restriction.location || "—";
}

export function formatRestrictionDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(dateStr);
  }
}
