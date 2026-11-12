/**
 * Restricciones típicas predefinidas para montaje eléctrico y obras de edificación.
 * Organizadas por categorías para agilizar el llenado en terreno y asegurar respaldo contractual.
 */

export const PREDEFINED_RESTRICTION_CATEGORIES = [
  {
    category: "Obras Civiles / Frentes",
    color: "amber",
    items: [
      "Falta de frente civil / losa no entregada",
      "Falta de tabiques o muros sin cerrar",
      "Sector bloqueado / apuntalado por hormigón",
      "Falta de descimbre o andamios",
    ],
  },
  {
    category: "Interferencias",
    color: "purple",
    items: [
      "Interferencia con clima / ventilación",
      "Interferencia con red húmeda / sanitarias",
      "Interferencia con estructura / cielo falso",
    ],
  },
  {
    category: "Materiales y Equipos",
    color: "blue",
    items: [
      "Falta de materiales / quiebre de stock proveedor",
      "Material en tránsito / no entregado en faena",
      "Falla o falta de equipo de izaje / elevación",
    ],
  },
  {
    category: "Ingeniería y RDI",
    color: "indigo",
    items: [
      "Planos no aprobados / pendiente resolución RDI",
      "Modificación de arquitectura pendiente de ITO",
      "Falta de definición de trazado eléctrico",
    ],
  },
  {
    category: "Servicios y Clima",
    color: "rose",
    items: [
      "Sin energía eléctrica de faena o corte de agua",
      "Clima adverso / lluvia o humedad no permitida",
      "Acceso restringido por seguridad o maniobras críticas",
    ],
  },
];

// Lista aplanada de las causas más frecuentes para botones rápidos
export const QUICK_RESTRICTIONS = [
  "Falta de frente civil / losa no entregada",
  "Interferencia de otra especialidad / sector bloqueado",
  "Sin energía eléctrica de faena o corte de agua",
  "Planos no aprobados / pendiente resolución RDI",
  "Falta de materiales o quiebre de stock proveedor",
  "Clima adverso / lluvia o humedad no permitida",
];
