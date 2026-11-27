import ExcelJS from "exceljs";
import FileSaver from "file-saver";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const saveAs = FileSaver.saveAs || FileSaver;

const TOWER_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
  "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T",
  "U", "V", "W", "X", "Y", "Z"
];

function safeParseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function downloadMasterPlanTemplate({
  projectName = "",
  projects = [],
  activities = [],
  workers = [],
  existingItems = [],
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ObraControl Pro";
  workbook.created = new Date();

  // Find project config
  const projectObj = projects.find((p) => p.name === projectName) || projects[0] || null;
  const currentProjectName = projectName || projectObj?.name || "Obra General";

  // Discover towers for this project
  const towerSet = new Set();
  if (projectObj) {
    const parsedDeps = safeParseJson(projectObj.departments, {});
    if (Array.isArray(parsedDeps.__towers_config__) && parsedDeps.__towers_config__.length > 0) {
      parsedDeps.__towers_config__.forEach((t) => {
        if (t?.name) towerSet.add(t.name);
      });
    }

    const count = Number.isInteger(Number(projectObj.tower_count))
      ? Number(projectObj.tower_count)
      : 0;
    if (count > 0) {
      TOWER_LETTERS.slice(0, Math.min(count, TOWER_LETTERS.length)).forEach((l) => {
        towerSet.add(`Torre ${l}`);
      });
    }
  }

  // Also pull towers from existing items
  if (Array.isArray(existingItems) && existingItems.length > 0) {
    existingItems
      .filter((i) => !projectName || i.project === projectName)
      .forEach((i) => {
        if (i.tower) towerSet.add(i.tower);
      });
  }

  // Fallback towers if none configured
  if (towerSet.size === 0) {
    ["Torre A", "Torre B", "Torre C", "Torre D", "Torre E", "Torre F", "Torre G", "Torre H"].forEach((t) =>
      towerSet.add(t)
    );
  }

  const towersList = Array.from(towerSet).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );

  // Filter activities
  const activitiesList = Array.from(
    new Set(
      activities
        .map((a) => (typeof a === "string" ? a : a.name))
        .filter(Boolean)
    )
  ).sort();

  if (activitiesList.length === 0) {
    activitiesList.push(
      "EL Conexión de caja barra de TP y TS",
      "EL Armado de caja barra de TP y TS",
      "EL Canalización de EMT enchufe",
      "EL Alambrado de circuitos",
      "EL Montaje de tableros generales",
      "Tabiquería Volcanita",
      "Enfierradura de Muros",
      "Hormigonado de Losa"
    );
  }

  // Filter workers for this project
  const workersList = workers
    .filter((w) => !projectName || !w.project || w.project === projectName)
    .map((w) => {
      const name = w.name?.trim() || "";
      const role = w.role?.trim() || "";
      return role ? `${name} (${role})` : name;
    })
    .filter(Boolean);

  if (workersList.length === 0) {
    workersList.push(
      "Juan Pérez (M. Electricista)",
      "Carlos Soto (Ayudante)",
      "Pedro Gómez (Carpintero)",
      "Diego Morales (Jornal)"
    );
  }

  // Common crews
  const crewList = [
    "Conexión",
    "Armadores",
    "Eléctricos",
    "Carpinteros",
    "Enfierradores",
    "Hormigoneros",
    "Pintores",
    "Terminaciones",
    "Cuadrilla General",
  ];

  // ----------------------------------------------------
  // HOJA 2: CATÁLOGOS (Oculta o protegida para listas desplegables)
  // ----------------------------------------------------
  const catSheet = workbook.addWorksheet("Catálogos", {
    state: "visible", // Can be set to 'hidden' if preferred
  });

  catSheet.columns = [
    { header: "Torres", key: "towers", width: 18 },
    { header: "Actividades", key: "activities", width: 45 },
    { header: "Personal de la Obra", key: "workers", width: 35 },
    { header: "Cuadrillas", key: "crews", width: 22 },
  ];

  // Style header of Catálogos
  catSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  catSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF334155" },
  };

  const maxRows = Math.max(
    towersList.length,
    activitiesList.length,
    workersList.length,
    crewList.length
  );

  for (let i = 0; i < maxRows; i++) {
    catSheet.addRow({
      towers: towersList[i] || "",
      activities: activitiesList[i] || "",
      workers: workersList[i] || "",
      crews: crewList[i] || "",
    });
  }

  const towersRange = `Catálogos!$A$2:$A$${towersList.length + 1}`;
  const activitiesRange = `Catálogos!$B$2:$B$${activitiesList.length + 1}`;
  const workersRange = `Catálogos!$C$2:$C$${workersList.length + 1}`;
  const crewsRange = `Catálogos!$D$2:$D$${crewList.length + 1}`;

  // ----------------------------------------------------
  // HOJA 1: PLAN MAESTRO (Principal)
  // ----------------------------------------------------
  const mainSheet = workbook.addWorksheet("📋 Plan Maestro", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 6 }],
  });

  // Anchos de columna
  mainSheet.columns = [
    { key: "itemNum", width: 6 }, // A: #
    { key: "tower", width: 16 }, // B: Torre
    { key: "floor", width: 26 }, // C: Piso / Ubicación
    { key: "activity", width: 42 }, // D: Actividad
    { key: "startDate", width: 16 }, // E: F. Inicio
    { key: "endDate", width: 16 }, // F: F. Término
    { key: "days", width: 10 }, // G: Días
    { key: "crew", width: 20 }, // H: Cuadrilla
    { key: "worker1", width: 32 }, // I: Trabajador 1
    { key: "worker2", width: 32 }, // J: Trabajador 2
    { key: "worker3", width: 32 }, // K: Trabajador 3
    { key: "worker4", width: 32 }, // L: Trabajador 4
    { key: "status", width: 16 }, // M: Validación
  ];

  // FILA 1: Banner Título
  mainSheet.mergeCells("A1:M1");
  const titleCell = mainSheet.getCell("A1");
  titleCell.value = `OBRACONTROL PRO • PLANIFICACIÓN MASIVA DE PARTIDAS | OBRA: ${currentProjectName.toUpperCase()}`;
  titleCell.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" }, // Dark slate navy
  };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  mainSheet.getRow(1).height = 30;

  // FILA 2: Instrucción rápida
  mainSheet.mergeCells("A2:M2");
  const subCell = mainSheet.getCell("A2");
  subCell.value =
    "💡 Instrucciones: Completa la actividad y fechas. Elige a tu personal en las columnas de Trabajadores y arrastra las celdas hacia abajo para multiplicar entre torres.";
  subCell.font = { name: "Segoe UI", size: 9.5, italic: true, color: { argb: "FF475569" } };
  subCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF1F5F9" },
  };
  subCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  mainSheet.getRow(2).height = 20;

  // FILAS 3-4: KPI Cards (Mini Dashboard)
  // Card 1: Total Partidas
  mainSheet.mergeCells("B3:C3");
  mainSheet.getCell("B3").value = "TOTAL FILAS REGISTRADAS";
  mainSheet.getCell("B3").font = { size: 8, bold: true, color: { argb: "FF64748B" } };
  mainSheet.getCell("B3").alignment = { horizontal: "center", vertical: "middle" };
  mainSheet.getCell("B3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  mainSheet.mergeCells("B4:C4");
  mainSheet.getCell("B4").value = { formula: 'COUNTA(B7:B200)' };
  mainSheet.getCell("B4").font = { size: 14, bold: true, color: { argb: "FF1E293B" } };
  mainSheet.getCell("B4").alignment = { horizontal: "center", vertical: "middle" };
  mainSheet.getCell("B4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

  // Card 2: Días Promedio
  mainSheet.mergeCells("E3:F3");
  mainSheet.getCell("E3").value = "DURACIÓN PROMEDIO";
  mainSheet.getCell("E3").font = { size: 8, bold: true, color: { argb: "FF64748B" } };
  mainSheet.getCell("E3").alignment = { horizontal: "center", vertical: "middle" };
  mainSheet.getCell("E3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  mainSheet.mergeCells("E4:F4");
  mainSheet.getCell("E4").value = { formula: 'IFERROR(ROUND(AVERAGE(G7:G200),1)&" días", "—")' };
  mainSheet.getCell("E4").font = { size: 14, bold: true, color: { argb: "FF2563EB" } };
  mainSheet.getCell("E4").alignment = { horizontal: "center", vertical: "middle" };
  mainSheet.getCell("E4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

  // Card 3: Estado de Validación
  mainSheet.mergeCells("I3:K3");
  mainSheet.getCell("I3").value = "VALIDACIÓN DE CARGA";
  mainSheet.getCell("I3").font = { size: 8, bold: true, color: { argb: "FF64748B" } };
  mainSheet.getCell("I3").alignment = { horizontal: "center", vertical: "middle" };
  mainSheet.getCell("I3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  mainSheet.mergeCells("I4:K4");
  mainSheet.getCell("I4").value = {
    formula:
      'IF(COUNTA(B7:B200)=0, "Sin datos", IF(COUNTIF(M7:M200, "⚠️ Incompleto")=0, "✅ Lista para importar", "⚠️ Hay filas incompletas"))',
  };
  mainSheet.getCell("I4").font = { size: 12, bold: true, color: { argb: "FF059669" } };
  mainSheet.getCell("I4").alignment = { horizontal: "center", vertical: "middle" };
  mainSheet.getCell("I4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

  mainSheet.getRow(3).height = 16;
  mainSheet.getRow(4).height = 24;
  mainSheet.getRow(5).height = 10; // Espaciador

  // FILA 6: Encabezados de Tabla
  const headers = [
    "#",
    "Torre ▾",
    "Piso / Ubicación",
    "Actividad ▾",
    "F. Inicio (AAAA-MM-DD)",
    "F. Término (AAAA-MM-DD)",
    "Días",
    "Cuadrilla ▾",
    "Trabajador 1 ▾",
    "Trabajador 2 ▾",
    "Trabajador 3 ▾",
    "Trabajador 4 ▾",
    "Estado",
  ];

  const headerRow = mainSheet.getRow(6);
  headerRow.values = headers;
  headerRow.height = 28;

  headerRow.eachCell((cell) => {
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF475569" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      right: { style: "thin", color: { argb: "FF334155" } },
    };
  });

  // FILAS DE EJEMPLO PRE-CARGADAS (Para que vean cómo arrastrar)
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = format(nextWeek, "yyyy-MM-dd");

  const sampleTowers = towersList.slice(0, 4);
  const sampleActivity = activitiesList[0] || "EL Conexión de caja barra de TP y TS";
  const sampleWorker1 = workersList[0] || "Juan Pérez (M. Electricista)";
  const sampleWorker2 = workersList[1] || "Pedro Soto (Ayudante)";
  const sampleCrew = "Conexión";

  // Generar filas de ejemplo (Torres A a D)
  sampleTowers.forEach((tower, idx) => {
    const rowNum = 7 + idx;
    const row = mainSheet.getRow(rowNum);

    row.values = [
      idx + 1,
      tower,
      "Salas Asignables (Piso 1)",
      sampleActivity,
      todayStr,
      nextWeekStr,
      { formula: `IF(AND(E${rowNum}<>"",F${rowNum}<>""), NETWORKDAYS(E${rowNum},F${rowNum}), "")` },
      sampleCrew,
      sampleWorker1,
      sampleWorker2,
      "",
      "",
      {
        formula: `IF(OR(B${rowNum}="",C${rowNum}="",D${rowNum}="",E${rowNum}="",F${rowNum}=""), "⚠️ Incompleto", "✅ Listo")`,
      },
    ];

    row.height = 22;
    styleDataRow(row, idx % 2 === 1);
  });

  // Generar 150 filas vacías con fórmulas y validaciones listas para arrastrar
  for (let r = 7 + sampleTowers.length; r <= 150; r++) {
    const row = mainSheet.getRow(r);
    row.values = [
      r - 6,
      "",
      "",
      "",
      "",
      "",
      { formula: `IF(AND(E${r}<>"",F${r}<>""), NETWORKDAYS(E${r},F${r}), "")` },
      "",
      "",
      "",
      "",
      "",
      {
        formula: `IF(AND(B${r}="",C${r}="",D${r}=""), "", IF(OR(B${r}="",C${r}="",D${r}="",E${r}="",F${r}=""), "⚠️ Incompleto", "✅ Listo"))`,
      },
    ];
    row.height = 20;
    styleDataRow(row, (r - 7) % 2 === 1);
  }

  // APLICAR DATA VALIDATION (Listas desplegables en celdas de la tabla)
  // Columna B: Torre (filas 7 a 150)
  for (let r = 7; r <= 150; r++) {
    mainSheet.getCell(`B${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [towersRange],
      showErrorMessage: true,
      errorTitle: "Torre no válida",
      error: "Por favor selecciona una torre de la lista desplegable.",
    };

    // Columna D: Actividad
    mainSheet.getCell(`D${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [activitiesRange],
      showErrorMessage: false, // permite escribir texto libre si es una actividad nueva
    };

    // Columna H: Cuadrilla
    mainSheet.getCell(`H${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [crewsRange],
      showErrorMessage: false,
    };

    // Columnas I, J, K, L: Trabajador 1 a 4
    ["I", "J", "K", "L"].forEach((col) => {
      mainSheet.getCell(`${col}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [workersRange],
        showErrorMessage: false,
      };
    });
  }

  // ----------------------------------------------------
  // HOJA 3: GUÍA RÁPIDA (Instrucciones)
  // ----------------------------------------------------
  const guideSheet = workbook.addWorksheet("📖 Guía Rápida");
  guideSheet.columns = [
    { width: 4 },
    { width: 28 },
    { width: 70 },
  ];

  guideSheet.mergeCells("B2:C2");
  guideSheet.getCell("B2").value = "GUÍA DE USO: CÓMO ARRASTRAR ACTIVIDADES Y PERSONAL EN EXCEL";
  guideSheet.getCell("B2").font = { size: 13, bold: true, color: { argb: "FF1E293B" } };
  guideSheet.getCell("B2").alignment = { vertical: "middle" };

  const tips = [
    {
      title: "1. Completa la primera fila",
      desc: "Elige la Torre A, escribe el piso o sector, selecciona la Actividad y las fechas de inicio y término.",
    },
    {
      title: "2. Asigna a tu personal",
      desc: "En las columnas Trabajador 1, 2, 3... haz clic en la flecha y elige a los trabajadores de la nómina.",
    },
    {
      title: "3. El truco para las 8 torres (Arrastrar)",
      desc: "Selecciona las celdas de la primera fila. Toma el cuadrito verde pequeño en la esquina inferior derecha y arrástralo hacia abajo tantas filas como torres tengas. Luego solo cambia la Torre en cada fila.",
    },
    {
      title: "4. No necesitas poner porcentajes",
      desc: "La aplicación asume automáticamente que todas las partidas son medidas en % (de 0% a 100%). No te preocupes por unidades.",
    },
    {
      title: "5. Guarda y sube al Plan Maestro",
      desc: 'Guarda el archivo en tu equipo. Vuelve a ObraControl Pro y presiona el botón "Importar Excel". ¡Listo en 2 segundos!',
    },
  ];

  tips.forEach((t, i) => {
    const rowIdx = 4 + i * 2;
    guideSheet.getCell(`B${rowIdx}`).value = t.title;
    guideSheet.getCell(`B${rowIdx}`).font = { size: 10.5, bold: true, color: { argb: "FF2563EB" } };
    guideSheet.getCell(`C${rowIdx}`).value = t.desc;
    guideSheet.getCell(`C${rowIdx}`).font = { size: 10, color: { argb: "FF334155" } };
  });

  // Descargar archivo
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const cleanProjectSlug = currentProjectName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const fileName = `plantilla_plan_maestro_${cleanProjectSlug}_${format(new Date(), "yyyyMMdd")}.xlsx`;
  saveAs(blob, fileName);
}

function styleDataRow(row, isAlt = false) {
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { name: "Segoe UI", size: 9.5 };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };

    if (isAlt) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" },
      };
    }

    // Alineaciones específicas
    if (colNumber === 1 || colNumber === 7) {
      cell.alignment = { horizontal: "center", vertical: "middle" };
    } else if (colNumber === 5 || colNumber === 6) {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.numFmt = "yyyy-mm-dd";
    } else if (colNumber === 13) {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { name: "Segoe UI", size: 9.5, bold: true };
    } else {
      cell.alignment = { vertical: "middle" };
    }
  });
}
