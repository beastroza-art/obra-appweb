import ExcelJS from 'exceljs';
import FileSaver from 'file-saver';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { api } from '@/lib/api';
import { getScopeTypeLabel } from '@/constants/activityScope';

const LOGO_URL = 'https://media.base44.com/images/public/69c135c57c9886fec79cebc5/6324de60d_logoclientes-8.png';
const saveAs = FileSaver.saveAs || FileSaver;

const COLORS = {
  primary: 'FF142952',
  primarySoft: 'FFEAF0F8',
  accent: 'FFF59E0B',
  headerText: 'FFFFFFFF',
  text: 'FF0F172A',
  mutedText: 'FF64748B',
  border: 'FFCBD5E1',
  zebra: 'FFF8FAFC',
  worker: 'FFF1F5F9',
  warningBg: 'FFFEF3C7',
  warningText: 'FF92400E',
  infoBg: 'FFDBEAFE',
  infoText: 'FF1D4ED8',
  dangerBg: 'FFFEE2E2',
  dangerText: 'FFB91C1C',
  successBg: 'FFD1FAE5',
  successText: 'FF047857',
};

const thinBorder = {
  top: { style: 'thin', color: { argb: COLORS.border } },
  left: { style: 'thin', color: { argb: COLORS.border } },
  bottom: { style: 'thin', color: { argb: COLORS.border } },
  right: { style: 'thin', color: { argb: COLORS.border } },
};

const mediumTopBorder = {
  ...thinBorder,
  top: { style: 'medium', color: { argb: COLORS.primary } },
};

const statusLabels = {
  pendiente: 'Pendiente',
  en_ejecucion: 'En ejecución',
  no_liberado: 'No liberado',
  liberado: 'Liberado',
  bloqueado: 'Bloqueado',
  'piso bloqueado': 'Piso Bloqueado',
  completado: 'Finalizado',
  finalizado: 'Finalizado',
  terminado: 'Terminado',
  parcial: 'Parcial',
};

const statusStyles = {
  Pendiente: { fill: COLORS.warningBg, font: COLORS.warningText },
  'En ejecución': { fill: COLORS.infoBg, font: COLORS.infoText },
  'No liberado': { fill: COLORS.warningBg, font: COLORS.warningText },
  Liberado: { fill: COLORS.successBg, font: COLORS.successText },
  Bloqueado: { fill: COLORS.dangerBg, font: COLORS.dangerText },
  'Piso Bloqueado': { fill: COLORS.dangerBg, font: COLORS.dangerText },
  Finalizado: { fill: COLORS.successBg, font: COLORS.successText },
  Terminado: { fill: COLORS.successBg, font: COLORS.successText },
  Parcial: { fill: COLORS.warningBg, font: COLORS.warningText },
};

function solidFill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function normalizeStatus(value) {
  const key = String(value || 'pendiente').trim().toLowerCase();
  return statusLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeRelease(value) {
  if (!value) return '';
  return normalizeStatus(value);
}

function excelText(value) {
  return String(value || '').replace(/"/g, '""');
}

function visibleCountFormula(column, startRow, endRow) {
  if (endRow < startRow) return '0';
  return `SUBTOTAL(103,${column}${startRow}:${column}${endRow})`;
}

function visibleSumFormula(column, startRow, endRow) {
  if (endRow < startRow) return '0';
  return `SUBTOTAL(109,${column}${startRow}:${column}${endRow})`;
}

function visibleAverageFormula(column, startRow, endRow) {
  if (endRow < startRow) return '0';
  return `IFERROR(SUBTOTAL(101,${column}${startRow}:${column}${endRow}),0)`;
}

function visibleCountIfFormula(anchorColumn, criteriaColumn, startRow, endRow, criteria) {
  if (endRow < startRow) return '0';

  return `SUMPRODUCT(SUBTOTAL(103,OFFSET(${anchorColumn}${startRow},ROW(${anchorColumn}${startRow}:${anchorColumn}${endRow})-ROW(${anchorColumn}${startRow}),0,1)),--(${criteriaColumn}${startRow}:${criteriaColumn}${endRow}="${excelText(criteria)}"))`;
}

function visibleCountStartsWithFormula(anchorColumn, criteriaColumn, startRow, endRow, prefix) {
  if (endRow < startRow) return '0';

  return `SUMPRODUCT(SUBTOTAL(103,OFFSET(${anchorColumn}${startRow},ROW(${anchorColumn}${startRow}:${anchorColumn}${endRow})-ROW(${anchorColumn}${startRow}),0,1)),--(LEFT(${criteriaColumn}${startRow}:${criteriaColumn}${endRow},${prefix.length})="${excelText(prefix)}"))`;
}

function sanitizeExcelText(value) {
  return String(value ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .slice(0, 32767);
}

function sanitizeExcelValue(value) {
  if (typeof value === 'string') return sanitizeExcelText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (Array.isArray(value)) return value.map(sanitizeExcelValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeExcelValue(item)])
    );
  }
  return value ?? '';
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }

  return btoa(binary);
}



