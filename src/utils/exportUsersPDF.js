import * as jspdfModule from 'jspdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const jsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default;

const PAGE_W = 297; // A4 Landscape
const PAGE_H = 210;
const M = 12;
const CW = PAGE_W - M * 2; // 273mm

const roleLabels = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  viewer: 'Capataz',
};

function formatLastSeenExact(dateStr) {
  if (!dateStr) return 'Sin registro previo';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Sin registro previo';
  return format(d, "dd/MM/yyyy HH:mm:ss", { locale: es });
}

function isOnline(dateStr) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return false;
  return Math.abs(Date.now() - t) < 2.5 * 60 * 1000;
}

function addHeader(doc, pageNum, totalPages, nowStr, onlineCount, totalCount) {
  // Top Banner
  doc.setFillColor(13, 27, 64); // Navy Blue DGC
  doc.rect(0, 0, PAGE_W, 14, 'F');

  doc.setFillColor(234, 179, 8); // Gold Line
  doc.rect(0, 13.5, PAGE_W, 1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('DGC MONTAJES  ·  REPORTE DE USUARIOS Y CONEXIONES EN VIVO', M, 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(200, 215, 240);
  doc.text(`Generado: ${nowStr}`, PAGE_W - M, 9, { align: 'right' });

  // Subheader info / metrics
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(M, 18, CW, 10, 1, 1, 'F');
  doc.setDrawColor(220, 225, 235);
  doc.setLineWidth(0.2);
  doc.roundedRect(M, 18, CW, 10, 1, 1, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(13, 27, 64);
  doc.text(`Total Usuarios: ${totalCount}`, M + 4, 24.5);

  // En Línea Ahora con punto verde vectorial
  const onlineX = M + 44;
  doc.setFillColor(16, 185, 129);
  doc.circle(onlineX, 23.6, 1.3, 'F');
  doc.setTextColor(16, 140, 60);
  doc.text(`En Línea Ahora: ${onlineCount}`, onlineX + 3.2, 24.5);

  // Desconectados con punto gris vectorial
  const offlineX = M + 92;
  doc.setFillColor(148, 163, 184);
  doc.circle(offlineX, 23.6, 1.3, 'F');
  doc.setTextColor(100, 110, 130);
  doc.text(`Desconectados: ${Math.max(0, totalCount - onlineCount)}`, offlineX + 3.2, 24.5);

  doc.setTextColor(80, 90, 110);
  doc.setFont('helvetica', 'normal');
  doc.text('Presencia detectada automáticamente en tiempo real', PAGE_W - M - 4, 24.5, { align: 'right' });

  // Table Headers
  const yH = 32;
  doc.setFillColor(13, 27, 64);
  doc.rect(M, yH, CW, 7, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);

  doc.text('#', M + 2, yH + 4.8);
  doc.text('NOMBRE COMPLETO', M + 10, yH + 4.8);
  doc.text('CORREO ELECTRÓNICO', M + 65, yH + 4.8);
  doc.text('ROL', M + 130, yH + 4.8);
  doc.text('ESTADO CUENTA', M + 158, yH + 4.8);
  doc.text('CONEXIÓN', M + 185, yH + 4.8);
  doc.text('ÚLTIMA ACTIVIDAD / CONEXIÓN', M + 215, yH + 4.8);

  return yH + 7;
}

function addFooter(doc, pageNum, totalPages) {
  doc.setDrawColor(220, 225, 235);
  doc.setLineWidth(0.3);
  doc.line(M, PAGE_H - 10, PAGE_W - M, PAGE_H - 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 130, 150);
  doc.text('DGC Montajes · Sistema de Control de Avance y Operaciones', M, PAGE_H - 6);
  doc.text(`Página ${pageNum} de ${totalPages}`, PAGE_W - M, PAGE_H - 6, { align: 'right' });
}

export function exportUsersPDF(users = [], filterLabel = '') {
  try {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const now = new Date();
    const nowStr = format(now, "dd/MM/yyyy HH:mm", { locale: es });
    const dateShort = format(now, "yyyy-MM-dd");

    const onlineCount = users.filter((u) => isOnline(u.last_seen)).length;
    const totalCount = users.length;

    let y = addHeader(doc, 1, 1, nowStr, onlineCount, totalCount);
    const rowH = 6.8;

    users.forEach((u, index) => {
      // Check if new page needed
      if (y + rowH > PAGE_H - 15) {
        doc.addPage();
        y = addHeader(doc, 1, 1, nowStr, onlineCount, totalCount);
      }

      const online = isOnline(u.last_seen);
      const lastSeenText = formatLastSeenExact(u.last_seen);
      const roleText = roleLabels[u.role] || u.role || 'Capataz';
      const activeText = u.active ? 'Activo' : 'Inactivo';

      // Zebra row background
      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(M, y, CW, rowH, 'F');
      }

      // Border line bottom
      doc.setDrawColor(235, 240, 245);
      doc.setLineWidth(0.15);
      doc.line(M, y + rowH, M + CW, y + rowH);

      // Text cells
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);

      // # Index
      doc.setTextColor(140, 150, 165);
      doc.text(String(index + 1), M + 2, y + 4.6);

      // Name
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      const nameStr = doc.splitTextToSize(u.full_name || '—', 52)[0] || '—';
      doc.text(nameStr, M + 10, y + 4.6);

      // Email
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(70, 80, 95);
      const emailStr = doc.splitTextToSize(u.email || '—', 62)[0] || '—';
      doc.text(emailStr, M + 65, y + 4.6);

      // Role
      doc.setTextColor(30, 41, 59);
      doc.text(roleText, M + 130, y + 4.6);

      // Account status
      if (u.active) {
        doc.setTextColor(22, 101, 52); // green
        doc.text('Activo', M + 158, y + 4.6);
      } else {
        doc.setTextColor(156, 163, 175); // gray
        doc.text('Inactivo', M + 158, y + 4.6);
      }

      // Connection status
      if (online) {
        doc.setFillColor(16, 185, 129); // green dot
        doc.circle(M + 187, y + 4.2, 1.2, 'F');
        doc.setTextColor(16, 140, 60);
        doc.setFont('helvetica', 'bold');
        doc.text('En línea', M + 190.5, y + 4.6);
      } else {
        doc.setFillColor(203, 213, 225); // gray dot
        doc.circle(M + 187, y + 4.2, 1.2, 'F');
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.text('Desconectado', M + 190.5, y + 4.6);
      }

      // Exact last seen date/time
      doc.setFont('helvetica', 'normal');
      if (online) {
        doc.setTextColor(16, 140, 60);
      } else {
        doc.setTextColor(71, 85, 105);
      }
      doc.text(lastSeenText, M + 215, y + 4.6);

      y += rowH;
    });

    // Calculate and write total pages in footers
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      addFooter(doc, p, totalPages);
    }

    const filename = `usuarios_conexiones_${dateShort}.pdf`;

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
    console.error("Error al exportar PDF de usuarios:", error);
    alert("Hubo un problema al generar el PDF de usuarios: " + (error.message || error));
  }
}
