import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { api } from '@/lib/api';

const PAGE_W = 210;
const PAGE_H = 297;
const M = 12;
const CW = PAGE_W - M * 2;

const SERVER_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
).replace(/\/api\/?$/, '');

const PAGE_BOTTOM = PAGE_H - 14;
const REPORT_SIGNATURE_TOP = PAGE_H - 54;

const IMAGE_LOAD_TIMEOUT_MS = 15000;
const MAX_IMAGE_DIMENSION = 1000;
const SIGNATURE_MAX_DIMENSION = 600;
const CONCURRENT_IMAGE_LOADS = 4;

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

function statusLabel(s) {
  return { pendiente: 'Pendiente', en_ejecucion: 'En ejecución', completado: 'Completado', bloqueado: 'Bloqueado' }[s] || s || '—';
}

function drawProgressBar(doc, x, y, w, h, pct) {
  const fillColor = pct >= 80 ? [34, 150, 60] : pct >= 50 ? [210, 130, 0] : [200, 50, 50];
  doc.setFillColor(220, 225, 235);
  doc.roundedRect(x, y, w, h, 0.8, 0.8, 'F');
  doc.setFillColor(...fillColor);
  doc.roundedRect(x, y, w * Math.min(pct / 100, 1), h, 0.8, 0.8, 'F');
}

function addPageHeader(doc, today, logoData) {
  doc.setFillColor(13, 27, 64);
  doc.rect(0, 0, PAGE_W, 10, 'F');
  doc.setFillColor(234, 179, 8);
  doc.rect(0, 9.5, PAGE_W, 0.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(200, 210, 230);
  doc.text(`INFORME DE AVANCE DE OBRA  ·  ${today}`, M, 7);
  if (logoData) {
    const lH = 7;
    const lW = lH * logoData.aspect;
    doc.addImage(logoData.dataUrl, 'PNG', PAGE_W - M - lW, 1.5, lW, lH);
  }
  return 16;
}

function addSectionTitle(doc, text, y) {
  doc.setFillColor(230, 235, 248);
  doc.roundedRect(M, y, CW, 8, 1, 1, 'F');
  doc.setFillColor(13, 27, 64);
  doc.roundedRect(M, y, 3, 8, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(13, 27, 64);
  doc.text(text, M + 7, y + 5.5);
  return y + 12;
}

function emptyValue(value) {
  return String(value || '').trim() || '—';
}

function resolveImageSrc(value) {
  if (!value || typeof value !== 'string') return '';
  if (value.startsWith('data:image/')) return value;

  // Si trae protocolo absoluto (http://localhost:3001 o http://192.168.1.158:3001), extraer solo la ruta relativa
  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      return `${u.pathname}${u.search}`;
    } catch {
      return value;
    }
  }

  return value.startsWith('/') ? value : `/${value}`;
}

async function loadImageForPdf(src, options = {}) {
  const {
    maxDimension = MAX_IMAGE_DIMENSION,
    format: outputFormat = 'jpeg',
    quality = 0.75,
  } = options;

  if (!src || typeof src !== 'string') return null;

  // Si ya es un data URL (base64, como firmas recién dibujadas), no hacer fetch con timestamp
  if (src.startsWith('data:image/')) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const naturalW = img.naturalWidth || img.width;
          const naturalH = img.naturalHeight || img.height;
          const scale = Math.min(1, maxDimension / Math.max(naturalW, naturalH));
          const targetW = Math.round(naturalW * scale);
          const targetH = Math.round(naturalH * scale);

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, targetW, targetH);

          const isPng = outputFormat === 'png';
          const dataUrl = isPng
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', quality);

          resolve({ dataUrl, aspect: targetW / targetH, format: isPng ? 'PNG' : 'JPEG' });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  const resolvedSrc = resolveImageSrc(src);
  if (!resolvedSrc) return null;

  try {
    const fetchUrl = `${resolvedSrc}${resolvedSrc.includes('?') ? '&' : '?'}t=${Date.now()}`;

    // Descargamos la imagen como Blob a través del proxy relativo /uploads (mismo origen, sin bloqueos de red)
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      console.warn('[PDF] HTTP ' + response.status + ' al descargar imagen:', fetchUrl);
      return null;
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    return new Promise((resolve) => {
      const img = new Image();
      let settled = false;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        URL.revokeObjectURL(objectUrl);
        resolve(value);
      };

      const timeoutId = window.setTimeout(() => {
        console.warn('[PDF] Timeout cargando imagen:', fetchUrl);
        finish(null);
      }, IMAGE_LOAD_TIMEOUT_MS);

      img.onload = () => {
        try {
          const naturalW = img.naturalWidth || img.width;
          const naturalH = img.naturalHeight || img.height;
          const scale = Math.min(1, maxDimension / Math.max(naturalW, naturalH));
          const targetW = Math.round(naturalW * scale);
          const targetH = Math.round(naturalH * scale);

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, targetW, targetH);

          const isPng = outputFormat === 'png';
          const dataUrl = isPng
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', quality);

          finish({ dataUrl, aspect: targetW / targetH, format: isPng ? 'PNG' : 'JPEG' });
        } catch (e) {
          console.error('[PDF] Error procesando canvas:', e);
          finish(null);
        }
      };

      img.onerror = () => {
        console.warn('[PDF] Error de imagen en tag:', fetchUrl);
        finish(null);
      };
      img.src = objectUrl;
    });
  } catch (error) {
    console.error('[PDF] Error de red al cargar imagen:', resolvedSrc, error);
    return null;
  }
}

