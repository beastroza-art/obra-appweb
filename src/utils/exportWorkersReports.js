import * as jspdfModule from 'jspdf';
import ExcelJS from 'exceljs';
import FileSaver from 'file-saver';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const jsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default;
const saveAs = FileSaver.saveAs || FileSaver;

function formatDate(val) {
  if (!val) return '—';
  const d = new Date(val + 'T00:00:00');
  if (isNaN(d.getTime())) return val;
  return format(d, 'dd/MM/yyyy', { locale: es });
}

export function exportWorkersWithoutActivityPDF({ workers = [], projectName = 'Todas las obras' }) {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

  const PAGE_W = 210;
  const PAGE_H = 297;
  const M = 14;
  const CW = PAGE_W - M * 2;

  const now = new Date();
  const nowStr = format(now, "dd/MM/yyyy HH:mm", { locale: es });
  const dateShort = format(now, "yyyy-MM-dd");

  const addHeader = () => {
    // Header banner
    doc.setFillColor(13, 27, 64);
    doc.rect(0, 0, PAGE_W, 14, 'F');

    doc.setFillColor(234, 179, 8); // Gold Line
    doc.rect(0, 13.5, PAGE_W, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('DGC MONTAJES  ·  PERSONAL SIN ACTIVIDAD ASIGNADA', M, 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(200, 215, 240);
    doc.text(`Fecha: ${nowStr}`, PAGE_W - M, 9, { align: 'right' });

    // Subheader info
    doc.setFillColor(254, 243, 199); // Amber soft
    doc.roundedRect(M, 18, CW, 12, 1, 1, 'F');
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, 18, CW, 12, 1, 1, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(146, 64, 14);
    doc.text(`Personal Disponible / Sin Actividad: ${workers.length} persona(s)`, M + 4, 24);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 53, 15);
    doc.text(`Filtro Obra: ${projectName === 'all' ? 'Todas las obras' : projectName}`, M + 4, 28);

    doc.text('Trabajadores en padrón que actualmente no registran labor activa', PAGE_W - M - 4, 26, { align: 'right' });

    // Table Header
    const yH = 34;
    doc.setFillColor(13, 27, 64);
    doc.rect(M, yH, CW, 7, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);

    doc.text('#', M + 3, yH + 4.8);
    doc.text('NOMBRE COMPLETO', M + 14, yH + 4.8);
    doc.text('CARGO', M + 75, yH + 4.8);
    doc.text('OBRA ASIGNADA', M + 120, yH + 4.8);
    doc.text('F. TRASLADO', M + 160, yH + 4.8);

    return yH + 7;
  };

  const addFooter = (pageNum, totalPages) => {
    doc.setDrawColor(220, 225, 235);
    doc.setLineWidth(0.3);
    doc.line(M, PAGE_H - 10, PAGE_W - M, PAGE_H - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 130, 150);
    doc.text('DGC Montajes · Control de Personal y Recursos en Obra', M, PAGE_H - 6);
    doc.text(`Página ${pageNum} de ${totalPages}`, PAGE_W - M, PAGE_H - 6, { align: 'right' });
  };

  let y = addHeader();
  const rowH = 7;

  if (workers.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No hay personal sin actividad registrada en la obra seleccionada.', M + 4, y + 10);
  } else {
    workers.forEach((w, index) => {
      if (y + rowH > PAGE_H - 16) {
        doc.addPage();
        y = addHeader();
      }

      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(M, y, CW, rowH, 'F');
      }

      doc.setDrawColor(235, 240, 245);
      doc.setLineWidth(0.15);
      doc.line(M, y + rowH, M + CW, y + rowH);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);

      // Index
      doc.setTextColor(140, 150, 165);
      doc.text(String(index + 1), M + 3, y + 4.8);

      // Name
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      const nameStr = doc.splitTextToSize(w.name || '—', 58)[0] || '—';
      doc.text(nameStr, M + 14, y + 4.8);

      // Role
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const roleStr = doc.splitTextToSize(w.role || '—', 42)[0] || '—';
      doc.text(roleStr, M + 75, y + 4.8);

      // Project
      doc.setTextColor(71, 85, 105);
      const projStr = doc.splitTextToSize(w.project || '—', 38)[0] || '—';
      doc.text(projStr, M + 120, y + 4.8);

      // Transfer Date
      doc.setTextColor(100, 116, 139);
      doc.text(formatDate(w.transfer_date), M + 160, y + 4.8);

      y += rowH;
    });
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addFooter(p, totalPages);
  }

  const filename = `personal_sin_actividad_${dateShort}.pdf`;

  try {
    doc.save(filename);
  } catch (saveErr) {
    console.warn("Fallo doc.save directo, usando fallback Blob URL:", saveErr);
    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  }
} catch (error) {
  console.error("Error al exportar PDF de personal sin actividad:", error);
  alert("Hubo un problema al generar el PDF: " + (error.message || error));
}
}

export async function exportWorkersWithoutActivityExcel({ workers = [], projectName = 'Todas las obras' }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DGC Montajes';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Personal Sin Actividad');

  const now = new Date();
  const nowStr = format(now, "dd/MM/yyyy HH:mm", { locale: es });
  const dateShort = format(now, "yyyy-MM-dd");

  // Title Block
  sheet.mergeCells('A1:E1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'DGC MONTAJES · PERSONAL SIN ACTIVIDAD ASIGNADA (DISPONIBLE)';
  titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D1B40' } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  sheet.getRow(1).height = 28;

  // Subtitle
  sheet.mergeCells('A2:E2');
  const subCell = sheet.getCell('A2');
  subCell.value = `Filtro Obra: ${projectName === 'all' ? 'Todas las obras' : projectName}  |  Fecha de Generación: ${nowStr}  |  Total Disponible: ${workers.length} persona(s)`;
  subCell.font = { italic: true, size: 9, color: { argb: 'FF475569' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  subCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  sheet.getRow(2).height = 20;

  sheet.addRow([]); // Blank spacer

  // Table Headers
  const headerRow = sheet.addRow(['N°', 'NOMBRE COMPLETO', 'CARGO / ROL', 'OBRA ASIGNADA', 'FECHA DE TRASLADO']);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF142952' } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FFEAB308' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // Data Rows
  workers.forEach((w, index) => {
    const r = sheet.addRow([
      index + 1,
      w.name || '—',
      w.role || '—',
      w.project || '—',
      formatDate(w.transfer_date),
    ]);
    r.height = 19;

    const isEven = index % 2 === 0;
    r.eachCell((cell, colNum) => {
      cell.font = { size: 9, color: { argb: 'FF0F172A' } };
      cell.alignment = { vertical: 'middle' };
      if (colNum === 1) cell.alignment = { horizontal: 'center', vertical: 'middle' };

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFF8FAFC' : 'FFFFFFFF' },
      };

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // Adjust Column Widths
  sheet.columns = [
    { width: 8 },  // N°
    { width: 34 }, // Nombre
    { width: 24 }, // Cargo
    { width: 26 }, // Obra
    { width: 18 }, // Fecha Traslado
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `personal_sin_actividad_${dateShort}.xlsx`);
}