function sanitizeRowValues(values) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, sanitizeExcelValue(value)])
  );
}

function parseWorkers(rawWorkers) {
  if (Array.isArray(rawWorkers)) return rawWorkers;
  if (typeof rawWorkers === 'string' && rawWorkers.trim()) {
    try {
      const parsed = JSON.parse(rawWorkers);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
}

function getMasterContext(masterItems, log) {
  const masterItem = masterItems.find((item) => String(item.id) === String(log.master_item_id));

  return {
    project: log.project || masterItem?.project || '',
    tower: log.tower || masterItem?.tower || '',
    scopeType: getScopeTypeLabel(log.scope_type || masterItem?.scope_type),
    floor: log.floor || masterItem?.floor || '',
    activity: log.activity || masterItem?.activity || '',
  };
}

function normalizeFloorForExport(value) {
  const floors = (Array.isArray(value) ? value : String(value || '').split(/[,;/|]+/))
    .map((floor) => String(floor).trim())
    .filter(Boolean);

  return floors.length <= 1 ? floors[0] || '' : floors.join(', ');
}

function getExportFloors(value) {
  const floors = (Array.isArray(value) ? value : String(value || '').split(/[,;/|]+/))
    .map((floor) => String(floor).trim())
    .filter(Boolean);

  return floors.length ? floors : [''];
}

function getExportScopeFields(item) {
  return {
    scopeType: getScopeTypeLabel(item?.scope_type),
    departments: String(item?.departments || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .join(', '),
    floorRange: normalizeFloorForExport(item?.floor),
  };
}

function capRowHeight(row, maxHeight = 58) {
  const maxLines = Math.max(
    1,
    ...row.values.map((value) => String(value || '').split('\n').length)
  );
  row.height = Math.min(maxHeight, Math.max(22, maxLines * 15));
}

function styleHeader(row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = solidFill(COLORS.primary);
    cell.font = { color: { argb: COLORS.headerText }, bold: true, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  });
  row.height = 30;
}

function styleTitle(sheet, title, subtitle, lastColumn, imageId) {
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);

  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value = title;
  titleRow.getCell(1).font = { size: 16, bold: true, color: { argb: COLORS.primary } };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  titleRow.height = 26;

  const subtitleRow = sheet.getRow(2);
  subtitleRow.getCell(1).value = subtitle;
  subtitleRow.getCell(1).font = { size: 10, color: { argb: COLORS.mutedText } };
  subtitleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  subtitleRow.height = 22;

  if (imageId) {
    sheet.addImage(imageId, {
      tl: { col: Math.max(0, sheet.columnCount - 2.2), row: 0.15 },
      ext: { width: 120, height: 34 },
    });
  }
}

function styleDataRows(sheet, startRow, endRow, leftAlignedColumns = []) {
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const isEven = (rowNumber - startRow) % 2 === 1;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = thinBorder;
      cell.font = { color: { argb: COLORS.text }, size: 10 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: leftAlignedColumns.includes(colNumber) ? 'left' : 'center',
        wrapText: true,
      };

      if (isEven) {
        cell.fill = solidFill(COLORS.zebra);
      }
    });

    capRowHeight(row);
  }
}

function applyStatusStyle(cell) {
  const label = normalizeStatus(cell.value);
  const style = statusStyles[label] || statusStyles.Pendiente;

  cell.value = label;
  cell.fill = solidFill(style.fill);
  cell.font = { color: { argb: style.font }, bold: true, size: 10 };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
}

function applyReleaseStyle(cell) {
  const label = normalizeRelease(cell.value);
  if (!label) return;

  const style = statusStyles[label] || statusStyles.Pendiente;
  cell.value = label;
  cell.fill = solidFill(style.fill);
  cell.font = { color: { argb: style.font }, bold: true, size: 10 };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
}