async function loadImagesWithConcurrency(items, limit, loader) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await loader(items[current]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

function addPdfImage(doc, imageData, x, y, w, h) {
  doc.addImage(imageData.dataUrl, imageData.format || 'JPEG', x, y, w, h);
}

function projectByName(projects, projectName) {
  return (projects || []).find((project) => project?.name === projectName) || null;
}

function drawProjectInfoCard(doc, project, x, y, w) {
  const rows = [
    ['Ubicación', emptyValue(project?.address || project?.location)],
    ['Cliente', emptyValue(project?.client)],
    ['Capataz', emptyValue(project?.capataz)],
    ['Fecha Inicio', emptyValue(project?.start_date)],
    ['Fecha Término', emptyValue(project?.end_date)],
    ['Descripción', emptyValue(project?.description)],
  ];
  const valueX = x + 34;
  const maxValueW = w - 39;
  const rowLineGroups = rows.map(([label, value]) => [label, doc.splitTextToSize(String(value), maxValueW)]);
  const rowHeights = rowLineGroups.map(([, lines]) => Math.max(6, lines.length * 3.6 + 2));
  const cardH = rowHeights.reduce((sum, height) => sum + height, 0) + 6;
  doc.setFillColor(250, 251, 255);
  doc.roundedRect(x, y, w, cardH, 1.5, 1.5, 'F');
  doc.setDrawColor(210, 220, 240);
  doc.setLineWidth(0.15);
  doc.roundedRect(x, y, w, cardH, 1.5, 1.5, 'S');
  let rowY = y + 5;
  rowLineGroups.forEach(([label, lines], index) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); doc.setTextColor(85, 96, 125);
    doc.text(label, x + 3, rowY);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(25, 35, 65);
    doc.text(lines, valueX, rowY);
    rowY += rowHeights[index];
  });
  return cardH;
}