function applyAutoFit(sheet, limits) {
  sheet.columns.forEach((column, index) => {
    const columnNumber = index + 1;
    const limit = limits[columnNumber] || { min: 10, max: 28 };
    let maxLength = limit.min;

    column.eachCell({ includeEmpty: true }, (cell) => {
      const text = String(cell.value?.richText ? cell.value.richText.map((part) => part.text).join('') : cell.value || '');
      const longestLine = Math.max(...text.split('\n').map((line) => line.length));
      maxLength = Math.max(maxLength, longestLine + 2);
    });

    column.width = Math.min(limit.max, Math.max(limit.min, maxLength));
  });
}

function addKpiBlock(sheet, kpis) {
  const labelRow = sheet.getRow(4);
  const valueRow = sheet.getRow(5);
  labelRow.height = 18;
  valueRow.height = 24;

  kpis.forEach((kpi, index) => {
    const startColumn = 1 + index * 2;
    const endColumn = startColumn + 1;
    sheet.mergeCells(4, startColumn, 4, endColumn);
    sheet.mergeCells(5, startColumn, 5, endColumn);

    const labelCell = labelRow.getCell(startColumn);
    const valueCell = valueRow.getCell(startColumn);

    labelCell.value = kpi.label;
    labelCell.fill = solidFill(kpi.fill || 'FFFFFFFF');
    labelCell.border = { ...thinBorder, bottom: { style: 'hair', color: { argb: COLORS.border } } };
    labelCell.font = { size: 8, color: { argb: COLORS.mutedText } };
    labelCell.alignment = { vertical: 'bottom', horizontal: 'center', wrapText: true };

    valueCell.value = kpi.formula
      ? { formula: kpi.formula, result: kpi.result ?? 0 }
      : kpi.value;
    valueCell.numFmt = kpi.numFmt || '0';
    valueCell.fill = solidFill(kpi.fill || 'FFFFFFFF');
    valueCell.border = { ...thinBorder, top: { style: 'hair', color: { argb: COLORS.border } } };
    valueCell.font = { size: 14, bold: true, color: { argb: kpi.color || COLORS.primary } };
    valueCell.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
  });
}

async function loadLogoImageId(workbook) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        const base64 = canvas.toDataURL('image/png').split(',')[1];
        resolve(workbook.addImage({ base64, extension: 'png' }));
      } catch (error) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = LOGO_URL;
  });
}

function addProgressBars(sheet, startRow, endRow, columnLetter) {
  if (endRow < startRow) return;

  sheet.addConditionalFormatting({
    ref: `${columnLetter}${startRow}:${columnLetter}${endRow}`,
    rules: [
      {
        type: 'dataBar',
        priority: 1,
        cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 100 }],
        color: { argb: COLORS.infoText },
        showValue: true,
      },
    ],
  });
}