async function renderPhotos(doc, photos, y, today, logoData, options = {}) {
  const validPhotos = (photos || []).filter((photo) => photo.file_url || photo.url);
  if (validPhotos.length === 0) return y;
  const bottomLimit = options.bottomLimit || PAGE_BOTTOM;
  const showCount = options.showCount !== false;
  if (showCount) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(40, 60, 110);
    doc.text(`Fotos (${validPhotos.length}):`, M + 4, y);
    y += 4;
  }

  const imagesData = await loadImagesWithConcurrency(
    validPhotos,
    CONCURRENT_IMAGE_LOADS,
    (photo) => loadImageForPdf(photo.file_url || photo.url)
  );

  const cols = 2;
  const gap = 4;
  const photoW = (CW - 8 - gap * (cols - 1)) / cols;
  const photoH = 58;
  const descLineH = 3.4;
  const descFontSize = 6;

  for (let i = 0; i < validPhotos.length; i += cols) {
    const rowPhotos = validPhotos.slice(i, i + cols);
    const rowImages = imagesData.slice(i, i + cols);
    const rowDescLines = rowPhotos.map((photo) =>
      photo.description ? doc.splitTextToSize(photo.description, photoW) : []
    );

    const maxDescLines = Math.max(0, ...rowDescLines.map((lines) => lines.length));
    const descH = maxDescLines > 0 ? maxDescLines * descLineH + 3 : 0;
    const rowH = photoH + descH + 4;

    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = addPageHeader(doc, today, logoData);
    }

    const rowStartY = y;
    rowPhotos.forEach((photo, col) => {
      const imageData = rowImages[col];
      const descLines = rowDescLines[col];
      const px = M + 4 + col * (photoW + gap);
      const py = rowStartY;

      if (imageData) {
        let iW = photoW; let iH = iW / imageData.aspect;
        if (iH > photoH) { iH = photoH; iW = iH * imageData.aspect; }
        addPdfImage(doc, imageData, px + (photoW - iW) / 2, py + (photoH - iH) / 2, iW, iH);
      } else {
        doc.setFillColor(245, 245, 245);
        doc.roundedRect(px, py, photoW, photoH, 1.5, 1.5, 'F');
        doc.setFontSize(6); doc.setTextColor(150, 150, 150);
        doc.text('[no disponible]', px + photoW / 2, py + photoH / 2, { align: 'center' });
      }

      if (descLines.length > 0) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(descFontSize); doc.setTextColor(90, 95, 100);
        doc.text(descLines, px + photoW / 2, py + photoH + 4, { align: 'center' });
      }
    });

    y = rowStartY + rowH;
  }

  return y;
}

function ensureSpace(doc, y, needed, today, logoData, bottomLimit = PAGE_BOTTOM) {
  if (y + needed <= bottomLimit) return y;
  doc.addPage();
  return addPageHeader(doc, today, logoData);
}

async function drawCapatazSignature(doc, log) {
  const blockX = M;
  const blockY = PAGE_H - 48;
  const blockW = CW;
  const blockH = 34;
  const signature = await loadImageForPdf(log.capataz_signature, {
    format: 'png',
    maxDimension: SIGNATURE_MAX_DIMENSION,
  });
  doc.setDrawColor(210, 218, 235); doc.setLineWidth(0.25);
  doc.roundedRect(blockX, blockY, blockW, blockH, 1.5, 1.5, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(40, 60, 110);
  doc.text('Firma del capataz', blockX + 5, blockY + 6);
  const sigBoxX = blockX + 5; const sigBoxY = blockY + 8; const sigBoxW = 64; const sigBoxH = 16;
  doc.setFillColor(250, 251, 255);
  doc.roundedRect(sigBoxX, sigBoxY, sigBoxW, sigBoxH, 1, 1, 'F');
  if (signature) {
    let sigW = sigBoxW - 6; let sigH = sigW / signature.aspect;
    if (sigH > sigBoxH - 3) { sigH = sigBoxH - 3; sigW = sigH * signature.aspect; }
    addPdfImage(doc, signature, sigBoxX + (sigBoxW - sigW) / 2, sigBoxY + (sigBoxH - sigH) / 2, sigW, sigH);
  } else {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(5.8); doc.setTextColor(150, 150, 150);
    doc.text('Firma no disponible', sigBoxX + sigBoxW / 2, sigBoxY + 9.5, { align: 'center' });
  }
  doc.setDrawColor(120, 135, 165);
  doc.line(blockX + 80, blockY + 23, blockX + blockW - 8, blockY + 23);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(25, 35, 65);
  doc.text(emptyValue(log.capataz_name), blockX + 80, blockY + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); doc.setTextColor(95, 105, 125);
  doc.text('Nombre y firma responsable de cuadrilla', blockX + 80, blockY + 28);
  return PAGE_H - 10;
}

const LOGO_URL = 'https://media.base44.com/images/public/69c135c57c9886fec79cebc5/630dfa8aa_logoclientes-8.png';
async function loadLogoDataUrl() {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve({ dataUrl: canvas.toDataURL('image/png'), aspect: img.width / img.height });
    };
    img.onerror = () => resolve(null);
    img.src = LOGO_URL;
  });
}