function addMasterSheet(workbook, masterItems, logoImageId, exportedAt) {
  const sheet = workbook.addWorksheet('Plan Maestro', {
    properties: { defaultRowHeight: 24, outlineLevelRow: 1 },
    views: [{ state: 'frozen', ySplit: 6, xSplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.columns = [
    { key: 'project', width: 24 },
    { key: 'tower', width: 12 },
    { key: 'scopeType', width: 16 },
    { key: 'departments', width: 18 },
    { key: 'floor', width: 14 },
    { key: 'activity', width: 30 },
    { key: 'crew', width: 20 },
    { key: 'planned', width: 12 },
    { key: 'executed', width: 12 },
    { key: 'progress', width: 12 },
    { key: 'status', width: 16 },
    { key: 'release', width: 16 },
    { key: 'restrictions', width: 28 },
    { key: 'observations', width: 32 },
  ];

  const headerRowNumber = 6;

  styleTitle(
    sheet,
    'Informe de Control de Obras DGC',
    `Exportado: ${exportedAt} | Plan maestro consolidado`,
    'O',
    logoImageId
  );

  sheet.getRow(headerRowNumber).values = [
    'Proyecto',
    'Torre',
    'Tipo alcance',
    'Departamentos',
    'Piso',
    'Actividad',
    'Cuadrilla',
    'Planificado',
    'Ejecutado',
    '% Avance',
    'Estado',
    'Liberacion',
    'Restricciones',
    'Observaciones',
  ];
  styleHeader(sheet.getRow(headerRowNumber));

  const exportRows = masterItems.flatMap((item) =>
    getExportFloors(item.floor).map((floor) => ({ item, floor }))
  );

  exportRows.forEach(({ item, floor }) => {
    const planned = Number(item.planned_qty) || 0;
    const executed = Number(item.executed_qty) || 0;
    const pct = planned > 0 ? Number(((executed / planned) * 100).toFixed(1)) : 0;
    const scopeFields = getExportScopeFields(item);
    const row = sheet.addRow(sanitizeRowValues({
      project: item.project || '',
      tower: item.tower || '',
      scopeType: scopeFields.scopeType,
      departments: scopeFields.departments,
      floor,
      activity: item.activity || '',
      crew: item.crew_name || '',
      planned,
      executed,
      progress: pct,
      status: normalizeStatus(item.status),
      release: normalizeRelease(item.release_status),
      restrictions: item.restrictions || '',
      observations: item.observations || '',
    }));

    row.getCell('planned').numFmt = '0.##';
    row.getCell('executed').numFmt = '0.##';
    row.getCell('progress').numFmt = '0.0';
    row.getCell('restrictions').alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    row.getCell('observations').alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    applyStatusStyle(row.getCell('status'));
    applyReleaseStyle(row.getCell('release'));
  });

  const lastRow = sheet.lastRow.number;
  styleDataRows(sheet, headerRowNumber + 1, lastRow, [1, 3, 4, 5, 6, 13, 14]);

  for (let rowNumber = headerRowNumber + 1; rowNumber <= lastRow; rowNumber += 1) {
    applyStatusStyle(sheet.getRow(rowNumber).getCell('status'));
    applyReleaseStyle(sheet.getRow(rowNumber).getCell('release'));
  }

  sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: 14 } };
  addKpiBlock(sheet, [
    {
      label: 'Total actividades',
      formula: visibleCountFormula('A', headerRowNumber + 1, lastRow),
      result: exportRows.length,
      color: COLORS.primary,
    },
    {
      label: 'Pendientes',
      formula: visibleCountIfFormula('A', 'K', headerRowNumber + 1, lastRow, 'Pendiente'),
      result: exportRows.filter(({ item }) => normalizeStatus(item.status) === 'Pendiente').length,
      color: COLORS.warningText,
      fill: COLORS.warningBg,
    },
    {
      label: 'En ejecucion',
      formula: visibleCountIfFormula('A', 'K', headerRowNumber + 1, lastRow, normalizeStatus('en_ejecucion')),
      result: exportRows.filter(({ item }) => normalizeStatus(item.status) === normalizeStatus('en_ejecucion')).length,
      color: COLORS.infoText,
      fill: COLORS.infoBg,
    },
    {
      label: 'Avance promedio',
      formula: visibleAverageFormula('J', headerRowNumber + 1, lastRow),
      result: exportRows.length
        ? exportRows.reduce((sum, { item }) => {
          const planned = Number(item.planned_qty) || 0;
          const executed = Number(item.executed_qty) || 0;
          return sum + (planned > 0 ? (executed / planned) * 100 : 0);
        }, 0) / exportRows.length
        : 0,
      numFmt: '0.0',
      color: COLORS.successText,
      fill: COLORS.successBg,
    },
    {
      label: 'Bloqueadas',
      formula: visibleCountIfFormula('A', 'K', headerRowNumber + 1, lastRow, 'Bloqueado'),
      result: exportRows.filter(({ item }) => normalizeStatus(item.status) === 'Bloqueado').length,
      color: COLORS.dangerText,
      fill: COLORS.dangerBg,
    },
  ]);
  addProgressBars(sheet, headerRowNumber + 1, lastRow, 'J');
  applyAutoFit(sheet, {
    1: { min: 16, max: 26 },
    2: { min: 10, max: 14 },
    3: { min: 14, max: 22 },
    4: { min: 10, max: 18 },
    5: { min: 20, max: 34 },
    6: { min: 16, max: 24 },
    7: { min: 11, max: 14 },
    8: { min: 11, max: 14 },
    9: { min: 11, max: 13 },
    10: { min: 13, max: 17 },
    11: { min: 13, max: 17 },
    12: { min: 18, max: 34 },
    13: { min: 20, max: 36 },
    14: { min: 14, max: 22 },
  });

  sheet.properties.tabColor = { argb: COLORS.primary };
}
function styleReportRow(row, hasError = false) {
  row.height = 24;

  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = hasError ? { ...thinBorder, bottom: { style: 'thin', color: { argb: COLORS.dangerText } } } : thinBorder;
    cell.font = { color: { argb: hasError ? COLORS.dangerText : COLORS.text }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  row.getCell('activity').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  row.getCell('observations').alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
}

function styleWorkerRow(row) {
  row.height = 23;

  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = thinBorder;
    cell.font = { color: { argb: COLORS.text }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  row.getCell('worker').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  row.getCell('role').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
}

function getDailyLogRows(masterItems, dailyLogs) {
  return dailyLogs.map((log) => {
    const { project, tower, scopeType, floor, activity } = getMasterContext(masterItems, log);
    const workers = parseWorkers(log.crew_workers);
    const crewTotal = Number(log.executed_today) || 0;
    const workerExecutedTotal = workers.reduce((sum, worker) => sum + (Number(worker.executed) || 0), 0);
    const workerHoursTotal = workers.reduce((sum, worker) => sum + (Number(worker.hours) || 0), 0);
    const hasWorkerDetail = workers.length > 0;
    const hasMismatch = hasWorkerDetail && Math.abs(workerExecutedTotal - crewTotal) > 0.001;

    return {
      log,
      workers,
      project,
      tower,
      scopeType,
      floor: normalizeFloorForExport(floor),
      activity,
      crewTotal,
      workerExecutedTotal,
      workerHoursTotal,
      hasWorkerDetail,
      hasMismatch,
      validationMessage: hasMismatch
        ? `Diferencia: cuadrilla ${crewTotal} vs trabajadores ${workerExecutedTotal}`
        : hasWorkerDetail ? 'OK' : 'Sin detalle',
    };
  });
}

function addDailyLogSheet(workbook, masterItems, dailyLogs, logoImageId, exportedAt) {
  const sheet = workbook.addWorksheet('Reporte Diario', {
    properties: { defaultRowHeight: 24 },
    views: [{ state: 'frozen', ySplit: 6, xSplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.columns = [
    { key: 'date', width: 13 },
    { key: 'project', width: 22 },
    { key: 'tower', width: 11 },
    { key: 'scopeType', width: 14 },
    { key: 'floor', width: 11 },
    { key: 'activity', width: 30 },
    { key: 'supervisor', width: 20 },
    { key: 'crewName', width: 20 },
    { key: 'crewTotal', width: 12 },
    { key: 'hours', width: 10 },
    { key: 'hasRestriction', width: 13 },
    { key: 'observations', width: 32 },
    { key: 'validation', width: 22 },
  ];

  const headerRowNumber = 6;
  const rows = getDailyLogRows(masterItems, dailyLogs);

  styleTitle(
    sheet,
    'Informe de Reporte Diario',
    `Exportado: ${exportedAt} | Reportes por jornada`,
    'M',
    logoImageId
  );

  sheet.getRow(headerRowNumber).values = [
    'Fecha',
    'Proyecto',
    'Torre',
    'Alcance',
    'Piso',
    'Actividad',
    'Supervisor',
    'Cuadrilla',
    'Ejecutado hoy',
    'Horas',
    'Restriccion',
    'Observacion',
    'Validacion',
  ];
  styleHeader(sheet.getRow(headerRowNumber));

  rows.forEach((entry) => {
    const { log } = entry;
    const reportRow = sheet.addRow(sanitizeRowValues({
      date: log.date || '',
      project: entry.project,
      tower: entry.tower,
      scopeType: entry.scopeType,
      floor: entry.floor,
      activity: entry.activity,
      supervisor: log.supervisor || '',
      crewName: log.crew_name || '',
      crewTotal: entry.crewTotal,
      hours: Number(log.hours_worked) || 0,
      hasRestriction: log.has_restriction ? 'Si' : 'No',
      observations: log.has_restriction
        ? [log.restriction_detail, log.observations].filter(Boolean).join('\n')
        : log.observations || '',
      validation: entry.validationMessage,
    }));

    reportRow.getCell('date').numFmt = 'dd/mm/yyyy';
    reportRow.getCell('crewTotal').numFmt = '0.##';
    reportRow.getCell('hours').numFmt = '0.##';
    styleReportRow(reportRow, entry.hasMismatch);

    if (log.has_restriction) {
      const restrictionCell = reportRow.getCell('hasRestriction');
      restrictionCell.fill = solidFill(COLORS.dangerBg);
      restrictionCell.font = { color: { argb: COLORS.dangerText }, bold: true, size: 10 };
    }

    if (entry.hasMismatch) {
      const validationCell = reportRow.getCell('validation');
      validationCell.fill = solidFill(COLORS.dangerBg);
      validationCell.font = { color: { argb: COLORS.dangerText }, bold: true, size: 10 };
    }
  });

  const lastRow = sheet.lastRow.number;
  sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: 13 } };
  addKpiBlock(sheet, [
    {
      label: 'Reportes',
      formula: visibleCountFormula('A', headerRowNumber + 1, lastRow),
      result: dailyLogs.length,
      color: COLORS.primary,
    },
    {
      label: 'Ejecutado',
      formula: visibleSumFormula('I', headerRowNumber + 1, lastRow),
      result: rows.reduce((sum, entry) => sum + entry.crewTotal, 0),
      numFmt: '0.##',
      color: COLORS.successText,
      fill: COLORS.successBg,
    },
    {
      label: 'Horas',
      formula: visibleSumFormula('J', headerRowNumber + 1, lastRow),
      result: dailyLogs.reduce((sum, log) => sum + (Number(log.hours_worked) || 0), 0),
      numFmt: '0.##',
      color: COLORS.infoText,
      fill: COLORS.infoBg,
    },
    {
      label: 'Con restriccion',
      formula: visibleCountIfFormula('A', 'K', headerRowNumber + 1, lastRow, 'Si'),
      result: dailyLogs.filter((log) => log.has_restriction).length,
      color: COLORS.dangerText,
      fill: COLORS.dangerBg,
    },
  ]);

  applyAutoFit(sheet, {
    1: { min: 11, max: 14 },
    2: { min: 16, max: 25 },
    3: { min: 9, max: 12 },
    4: { min: 12, max: 18 },
    5: { min: 9, max: 14 },
    6: { min: 20, max: 34 },
    7: { min: 16, max: 24 },
    8: { min: 15, max: 24 },
    9: { min: 11, max: 14 },
    10: { min: 9, max: 11 },
    11: { min: 12, max: 14 },
    12: { min: 20, max: 34 },
    13: { min: 14, max: 24 },
  });

  for (let rowNumber = headerRowNumber + 1; rowNumber <= lastRow; rowNumber += 1) {
    capRowHeight(sheet.getRow(rowNumber), 52);
  }

  sheet.properties.tabColor = { argb: COLORS.infoText };
}

function addWorkerDetailSheet(workbook, masterItems, dailyLogs, logoImageId, exportedAt) {
  const sheet = workbook.addWorksheet('Detalle Trabajadores', {
    properties: { defaultRowHeight: 24 },
    views: [{ state: 'frozen', ySplit: 6, xSplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.columns = [
    { key: 'date', width: 13 },
    { key: 'project', width: 22 },
    { key: 'tower', width: 11 },
    { key: 'scopeType', width: 14 },
    { key: 'floor', width: 11 },
    { key: 'activity', width: 30 },
    { key: 'crewName', width: 20 },
    { key: 'worker', width: 24 },
    { key: 'role', width: 18 },
    { key: 'workerExecuted', width: 13 },
    { key: 'workerHours', width: 12 },
    { key: 'validation', width: 22 },
  ];

  const headerRowNumber = 6;
  const rows = getDailyLogRows(masterItems, dailyLogs);
  let workerCount = 0;

  styleTitle(
    sheet,
    'Detalle Trabajadores',
    `Exportado: ${exportedAt} | Personal declarado en reportes diarios`,
    'L',
    logoImageId
  );

  sheet.getRow(headerRowNumber).values = [
    'Fecha',
    'Proyecto',
    'Torre',
    'Alcance',
    'Piso',
    'Actividad',
    'Cuadrilla',
    'Trabajador',
    'Cargo',
    'Ejec. trabajador',
    'Horas trabajador',
    'Validacion reporte',
  ];
  styleHeader(sheet.getRow(headerRowNumber));

  rows.forEach((entry) => {
    const { log } = entry;

    entry.workers.forEach((worker) => {
      workerCount += 1;
      const workerRow = sheet.addRow(sanitizeRowValues({
        date: log.date || '',
        project: entry.project,
        tower: entry.tower,
        scopeType: entry.scopeType,
        floor: entry.floor,
        activity: entry.activity,
        crewName: log.crew_name || '',
        worker: worker.name || '',
        role: worker.role || '',
        workerExecuted: Number(worker.executed) || 0,
        workerHours: Number(worker.hours) || 0,
        validation: entry.validationMessage,
      }));

      workerRow.getCell('date').numFmt = 'dd/mm/yyyy';
      workerRow.getCell('workerExecuted').numFmt = '0.##';
      workerRow.getCell('workerHours').numFmt = '0.##';
      styleWorkerRow(workerRow);

      if (entry.hasMismatch) {
        const validationCell = workerRow.getCell('validation');
        validationCell.fill = solidFill(COLORS.dangerBg);
        validationCell.font = { color: { argb: COLORS.dangerText }, bold: true, size: 10 };
      }
    });
  });

  const lastRow = sheet.lastRow.number;
  sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: 12 } };
  addKpiBlock(sheet, [
    {
      label: 'Trabajadores',
      formula: visibleCountFormula('H', headerRowNumber + 1, lastRow),
      result: workerCount,
      color: COLORS.primary,
    },
    {
      label: 'Ejec. trabajadores',
      formula: visibleSumFormula('J', headerRowNumber + 1, lastRow),
      result: rows.reduce((sum, entry) => sum + entry.workerExecutedTotal, 0),
      numFmt: '0.##',
      color: COLORS.successText,
      fill: COLORS.successBg,
    },
    {
      label: 'Horas trabajadores',
      formula: visibleSumFormula('K', headerRowNumber + 1, lastRow),
      result: rows.reduce((sum, entry) => sum + entry.workerHoursTotal, 0),
      numFmt: '0.##',
      color: COLORS.infoText,
      fill: COLORS.infoBg,
    },
    {
      label: 'Con diferencia',
      formula: visibleCountStartsWithFormula('H', 'L', headerRowNumber + 1, lastRow, 'Diferencia'),
      result: rows.filter((entry) => entry.hasMismatch).reduce((sum, entry) => sum + entry.workers.length, 0),
      color: COLORS.dangerText,
      fill: COLORS.dangerBg,
    },
  ]);

  applyAutoFit(sheet, {
    1: { min: 11, max: 14 },
    2: { min: 16, max: 25 },
    3: { min: 9, max: 12 },
    4: { min: 12, max: 18 },
    5: { min: 9, max: 14 },
    6: { min: 20, max: 34 },
    7: { min: 15, max: 24 },
    8: { min: 18, max: 28 },
    9: { min: 14, max: 22 },
    10: { min: 11, max: 14 },
    11: { min: 10, max: 13 },
    12: { min: 14, max: 24 },
  });

  for (let rowNumber = headerRowNumber + 1; rowNumber <= lastRow; rowNumber += 1) {
    capRowHeight(sheet.getRow(rowNumber), 42);
  }

  sheet.properties.tabColor = { argb: COLORS.successText };
}
export async function exportReportExcel(masterItems, dailyLogs, { emailToUser = false } = {}) {
  // Exclude parent items (only keep children and normal items) using string comparison
  const parentIds = new Set(
    masterItems
      .map(item => item.parent_id ? String(item.parent_id) : '')
      .filter(Boolean)
  );
  const excelMasterItems = masterItems.filter(item => !parentIds.has(String(item.id)));

  const workbook = new ExcelJS.Workbook();
  const exportedAt = format(new Date(), 'dd MMM yyyy HH:mm', { locale: es });

  workbook.creator = 'Control de Obras DGC';
  workbook.company = 'DGC';
  workbook.subject = 'Informe de control de obras';
  workbook.created = new Date();
  workbook.modified = new Date();

  const logoImageId = await loadLogoImageId(workbook);

  addMasterSheet(workbook, excelMasterItems, logoImageId, exportedAt);
  addDailyLogSheet(workbook, excelMasterItems, dailyLogs, logoImageId, exportedAt);
  addWorkerDetailSheet(workbook, excelMasterItems, dailyLogs, logoImageId, exportedAt);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const filename = `informe_obra_${format(new Date(), 'yyyy-MM-dd', { locale: es })}.xlsx`;
  saveAs(blob, filename);


}