function drawCoverPage(doc, { today, todayShort, logoData, masterItems, dailyLogs, byProject, globalPct, lastLogDate, userName = '', showIncludedProjects = true }) {
  const projectNames = Object.keys(byProject);
  const docCode = `DGC-INF-${todayShort.replace(/-/g, '')}`;
  const generatedAt = format(new Date(), 'dd/MM/yyyy HH:mm');
  doc.setFillColor(13, 27, 64); doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  doc.setFillColor(234, 179, 8); doc.rect(0, 0, PAGE_W, 5, 'F');
  doc.setFillColor(20, 38, 82); doc.rect(0, 5, 10, PAGE_H - 5, 'F');
  doc.setFillColor(30, 55, 110); doc.rect(PAGE_W - 48, 5, 48, 48, 'F');
  let titleY = 58;
  if (logoData) {
    const logoH = 34;
    const logoW = Math.min(logoH * logoData.aspect, 78);
    const logoDrawH = logoW / logoData.aspect;
    doc.addImage(logoData.dataUrl, 'PNG', PAGE_W / 2 - logoW / 2, 32, logoW, logoDrawH);
    titleY = 32 + logoDrawH + 20;
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(30); doc.setTextColor(255, 255, 255);
  doc.text('INFORME DE', PAGE_W / 2, titleY, { align: 'center' });
  doc.text('CONTROL DE OBRA', PAGE_W / 2, titleY + 13, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(186, 200, 228);
  doc.text('Gestión de avance · Obras eléctricas · Control de Obras DGC', PAGE_W / 2, titleY + 24, { align: 'center' });
  const accentY = titleY + 34;
  doc.setFillColor(234, 179, 8); doc.rect(PAGE_W / 2 - 42, accentY, 84, 1.4, 'F');
  const cardX = M + 10; const cardW = CW - 20; const cardY = accentY + 14; const cardH = 88;
  doc.setFillColor(255, 255, 255); doc.roundedRect(cardX, cardY, cardW, cardH, 4, 4, 'F');
  doc.setDrawColor(210, 218, 232); doc.setLineWidth(0.25); doc.roundedRect(cardX, cardY, cardW, cardH, 4, 4, 'S');
  doc.setFillColor(13, 27, 64); doc.roundedRect(cardX, cardY, cardW, 11, 4, 4, 'F');
  doc.rect(cardX, cardY + 6, cardW, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
  doc.text('FICHA DEL INFORME', cardX + 8, cardY + 7.5);
  let cy = cardY + 18;
  const metaRows = [
    ['Fecha de emisión', today],
    ['Código', docCode],
    ['Último reporte', lastLogDate],
    ['Proyectos', `${projectNames.length}`],
    ['Actividades / Reportes', `${masterItems.length} / ${dailyLogs.length}`],
    ['Avance global', `${globalPct.toFixed(1)}%`],
  ];
  metaRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(100, 112, 140);
    doc.text(label, cardX + 8, cy);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(25, 35, 65);
    doc.text(String(value), cardX + 52, cy);
    cy += 8;
  });
  let lines = [];
  if (showIncludedProjects && projectNames.length > 0) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(13, 27, 64);
    doc.text('Obras incluidas:', cardX + 8, cy + 2);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(55, 65, 95);
    const preview = projectNames.slice(0, 5).join('  ·  ');
    const suffix = projectNames.length > 5 ? `  (+${projectNames.length - 5} más)` : '';
    lines = doc.splitTextToSize(preview + suffix, cardW - 16);
    doc.text(lines, cardX + 8, cy + 7);
    cy += lines.length * 4 + 9;
  }
  if (userName) {
    if (!showIncludedProjects || projectNames.length === 0) cy += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(13, 27, 64);
    doc.text('Emitido por:', cardX + 8, cy);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(25, 35, 65);
    doc.text(userName, cardX + 52, cy);
  }
  const barY = PAGE_H - 52;
  doc.setFillColor(234, 179, 8); doc.rect(0, barY, PAGE_W, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(234, 179, 8);
  doc.text('DOCUMENTO CONFIDENCIAL — USO INTERNO', PAGE_W / 2, PAGE_H - 38, { align: 'center' });
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(175, 188, 215);
  doc.text(`Generado automáticamente · Control de Obras DGC · ${generatedAt}`, PAGE_W / 2, PAGE_H - 30, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(140, 155, 185);
  doc.text('La reproducción parcial o total requiere autorización del área responsable.', PAGE_W / 2, PAGE_H - 22, { align: 'center' });
}

export async function exportReportPDF(
  masterItems,
  dailyLogs,
  sitePhotos = [],
  checklistEntries = [],
  projectsOrUserName = '',
  userNameArg = '',
  options = {}
) {
  const projects = Array.isArray(projectsOrUserName) ? projectsOrUserName : [];
  const userName = Array.isArray(projectsOrUserName) ? userNameArg : projectsOrUserName;
  const emailToUser = options.emailToUser === false;
  const emailSubject = options.emailSubject || `Informe PDF Control de Obras DGC - ${format(new Date(), 'yyyy-MM-dd')}`;
  const showIncludedProjects = options.showIncludedProjects !== false;
  const includeDailyReports = options.includeDailyReports !== false;
  const includePhotos = options.includePhotos !== false;
  const reportLogs = includeDailyReports ? dailyLogs : [];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const today = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es });
  const todayShort = format(new Date(), 'yyyy-MM-dd');
  const logoData = await loadLogoDataUrl();
  const totalPlanned = masterItems.reduce((s, i) => s + (i.planned_qty || 0), 0);
  const totalExecuted = masterItems.reduce((s, i) => s + (i.executed_qty || 0), 0);
  const globalPct = totalPlanned > 0 ? (totalExecuted / totalPlanned) * 100 : 0;
  const completados = masterItems.filter(i => i.status === 'completado').length;
  const bloqueados = masterItems.filter(i => i.status === 'bloqueado').length;
  const enEjecucion = masterItems.filter(i => i.status === 'en_ejecucion').length;
  const sortedAllLogs = [...reportLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const lastLogDate = sortedAllLogs[0]?.date || '—';
  const byProject = {};
  masterItems.forEach(item => {
    const p = item.project || 'Sin proyecto';
    if (!byProject[p]) byProject[p] = [];
    byProject[p].push(item);
  });
  const logsById = {};
  reportLogs.forEach(log => { logsById[log.id] = log; });

  const drawDetailedDailyLog = async (log, logIndex) => {
    doc.addPage();
    let y = addPageHeader(doc, today, logoData);
    const logItem = masterItems.find(i => i.id === log.master_item_id);
    const logPhotos = sitePhotos.filter(p => p.daily_log_id === log.id);
    doc.setFillColor(45, 70, 140); doc.roundedRect(M, y, CW, 8, 1, 1, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
    const logTitle = [
      `Reporte ${logIndex + 1}`,
      log.date,
      logItem?.project,
      logItem?.tower,
      logItem?.floor,
      logItem?.activity
    ].filter(Boolean).join('  -  ');
    const cleanLogTitle = logTitle.replace(/→/g, '->');
    doc.text(cleanLogTitle, M + 3, y + 5.5);
    if (log.supervisor) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(180, 200, 230);
      doc.text(`Supervisor: ${log.supervisor}`, M + CW - 3, y + 5.5, { align: 'right' });
    }
    y += 10;
    doc.setFillColor(245, 248, 255); doc.roundedRect(M, y, CW, 10, 1, 1, 'F');
    doc.setDrawColor(210, 220, 240); doc.setLineWidth(0.15); doc.roundedRect(M, y, CW, 10, 1, 1, 'S');
    const mW = CW / 4;
    const metrics = [
      ['Ejecutado hoy', `${log.executed_today ?? 0} ${logItem?.unit || 'und'}`],
      ['Horas trabajadas', `${log.hours_worked || 0}h`],
      ['Personal', `${log.crew_workers?.length || 0} pers.`],
      ['Restriccion', log.has_restriction ? 'Si' : 'No'],
    ];
    metrics.forEach(([label, val], i) => {
      const mx = M + i * mW + 3;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(100, 110, 130);
      doc.text(label, mx, y + 4);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      if (label === 'Restriccion' && log.has_restriction) doc.setTextColor(200, 50, 50);
      else doc.setTextColor(20, 40, 90);
      doc.text(val, mx, y + 9);
    });
    y += 12;
    if (log.crew_workers?.length > 0) {
      y = ensureSpace(doc, y, 5, today, logoData, REPORT_SIGNATURE_TOP);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(60, 80, 120);
      doc.text('Personal presente:', M + 4, y + 3);
      y += 6;
      log.crew_workers.forEach((w, wi) => {
        y = ensureSpace(doc, y, 4.5, today, logoData, REPORT_SIGNATURE_TOP);
        doc.setFillColor(wi % 2 === 0 ? 248 : 255, wi % 2 === 0 ? 250 : 255, wi % 2 === 0 ? 254 : 255);
        doc.rect(M + 4, y - 1, CW - 4, 4.5, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(40, 40, 40);
        doc.text(`${w.name || '---'}`, M + 7, y + 2.5);
        doc.setTextColor(80, 90, 120);
        doc.text(w.role || '---', M + 65, y + 2.5);
        if (w.hours) doc.text(`${w.hours}h`, M + 110, y + 2.5);
        if (w.executed) doc.text(`${w.executed} und`, M + 130, y + 2.5);
        y += 4.5;
      });
      y += 2;
    }
    if (log.has_restriction && (log.restriction_detail || '').trim()) {
      const rLines = doc.splitTextToSize(`Restriccion: ${log.restriction_detail}`, CW - 10);
      const rH = rLines.length * 4 + 5;
      y = ensureSpace(doc, y, rH + 3, today, logoData, REPORT_SIGNATURE_TOP);
      doc.setFillColor(255, 243, 240); doc.roundedRect(M, y, CW, rH, 1, 1, 'F');
      doc.setDrawColor(220, 60, 60); doc.setLineWidth(0.2); doc.roundedRect(M, y, CW, rH, 1, 1, 'S');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(180, 40, 40);
      doc.text(rLines, M + 4, y + 4.5);
      y += rH + 3;
    }
    if (log.observations) {
      const oLines = doc.splitTextToSize(log.observations, CW - 10);
      const oH = oLines.length * 11;
      y = ensureSpace(doc, y, oH + 3, today, logoData, REPORT_SIGNATURE_TOP);
      doc.setFillColor(245, 248, 255); doc.roundedRect(M, y, CW, oH, 1, 1, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(40, 60, 110);
      doc.text('Observaciones:', M + 4, y + 4.5);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 60, 80);
      doc.text(oLines, M + 4, y + 9);
      y += oH + 3;
    }
    if (includePhotos && logPhotos.length > 0) {
      y = await renderPhotos(doc, logPhotos, y, today, logoData, { bottomLimit: REPORT_SIGNATURE_TOP });
    }
    y = ensureSpace(doc, y, 38, today, logoData, REPORT_SIGNATURE_TOP);
    y = await drawCapatazSignature(doc, log);
  };

  // PÁGINA 1: PORTADA
  drawCoverPage(doc, { today, todayShort, logoData, masterItems, dailyLogs: reportLogs, byProject, globalPct, lastLogDate, userName, showIncludedProjects });
  
  // PÁGINA 2+: RESUMEN EJECUTIVO
  doc.addPage();
  let y = addPageHeader(doc, today, logoData);
  y = addSectionTitle(doc, 'RESUMEN EJECUTIVO', y);
  const kpis = [
    { label: 'Avance Global', value: `${globalPct.toFixed(1)}%`, color: globalPct >= 80 ? [34, 150, 60] : globalPct >= 50 ? [210, 130, 0] : [200, 50, 50] },
    { label: 'Total Ítems', value: masterItems.length, color: [40, 60, 110] },
    { label: 'En Ejecución', value: enEjecucion, color: [30, 100, 200] },
    { label: 'Completados', value: completados, color: [34, 150, 60] },
    { label: 'Bloqueados', value: bloqueados, color: [200, 50, 50] },
    { label: 'Reportes Diarios', value: reportLogs.length, color: [80, 80, 80] },
  ];
  const kpiW = CW / 3 - 2;
  const kpiH = 16;
  kpis.forEach((k, i) => {
    const col = i % 3; const row = Math.floor(i / 3);
    const kx = M + col * (kpiW + 3); const ky = y + row * (kpiH + 3);
    doc.setFillColor(248, 250, 254); doc.roundedRect(kx, ky, kpiW, kpiH, 1.5, 1.5, 'F');
    doc.setFillColor(...k.color); doc.roundedRect(kx, ky, 2.5, kpiH, 1, 1, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...k.color);
    doc.text(String(k.value), kx + 9, ky + 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(100, 110, 130);
    doc.text(k.label, kx + 9, ky + 14.5);
  });
  y += kpiH * 2 + 12;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(40, 60, 110);
  doc.text(`AVANCE GLOBAL: ${globalPct.toFixed(1)}%`, M, y);
  y += 3;
  drawProgressBar(doc, M, y, CW, 5, globalPct);
  y += 14;
  y = addSectionTitle(doc, 'RESUMEN POR PROYECTO', y);
  for (const [projectName, items] of Object.entries(byProject)) {
    const projPlanned = items.reduce((s, i) => s + (i.planned_qty || 0), 0);
    const projExecuted = items.reduce((s, i) => s + (i.executed_qty || 0), 0);
    const projPct = projPlanned > 0 ? (projExecuted / projPlanned * 100) : 0;
    const projLogs = reportLogs.filter(log => {
      const logItem = masterItems.find(i => i.id === log.master_item_id);
      return logItem && logItem.project === projectName;
    }).length;
    if (y + 8 > PAGE_H - 14) { doc.addPage(); y = addPageHeader(doc, today, logoData); }
    doc.setFillColor(245, 247, 253); doc.roundedRect(M, y, CW, 8, 1, 1, 'F');
    doc.setDrawColor(210, 220, 240); doc.setLineWidth(0.15); doc.roundedRect(M, y, CW, 8, 1, 1, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(13, 27, 64);
    doc.text(projectName, M + 3, y + 5.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(80, 90, 120);
    doc.text(`${items.length} ítems  ·  ${projLogs} reportes`, M + 80, y + 5.5);
    drawProgressBar(doc, M + 120, y + 2.5, 50, 3, projPct);
    const pctColor = projPct >= 80 ? [34, 150, 60] : projPct >= 50 ? [210, 130, 0] : [200, 50, 50];
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...pctColor);
    doc.text(`${projPct.toFixed(1)}%`, M + CW - 3, y + 5.5, { align: 'right' });
    y += 10;
    if (y + 46 > PAGE_H - 14) { doc.addPage(); y = addPageHeader(doc, today, logoData); }
    const project = projectByName(projects, projectName);
    const infoCardH = drawProjectInfoCard(doc, project, M + 3, y, CW - 6);
    y += infoCardH + 5;
  }

  // SECCIÓN 2: DETALLE POR PROYECTO
  let isFirstDetailProject = true;
  for (const [projectName, items] of Object.entries(byProject)) {
    if (isFirstDetailProject) {
      y = ensureSpace(doc, y, 40, today, logoData, PAGE_H - 14);
      isFirstDetailProject = false;
    } else {
      doc.addPage();
      y = addPageHeader(doc, today, logoData);
    }
    doc.setFillColor(13, 27, 64); doc.roundedRect(M, y, CW, 14, 2, 2, 'F');
    doc.setFillColor(234, 179, 8); doc.roundedRect(M, y + 12, CW, 2, 0, 0, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
    doc.text(projectName, M + 4, y + 9);
    const projPlanned = items.reduce((s, i) => s + (i.planned_qty || 0), 0);
    const projExecuted = items.reduce((s, i) => s + (i.executed_qty || 0), 0);
    const projPct = projPlanned > 0 ? (projExecuted / projPlanned * 100) : 0;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(180, 200, 230);
    doc.text(`${projPct.toFixed(1)}% avance  ·  ${projExecuted}/${projPlanned} und  ·  ${items.length} ítems`, M + CW - 3, y + 9, { align: 'right' });
    y += 20;
    doc.setFillColor(60, 80, 140); doc.rect(M, y, CW, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(255, 255, 255);
    doc.text('Torre / Piso / Actividad', M + 3, y + 5);
    doc.text('Cuadrilla', M + 80, y + 5);
    doc.text('Ejec / Plan', M + 115, y + 5);
    doc.text('Avance', M + 140, y + 5);
    doc.text('Estado', M + 168, y + 5);
    y += 7;

    for (const item of items) {
      const itemLogs = reportLogs.filter(l => l.master_item_id === item.id);
      const requiredHeight = 8 + (itemLogs.length * 4);
      if (y + Math.min(requiredHeight, 60) > PAGE_H - 14) {
        doc.addPage();
        y = addPageHeader(doc, today, logoData);
      }
      const pct = item.planned_qty > 0 ? ((item.executed_qty || 0) / item.planned_qty * 100) : 0;
      const rowBg = items.indexOf(item) % 2 === 0 ? [250, 251, 255] : [243, 245, 252];
      doc.setFillColor(...rowBg); doc.rect(M, y, CW, 8, 'F');
      doc.setDrawColor(215, 220, 235); doc.setLineWidth(0.1); doc.line(M, y + 8, M + CW, y + 8);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(20, 30, 50);
      const itemLabel = [item.tower, item.floor, item.activity].filter(Boolean).join(' · ');
      const cleanLabel = itemLabel.replace(/→/g, '->');
      doc.text(cleanLabel.substring(0, 52), M + 3, y + 5.5);
      doc.setTextColor(60, 70, 100);
      doc.text((item.crew_name || '—').substring(0, 18), M + 80, y + 5.5);
      doc.text(`${item.executed_qty || 0} / ${item.planned_qty || 0} ${item.unit || 'und'}`, M + 115, y + 5.5);
      drawProgressBar(doc, M + 140, y + 3, 24, 3, pct);
      const stColors = { pendiente: [120, 120, 120], en_ejecucion: [30, 100, 200], completado: [34, 150, 60], bloqueado: [200, 50, 50] };
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...(stColors[item.status] || [100, 100, 100]));
      doc.text(statusLabel(item.status), M + 168, y + 5.5);
      y += 8;

      if (itemLogs.length > 0) {
        const sortedItemLogs = [...itemLogs].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        for (const log of sortedItemLogs) {
          const hasRestriction = log.has_restriction && (log.restriction_detail || '').trim();
          const line = `· ${log.date || '—'}: ejecutó ${log.executed_today ?? 0} ${item.unit || 'und'}`;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(5.6); doc.setTextColor(120, 128, 148);
          doc.text(line, M + 6, y + 3.2);
          if (hasRestriction) {
            const lineW = doc.getTextWidth(line);
            doc.setTextColor(200, 50, 50);
            doc.text('  · Restricción', M + 6 + lineW, y + 3.2);
          }
          y += 4;
        }
        y += 1.5;
      }
    }
    y += 4;

    const itemsConRestriccion = items.filter(i => (i.restrictions || '').trim());
    if (itemsConRestriccion.length > 0) {
      if (y + 10 > PAGE_H - 14) { doc.addPage(); y = addPageHeader(doc, today, logoData); }
      y = addSectionTitle(doc, `RESTRICCIONES ACTIVAS (${itemsConRestriccion.length})`, y);
      for (const item of itemsConRestriccion) {
        if (y + 10 > PAGE_H - 14) { doc.addPage(); y = addPageHeader(doc, today, logoData); }
        doc.setFillColor(255, 243, 240);
        const rawText = `${[item.tower, item.floor, item.activity].filter(Boolean).join(' · ')}: ${item.restrictions}`;
        const cleanText = rawText.replace(/→/g, '->');
        const rLines = doc.splitTextToSize(cleanText, CW - 10);
        const rH = rLines.length * 4 + 5;
        doc.roundedRect(M, y, CW, rH, 1, 1, 'F');
        doc.setDrawColor(220, 60, 60); doc.setLineWidth(0.2); doc.roundedRect(M, y, CW, rH, 1, 1, 'S');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(160, 40, 40);
        doc.text(rLines, M + 4, y + 4.5);
        y += rH + 3;
      }
      y += 4;
    }

    if (includeDailyReports) {
      const projectLogs = sortedAllLogs.filter(log => {
        const logItem = masterItems.find(i => i.id === log.master_item_id);
        return logItem && logItem.project === projectName;
      });
      for (const [logIndex, log] of projectLogs.entries()) {
        await drawDetailedDailyLog(log, logIndex);
      }
    }
  }

  const filename = `informe_avance_${todayShort}.pdf`;
  doc.save(filename);
}
