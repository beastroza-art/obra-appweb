const nodemailer = require("nodemailer");
const cron = require("node-cron");
const db = require("../db/connection");

const APP_URL = process.env.APP_URL || "http://181.173.215.100:5173";

function createTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error("Credenciales SMTP no configuradas en el backend (.env).");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    auth: { user, pass },
  });
}

function parseAllowedProjects(allowed) {
  if (Array.isArray(allowed)) return allowed;
  if (typeof allowed === "string") {
    try {
      const parsed = JSON.parse(allowed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      if (allowed.trim()) return [allowed.trim()];
    }
  }
  return [];
}

/**
 * Plantilla HTML: Recordatorio Semanal de Lunes (8:00 AM)
 */
function getMondayReminderHtml({ userName, role, projects = [] }) {
  const roleName = role === "admin" ? "Administrador" : role === "supervisor" ? "Supervisor" : "Capataz";
  const projectListHtml = projects.length > 0
    ? projects.map((p) => `<li style="margin-bottom: 6px; color: #1e293b; font-weight: 600;">🏗️ ${p}</li>`).join("")
    : `<li style="color: #64748b; font-style: italic;">Todas las obras activas</li>`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recordatorio Planificación Semanal - DGC Montajes</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 620px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner DGC -->
          <tr>
            <td style="background-color: #0d1b40; padding: 24px 30px; text-align: left; border-bottom: 4px solid #eab308;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #eab308; text-transform: uppercase;">DGC MONTAJES · SISTEMA DE CONTROL DE OBRAS</span>
                    <h1 style="margin: 6px 0 0 0; color: #ffffff; font-size: 20px; font-weight: 700; line-height: 1.3;">📋 Recordatorio de Planificación Semanal</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 28px 30px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">
                Estimado(a) <strong>${userName}</strong> (${roleName}),
              </p>

              <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 22px;">
                <p style="margin: 0; font-size: 14px; color: #0f172a; line-height: 1.5; font-weight: 500;">
                  ☀️ <strong>¡Buen inicio de semana!</strong> Le recordamos que durante la jornada de hoy corresponde realizar la actualización y programación operativa en el sistema de Control de Obras.
                </p>
              </div>

              <!-- Checklist Operativo -->
              <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #0d1b40; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">
                Tareas clave para el día de hoy:
              </h3>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="padding: 8px 0; font-size: 14px; color: #334155; line-height: 1.4;">
                    <span style="color: #10b981; font-weight: bold; margin-right: 8px;">✓</span> <strong>Cargar actividades de la semana:</strong> Definir sectores, pisos y frentes de trabajo.
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-size: 14px; color: #334155; line-height: 1.4;">
                    <span style="color: #10b981; font-weight: bold; margin-right: 8px;">✓</span> <strong>Asignar cuadrillas:</strong> Verificar el personal disponible asignado a cada tarea.
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-size: 14px; color: #334155; line-height: 1.4;">
                    <span style="color: #10b981; font-weight: bold; margin-right: 8px;">✓</span> <strong>Reportar avances y restricciones:</strong> Si existen interferencias en obra, regístrelas para gestión inmediata.
                  </td>
                </tr>
              </table>

              <!-- Obras Asignadas -->
              <div style="background-color: #fdfaf3; border: 1px solid #fef08a; border-radius: 8px; padding: 14px 18px; margin-bottom: 26px;">
                <span style="font-size: 12px; font-weight: 700; color: #854d0e; text-transform: uppercase; letter-spacing: 0.5px;">Tus Obras Asignadas:</span>
                <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13.5px;">
                  ${projectListHtml}
                </ul>
              </div>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${APP_URL}/master-plan" target="_blank" style="display: inline-block; background-color: #0d1b40; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 10px rgba(13,27,64,0.25); text-transform: uppercase; letter-spacing: 0.5px;">
                      👉 Ingresar al Plan Maestro y Carga de Actividades
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 10px;">
                    <span style="font-size: 11px; color: #64748b;">Enlace directo: <a href="${APP_URL}/master-plan" style="color: #0284c7; text-decoration: underline;">${APP_URL}/master-plan</a></span>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 30px; text-align: center;">
              <p style="margin: 0; font-size: 11.5px; color: #64748b; line-height: 1.5;">
                Este es un mensaje automático programado enviado por <strong>DGC Montajes</strong>.<br>
                Oficina Técnica y Control de Gestión · Santiago de Chile.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Plantilla HTML: Alerta de Actividades Próximas a Vencer o Vencidas y Firmas Pendientes
 */
function getOverdueActivitiesHtml({
  userName,
  role,
  activities = [],
  unsignedLogsCount = 0,
  projectName = "",
  supervisorName = "",
  capatazName = "",
}) {
  const roleName = role === "admin" ? "Administrador" : role === "supervisor" ? "Supervisor" : "Capataz";
  const count = activities.length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rowsHtml = activities.map((act, idx) => {
    const planned = Number(act.planned_qty || 0);
    const executed = Number(act.executed_qty || 0);
    const pct = planned > 0 ? Math.min(100, Math.round((executed / planned) * 100)) : 0;

    let statusBadge = "";
    if (act.end_date) {
      const parts = act.end_date.split("-");
      if (parts.length === 3) {
        const endDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const diffMs = endDate.getTime() - today.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          const daysLate = Math.abs(diffDays);
          statusBadge = `<span style="background-color: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700;">🔴 Atrasada (${daysLate}d)</span>`;
        } else if (diffDays === 0) {
          statusBadge = `<span style="background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700;">🟡 Vence Hoy</span>`;
        } else if (diffDays <= 3) {
          statusBadge = `<span style="background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700;">🟡 Vence en ${diffDays}d</span>`;
        } else {
          statusBadge = `<span style="background-color: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700;">🔵 En fecha (${diffDays}d)</span>`;
        }
      }
    }

    if (!statusBadge) {
      statusBadge = `<span style="background-color: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700;">Sin fecha</span>`;
    }

    const restrictionHtml = act.restrictions && act.restrictions.trim() && act.restrictions.toLowerCase() !== "sin restricción"
      ? `<div style="margin-top: 4px; font-size: 11px; color: #b91c1c; background-color: #fff1f2; padding: 3px 6px; border-radius: 4px; border-left: 2px solid #ef4444;"><strong>Restricción:</strong> ${act.restrictions}</div>`
      : "";

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 0 ? "background-color: #ffffff;" : "background-color: #f8fafc;"}">
        <td style="padding: 10px 12px; font-size: 12.5px; color: #1e293b; vertical-align: top;">
          <strong>${act.project || "—"}</strong><br>
          <span style="font-size: 11px; color: #64748b;">${act.tower || ""} ${act.floor ? "· " + act.floor : ""}</span>
        </td>
        <td style="padding: 10px 12px; font-size: 12.5px; color: #0f172a; vertical-align: top;">
          <strong>${act.activity || "—"}</strong>
          ${restrictionHtml}
        </td>
        <td style="padding: 10px 12px; font-size: 12px; color: #334155; white-space: nowrap; vertical-align: top;">
          ${act.end_date || "Sin fecha"}<br>
          ${statusBadge}
        </td>
        <td style="padding: 10px 12px; font-size: 12px; color: #0f172a; text-align: right; vertical-align: top;">
          <strong>${executed} / ${planned} ${act.unit || "und"}</strong><br>
          <span style="font-size: 11px; font-weight: 700; color: ${pct === 100 ? "#16a34a" : pct > 50 ? "#0284c7" : "#ea580c"};">
            ${pct}% completado
          </span>
        </td>
      </tr>
    `;
  }).join("");

  const projectMetaInfo = (supervisorName || capatazName) ? `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 16px; font-size: 12px; color: #475569;">
      ${supervisorName ? `Supervisor: <strong>${supervisorName}</strong>` : ""} 
      ${supervisorName && capatazName ? " · " : ""} 
      ${capatazName ? `Capataz: <strong>${capatazName}</strong>` : ""}
    </div>
  ` : "";

  const unsignedLogsBanner = unsignedLogsCount > 0 ? `
    <div style="background-color: #fff7ed; border-left: 4px solid #ea580c; border: 1px solid #fed7aa; padding: 13px 18px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13.5px; color: #9a3412; line-height: 1.5;">
        ✍️ <strong>Firmas de Reportes Pendientes:</strong> Se detectaron <strong>${unsignedLogsCount} reporte(s) diario(s)</strong> sin firma de capataz en esta(s) obra(s). Por favor regularice sus firmas en la plataforma para mantener el libro de obra al día.
      </p>
    </div>
  ` : "";

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alerta Operativa - DGC Montajes</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 680px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner DGC -->
          <tr>
            <td style="background-color: #0d1b40; padding: 22px 30px; text-align: left; border-bottom: 4px solid #ef4444;">
              <span style="font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #fca5a5; text-transform: uppercase;">DGC MONTAJES · ALERTA OPERATIVA EN TERRENO</span>
              <h1 style="margin: 6px 0 0 0; color: #ffffff; font-size: 20px; font-weight: 700; line-height: 1.3;">⚠️ Estado Crítico y Pendientes de Obra</h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 26px 30px;">
              <p style="margin: 0 0 14px 0; font-size: 15px; color: #334155; line-height: 1.5;">
                Estimado(a) <strong>${userName}</strong> (${roleName}),
              </p>

              ${projectMetaInfo}

              ${unsignedLogsBanner}

              ${count > 0 ? `
                <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 22px;">
                  <p style="margin: 0; font-size: 14px; color: #991b1b; line-height: 1.5;">
                    Se han detectado <strong>${count} actividad(es)</strong> en sus obras asignadas que han alcanzado su fecha de término o están próximas a cumplirse y aún no registran el 100% de ejecución.
                  </p>
                </div>

                <!-- Table -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                  <thead>
                    <tr style="background-color: #0d1b40; color: #ffffff; text-align: left;">
                      <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Obra / Sector</th>
                      <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Actividad</th>
                      <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Término</th>
                      <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: right;">Avance</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml}
                  </tbody>
                </table>
              ` : `
                <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 22px;">
                  <p style="margin: 0; font-size: 14px; color: #166534; line-height: 1.5;">
                    ✅ <strong>¡Excelente!</strong> No se registran faenas atrasadas ni próximas a vencer en las obras seleccionadas.
                  </p>
                </div>
              `}

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${APP_URL}/master-plan" target="_blank" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 10px rgba(220,38,38,0.25); text-transform: uppercase; letter-spacing: 0.5px;">
                      📝 Ir al Plan Maestro para Actualizar Avances
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 10px;">
                    <span style="font-size: 11px; color: #64748b;">Enlace directo al sistema: <a href="${APP_URL}/master-plan" style="color: #0284c7; text-decoration: underline;">${APP_URL}/master-plan</a></span>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 30px; text-align: center;">
              <p style="margin: 0; font-size: 11.5px; color: #64748b; line-height: 1.5;">
                Notificación automática generada por el <strong>Sistema de Control de Obras DGC</strong>.<br>
                Si la actividad ya fue terminada o reprogramada, por favor actualice su estado en la plataforma.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Plantilla HTML: Resumen Ejecutivo Gerencial para Administradores
 * Agrupado por Supervisor / Capataz con métricas clave y diagnóstico
 */
function getAdminExecutiveSummaryHtml({ adminName = "Administrador", auditData = {} }) {
  const allWorkers = Array.isArray(auditData.workers) ? [...auditData.workers] : [];

  // FILTRAR ESTRICTAMENTE: Solo mostrar supervisores y capataces con atrasos, por vencer o firmas pendientes
  const alertWorkers = allWorkers.filter((w) => {
    const overdue = Number(w.overdueCount || 0);
    const upcoming = Number(w.upcomingCount || 0);
    const unsigned = Number(w.unsignedLogsCount || 0);
    return overdue > 0 || upcoming > 0 || unsigned > 0;
  });

  // Calcular métricas globales
  let totalOverdue = 0;
  let totalUpcoming = 0;
  let totalUnsigned = 0;

  allWorkers.forEach((w) => {
    totalOverdue += Number(w.overdueCount || 0);
    totalUpcoming += Number(w.upcomingCount || 0);
    totalUnsigned += Number(w.unsignedLogsCount || 0);
  });

  // Ordenar por prioridad los trabajadores con alerta:
  // 1) Más atrasadas primero
  // 2) Más firmas pendientes
  // 3) Más por vencer
  alertWorkers.sort((a, b) => {
    if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
    if (b.unsignedLogsCount !== a.unsignedLogsCount) return b.unsignedLogsCount - a.unsignedLogsCount;
    if (b.upcomingCount !== a.upcomingCount) return b.upcomingCount - a.upcomingCount;
    return (a.fullName || "").localeCompare(b.fullName || "");
  });

  const todayFormatted = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const rowsHtml = alertWorkers.length > 0 ? alertWorkers.map((w, idx) => {
    const projectsStr = Array.isArray(w.projects) && w.projects.length > 0
      ? w.projects.join(", ")
      : "Sin obras asignadas";

    const isSupervisor = w.role === "Supervisor";
    const roleBadge = isSupervisor
      ? `<span style="background-color: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Supervisor</span>`
      : `<span style="background-color: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Capataz</span>`;

    const overdueBadge = w.overdueCount > 0
      ? `<span style="background-color: #fef2f2; color: #dc2626; border: 1px solid #fecaca; font-weight: 800; font-size: 12px; padding: 3px 8px; border-radius: 6px;">${w.overdueCount}</span>`
      : `<span style="color: #94a3b8; font-size: 12px;">0</span>`;

    const upcomingBadge = w.upcomingCount > 0
      ? `<span style="background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a; font-weight: 800; font-size: 12px; padding: 3px 8px; border-radius: 6px;">${w.upcomingCount}</span>`
      : `<span style="color: #94a3b8; font-size: 12px;">0</span>`;

    const unsignedBadge = w.unsignedLogsCount > 0
      ? `<span style="background-color: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; font-weight: 800; font-size: 12px; padding: 3px 8px; border-radius: 6px;">✍️ ${w.unsignedLogsCount}</span>`
      : `<span style="color: #94a3b8; font-size: 12px;">0</span>`;

    let diagBadge = `<span style="background-color: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px;">🟢 Al día</span>`;
    if (w.overdueCount > 0) {
      diagBadge = `<span style="background-color: #fef2f2; color: #dc2626; border: 1px solid #fecaca; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px;">🔴 ${w.overdueCount} atrasada(s)</span>`;
    } else if (w.unsignedLogsCount > 0) {
      diagBadge = `<span style="background-color: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px;">✍️ ${w.unsignedLogsCount} firma(s)</span>`;
    } else if (w.upcomingCount > 0) {
      diagBadge = `<span style="background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px;">🟡 ${w.upcomingCount} por vencer</span>`;
    }

    const rowBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${rowBg};">
        <td style="padding: 10px 14px; font-size: 13px; color: #0f172a; vertical-align: top;">
          <div style="font-weight: 700; color: #0f172a; margin-bottom: 2px;">
            ${w.fullName} ${roleBadge}
          </div>
          <div style="font-size: 11px; color: #64748b; line-height: 1.35;">
            🏗️ <em>${projectsStr}</em>
          </div>
        </td>
        <td style="padding: 10px 10px; text-align: center; vertical-align: middle;">
          ${overdueBadge}
        </td>
        <td style="padding: 10px 10px; text-align: center; vertical-align: middle;">
          ${upcomingBadge}
        </td>
        <td style="padding: 10px 10px; text-align: center; vertical-align: middle;">
          ${unsignedBadge}
        </td>
        <td style="padding: 10px 14px; text-align: right; vertical-align: middle; white-space: nowrap;">
          ${diagBadge}
        </td>
      </tr>
    `;
  }).join("") : `
    <tr>
      <td colspan="5" style="padding: 24px 14px; text-align: center; color: #16a34a; font-weight: 700; font-size: 13.5px; background-color: #f0fdf4;">
        🎉 ¡Excelente noticia! Todas las obras y trabajadores están al día. No se registran atrasos, faenas por vencer ni firmas pendientes en este momento.
      </td>
    </tr>
  `;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resumen Ejecutivo de Obras - DGC Montajes</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 720px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">

          <!-- Header Corporativo -->
          <tr>
            <td style="background-color: #0d1b40; padding: 26px 30px; text-align: left;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="display: inline-block; background-color: #f59e0b; color: #0d1b40; font-size: 10px; font-weight: 800; padding: 3px 9px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                      INFORME GERENCIAL · ADMINISTRACIÓN
                    </span>
                    <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.3px;">
                      Resumen Ejecutivo de Obras y Terreno
                    </h1>
                    <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12.5px;">
                      DGC Montajes · Control de Gestión y Seguimiento Operativo
                    </p>
                  </td>
                  <td align="right" style="vertical-align: top;">
                    <span style="font-size: 11px; color: #cbd5e1; background-color: rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 6px; display: inline-block;">
                      📅 ${todayFormatted}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Saludo y Explicación -->
          <tr>
            <td style="padding: 22px 30px 14px 30px;">
              <p style="margin: 0 0 16px 0; font-size: 14.5px; color: #1e293b; line-height: 1.5;">
                Estimado(a) <strong>${adminName}</strong>,<br>
                A continuación se presenta el consolidado operativo de obras con pendientes. Para mayor claridad, se muestran <strong>únicamente los Supervisores y Capataces que presentan atrasos, faenas por vencer o firmas pendientes</strong> en el libro de obra.
              </p>

              <!-- Tarjetas de KPIs Generales -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 22px;">
                <tr>
                  <td width="25%" style="padding-right: 6px;">
                    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 10px; text-align: center;">
                      <div style="font-size: 22px; font-weight: 800; color: #dc2626;">${totalOverdue}</div>
                      <div style="font-size: 10.5px; font-weight: 700; color: #991b1b; text-transform: uppercase; margin-top: 2px;">🔴 Atrasadas</div>
                    </div>
                  </td>
                  <td width="25%" style="padding: 0 3px;">
                    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 10px; text-align: center;">
                      <div style="font-size: 22px; font-weight: 800; color: #b45309;">${totalUpcoming}</div>
                      <div style="font-size: 10.5px; font-weight: 700; color: #92400e; text-transform: uppercase; margin-top: 2px;">🟡 Por Vencer</div>
                    </div>
                  </td>
                  <td width="25%" style="padding: 0 3px;">
                    <div style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px 10px; text-align: center;">
                      <div style="font-size: 22px; font-weight: 800; color: #c2410c;">${totalUnsigned}</div>
                      <div style="font-size: 10.5px; font-weight: 700; color: #9a3412; text-transform: uppercase; margin-top: 2px;">✍️ Sin Firma</div>
                    </div>
                  </td>
                  <td width="25%" style="padding-left: 6px;">
                    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 10px; text-align: center;">
                      <div style="font-size: 22px; font-weight: 800; color: #16a34a;">${alertWorkers.length}</div>
                      <div style="font-size: 10.5px; font-weight: 700; color: #166534; text-transform: uppercase; margin-top: 2px;">👷 Con Alertas</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Tabla Consolidada por Supervisor / Capataz -->
              <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                  <thead>
                    <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1;">
                      <th align="left" style="padding: 10px 14px; font-size: 11.5px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">
                        Supervisor / Capataz y Obras
                      </th>
                      <th align="center" style="padding: 10px 10px; font-size: 11.5px; font-weight: 800; color: #dc2626; text-transform: uppercase; width: 75px;">
                        Atrasadas
                      </th>
                      <th align="center" style="padding: 10px 10px; font-size: 11.5px; font-weight: 800; color: #b45309; text-transform: uppercase; width: 80px;">
                        Por Vencer
                      </th>
                      <th align="center" style="padding: 10px 10px; font-size: 11.5px; font-weight: 800; color: #c2410c; text-transform: uppercase; width: 80px;">
                        Firmas
                      </th>
                      <th align="right" style="padding: 10px 14px; font-size: 11.5px; font-weight: 800; color: #475569; text-transform: uppercase; width: 130px;">
                        Diagnóstico
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml}
                  </tbody>
                </table>
              </div>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0 10px 0;">
                <tr>
                  <td align="center">
                    <a href="${APP_URL}/master-plan" target="_blank" style="display: inline-block; background-color: #0d1b40; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 10px rgba(13,27,64,0.25); text-transform: uppercase; letter-spacing: 0.5px;">
                      📊 Ingresar al Panel de Gestión y Control de Obras
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <span style="font-size: 11px; color: #64748b;">Enlace directo: <a href="${APP_URL}/master-plan" style="color: #0284c7; text-decoration: underline;">${APP_URL}/master-plan</a></span>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 30px; text-align: center;">
              <p style="margin: 0; font-size: 11.5px; color: #64748b; line-height: 1.5;">
                Informe ejecutivo confidencial para el equipo de Administración de <strong>DGC Montajes</strong>.<br>
                Santiago de Chile · Generado automáticamente por el Sistema de Control de Obras.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Consulta las actividades pendientes / por vencer para los proyectos dados.
 */
function getPendingActivitiesForProjects(projects = [], callback) {
  if (!projects || projects.length === 0) {
    // Si no tiene proyectos restringidos (ej. admin), traer todas las actividades pendientes críticas
    const sql = `
      SELECT id, project, tower, floor, activity, start_date, end_date, planned_qty, executed_qty, unit, status, restrictions
      FROM master_items
      WHERE status != 'completado'
        AND executed_qty < planned_qty
        AND end_date != ''
      ORDER BY end_date ASC
      LIMIT 10
    `;
    db.all(sql, [], callback);
    return;
  }

  const placeholders = projects.map(() => "?").join(",");
  const sql = `
    SELECT id, project, tower, floor, activity, start_date, end_date, planned_qty, executed_qty, unit, status, restrictions
    FROM master_items
    WHERE project IN (${placeholders})
      AND status != 'completado'
      AND executed_qty < planned_qty
      AND end_date != ''
    ORDER BY end_date ASC
    LIMIT 15
  `;
  db.all(sql, projects, callback);
}

/**
 * Consulta la cantidad de reportes diarios que están pendientes de firma de capataz.
 */
function getUnsignedLogsCountForProjects(projects = [], callback) {
  if (!projects || projects.length === 0) {
    const sql = `
      SELECT count(*) as count
      FROM daily_logs
      WHERE (capataz_signature IS NULL OR capataz_signature = '')
    `;
    db.get(sql, [], (err, row) => {
      if (err) return callback(err);
      callback(null, row ? row.count : 0);
    });
    return;
  }

  const placeholders = projects.map(() => "?").join(",");
  const sql = `
    SELECT count(*) as count
    FROM daily_logs
    WHERE project IN (${placeholders})
      AND (capataz_signature IS NULL OR capataz_signature = '')
  `;
  db.get(sql, projects, (err, row) => {
    if (err) return callback(err);
    callback(null, row ? row.count : 0);
  });
}

/**
 * Envía un correo de prueba a un administrador o dirección especificada.
 */
async function sendTestEmail({ targetEmail, type = "monday", adminUser = {} }) {
  const transporter = createTransporter();
  const from = process.env.MAIL_FROM || `"Control de Obras DGC" <${process.env.SMTP_USER}>`;

  let subject = "";
  let html = "";

  const userName = adminUser.full_name || "Administrador DGC";
  const role = adminUser.role || "admin";

  if (type === "monday") {
    subject = "📋 [PRUEBA ADMIN] Recordatorio: Planificación semanal y carga de actividades";
    // Muestra proyectos de muestra o del admin
    const projects = parseAllowedProjects(adminUser.allowed_projects);
    const displayProjects = projects.length > 0 ? projects : ["Mackenna Oriente", "El Sauce III", "Vic. Mac. Norte"];
    html = getMondayReminderHtml({ userName, role, projects: displayProjects });

    const info = await transporter.sendMail({
      from,
      to: targetEmail,
      subject,
      html,
    });
    return { success: true, type, targetEmail, messageId: info.messageId, subject };
  } else if (type === "activities") {
    subject = "⚠️ [PRUEBA ADMIN] Alerta de actividades pendientes o por vencer";

    // Obtener actividades de la base de datos para la prueba
    const activities = await new Promise((resolve, reject) => {
      getPendingActivitiesForProjects([], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    html = getOverdueActivitiesHtml({ userName, role, activities: activities.slice(0, 5) });

    const info = await transporter.sendMail({
      from,
      to: targetEmail,
      subject,
      html,
    });
    return { success: true, type, targetEmail, messageId: info.messageId, subject };
  } else if (type === "admin_summary") {
    return await sendAdminExecutiveSummary({ targetEmail, adminUser });
  } else if (type === "both") {
    // Enviar ambos correos
    const res1 = await sendTestEmail({ targetEmail, type: "monday", adminUser });
    const res2 = await sendTestEmail({ targetEmail, type: "activities", adminUser });
    return { success: true, type: "both", results: [res1, res2] };
  }

  throw new Error(`Tipo de correo no válido: ${type}`);
}

/**
 * Genera el HTML de previsualización sin enviar correo.
 */
async function previewEmailHtml({ type = "monday", adminUser = {} }) {
  const userName = adminUser.full_name || "Benjamín Astroza (Admin)";
  const role = adminUser.role || "admin";

  if (type === "admin_summary") {
    const auditData = await getAuditedWorkersStatus();
    return getAdminExecutiveSummaryHtml({
      adminName: userName,
      auditData,
    });
  }

  if (type === "monday") {
    const projects = parseAllowedProjects(adminUser.allowed_projects);
    const displayProjects = projects.length > 0 ? projects : ["Mackenna Oriente", "El Sauce III", "Vic. Mac. Norte"];
    return getMondayReminderHtml({ userName, role, projects: displayProjects });
  }

  const activities = await new Promise((resolve, reject) => {
    getPendingActivitiesForProjects([], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

  return getOverdueActivitiesHtml({ userName, role, activities: activities.slice(0, 5) });
}

/**
 * Inicializa las tareas automáticas cron en el servidor.
 * - Lunes a las 08:00 AM (Chile): Recordatorio semanal.
 * - Lunes a Viernes a las 08:30 AM (Chile): Alertas de actividades.
 */
let cronMondayJob = null;
let cronActivitiesJob = null;

function initReminderCronJobs() {
  const TIMEZONE = "America/Santiago";

  // Lunes a las 08:00 AM: '0 8 * * 1'
  cronMondayJob = cron.schedule(
    "0 8 * * 1",
    async () => {
      console.log("[CRON] Ejecutando recordatorio semanal de lunes 08:00 AM...");
      try {
        await executeMondayCronBatch();
      } catch (err) {
        console.error("[CRON ERROR] Error en lote semanal de lunes:", err.message);
      }
    },
    { timezone: TIMEZONE }
  );

  // Lunes a Viernes a las 08:30 AM: '30 8 * * 1-5'
  cronActivitiesJob = cron.schedule(
    "30 8 * * 1-5",
    async () => {
      console.log("[CRON] Ejecutando alerta diaria de actividades 08:30 AM...");
      try {
        await executeActivitiesCronBatch();
      } catch (err) {
        console.error("[CRON ERROR] Error en alerta diaria de actividades:", err.message);
      }
    },
    { timezone: TIMEZONE }
  );

  console.log("Tareas cron de recordatorios por correo inicializadas (Zona Horaria: America/Santiago).");
}

async function executeMondayCronBatch(targetUserIds = null) {
  const transporter = createTransporter();
  const from = process.env.MAIL_FROM || `"Control de Obras DGC" <${process.env.SMTP_USER}>`;

  const hasSpecificIds = Array.isArray(targetUserIds) && targetUserIds.length > 0;
  const sql = hasSpecificIds
    ? `SELECT id, full_name, email, role, allowed_projects FROM users WHERE active = 1 AND id IN (${targetUserIds.map(() => '?').join(',')})`
    : `SELECT id, full_name, email, role, allowed_projects FROM users WHERE active = 1 AND role IN ('supervisor', 'viewer')`;
  const params = hasSpecificIds ? targetUserIds : [];

  // Buscar usuarios seleccionados o todos los activos
  const users = await new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

  const logs = [];

  for (const user of users) {
    if (!user.email) continue;
    try {
      const projects = parseAllowedProjects(user.allowed_projects);
      const html = getMondayReminderHtml({
        userName: user.full_name,
        role: user.role,
        projects,
      });

      await transporter.sendMail({
        from,
        to: user.email,
        subject: "📋 [DGC Montajes] Recordatorio: Planificación semanal y carga de actividades",
        html,
      });

      console.log(`[CRON] Recordatorio de lunes enviado a: ${user.email}`);
      logs.push({ user: user.full_name, email: user.email, status: "sent", projectsCount: projects.length });

      // Pausa de 500ms entre correos para no saturar SMTP de Gmail
      await new Promise((r) => setTimeout(r, 500));
    } catch (sendErr) {
      console.error(`[CRON ERROR] Falló envío de lunes a ${user.email}:`, sendErr.message);
      logs.push({ user: user.full_name, email: user.email, status: "failed", error: sendErr.message });
    }
  }

  return { total: users.length, sent: logs.filter((l) => l.status === "sent").length, logs };
}

async function executeActivitiesCronBatch(targetUserIds = null) {
  const transporter = createTransporter();
  const from = process.env.MAIL_FROM || `"Control de Obras DGC" <${process.env.SMTP_USER}>`;

  const hasSpecificIds = Array.isArray(targetUserIds) && targetUserIds.length > 0;
  const sql = hasSpecificIds
    ? `SELECT id, full_name, email, role, allowed_projects FROM users WHERE active = 1 AND id IN (${targetUserIds.map(() => '?').join(',')})`
    : `SELECT id, full_name, email, role, allowed_projects FROM users WHERE active = 1 AND role IN ('supervisor', 'viewer')`;
  const params = hasSpecificIds ? targetUserIds : [];

  const users = await new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

  const logs = [];

  for (const user of users) {
    if (!user.email) continue;
    try {
      const projects = parseAllowedProjects(user.allowed_projects);
      if (projects.length === 0) {
        logs.push({ user: user.full_name, email: user.email, status: "skipped", reason: "Sin proyectos asignados" });
        continue;
      }

      const activities = await new Promise((resolve, reject) => {
        getPendingActivitiesForProjects(projects, (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });

      const unsignedLogsCount = await new Promise((resolve) => {
        getUnsignedLogsCountForProjects(projects, (err, count) => {
          resolve(count || 0);
        });
      });

      if (activities.length === 0 && unsignedLogsCount === 0) {
        logs.push({ user: user.full_name, email: user.email, status: "skipped", reason: "Sin actividades críticas ni firmas pendientes" });
        continue;
      }

      const html = getOverdueActivitiesHtml({
        userName: user.full_name,
        role: user.role,
        activities,
        unsignedLogsCount,
      });

      let subject = `⚠️ [DGC Montajes] `;
      if (activities.length > 0 && unsignedLogsCount > 0) {
        subject += `${activities.length} faena(s) críticas · ${unsignedLogsCount} firma(s) pendiente(s)`;
      } else if (activities.length > 0) {
        subject += `Tienes ${activities.length} actividad(es) pendientes por vencer`;
      } else {
        subject += `Tienes ${unsignedLogsCount} reporte(s) diario(s) pendientes de firma`;
      }

      await transporter.sendMail({
        from,
        to: user.email,
        subject,
        html,
      });

      console.log(`[CRON] Alerta de actividades enviada a: ${user.email} (${activities.length} faenas, ${unsignedLogsCount} firmas)`);
      logs.push({ user: user.full_name, email: user.email, status: "sent", activitiesCount: activities.length, unsignedLogsCount, projects });

      // Pausa de 500ms entre correos
      await new Promise((r) => setTimeout(r, 500));
    } catch (sendErr) {
      console.error(`[CRON ERROR] Falló alerta de actividades a ${user.email}:`, sendErr.message);
      logs.push({ user: user.full_name, email: user.email, status: "failed", error: sendErr.message });
    }
  }

  // Al finalizar el envío de terreno a las 08:30 AM, enviar automáticamente el Resumen Ejecutivo
  // a los administradores dgc@dgcelectricidad.cl e igs@dgcelectricidad.cl ÚNICAMENTE si existen alertas
  if (!hasSpecificIds) {
    try {
      console.log("[CRON 08:30 AM] Verificando pendientes de obras para envío a Administradores (dgc@dgcelectricidad.cl, igs@dgcelectricidad.cl)...");
      const summaryResult = await sendAdminExecutiveSummary({
        targetEmails: ["dgc@dgcelectricidad.cl", "igs@dgcelectricidad.cl"],
        onlyIfAlerts: true,
      });

      if (summaryResult.skipped) {
        console.log(`[CRON 08:30 AM] ${summaryResult.reason} -> No se enviaron correos a administradores.`);
      } else {
        console.log(`[CRON 08:30 AM] Resumen Ejecutivo enviado exitosamente a: ${summaryResult.destinations.join(", ")} (${summaryResult.auditSummary.workersWithAlerts} responsables con alertas).`);
      }
    } catch (adminErr) {
      console.error("[CRON ERROR] Error enviando Resumen Ejecutivo a Administradores:", adminErr.message);
    }
  }

  return { total: users.length, sent: logs.filter((l) => l.status === "sent").length, logs };
}

/**
 * Simula el correo real de un supervisor o capataz específico, pero enviándolo
 * al correo del administrador solicitante para verificar los datos reales sin spamear.
 */
async function simulateSingleUserReminder({ simulateUserId, targetEmail, type = "activities" }) {
  const user = await new Promise((resolve, reject) => {
    db.get(
      "SELECT id, full_name, email, role, allowed_projects FROM users WHERE id = ? AND active = 1",
      [simulateUserId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });

  if (!user) throw new Error("Usuario no encontrado o inactivo.");

  const transporter = createTransporter();
  const from = process.env.MAIL_FROM || `"Control de Obras DGC" <${process.env.SMTP_USER}>`;
  const projects = parseAllowedProjects(user.allowed_projects);

  if (type === "monday") {
    const html = getMondayReminderHtml({
      userName: user.full_name,
      role: user.role,
      projects,
    });

    const simulationBanner = `
      <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 18px; margin: 16px auto; max-width: 620px; font-family: sans-serif; font-size: 13px; color: #1e40af;">
        <strong>ℹ️ SIMULACIÓN DE DATOS REALES:</strong> Este correo fue generado con los datos de <strong>${user.full_name}</strong> (${user.role} - ${user.email}) y sus obras asignadas (<em>${projects.join(", ") || "Sin obras"}</em>), pero redirigido a tu bandeja para que verifiques el contenido exacto.
      </div>
    `;

    await transporter.sendMail({
      from,
      to: targetEmail,
      subject: `📋 [SIMULACIÓN REAL: ${user.full_name}] Recordatorio de planificación semanal`,
      html: simulationBanner + html,
    });

    return { success: true, simulatedUser: user.full_name, role: user.role, projects, targetEmail };
  } else {
    const activities = await new Promise((resolve, reject) => {
      getPendingActivitiesForProjects(projects, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    const unsignedLogsCount = await new Promise((resolve) => {
      getUnsignedLogsCountForProjects(projects, (err, count) => {
        resolve(count || 0);
      });
    });

    const html = getOverdueActivitiesHtml({
      userName: user.full_name,
      role: user.role,
      activities,
      unsignedLogsCount,
    });

    const simulationBanner = `
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px 18px; margin: 16px auto; max-width: 680px; font-family: sans-serif; font-size: 13px; color: #991b1b;">
        <strong>ℹ️ SIMULACIÓN DE DATOS REALES:</strong> Este correo contiene las <strong>${activities.length} actividades</strong> y <strong>${unsignedLogsCount} firmas pendientes</strong> de las obras asignadas a <strong>${user.full_name}</strong> (${user.role} - ${user.email}): <em>${projects.join(", ")}</em>. Fue redirigido a tu correo para comprobar la exactitud de los datos.
      </div>
    `;

    await transporter.sendMail({
      from,
      to: targetEmail,
      subject: `⚠️ [SIMULACIÓN REAL: ${user.full_name}] ${activities.length} faenas críticas · ${unsignedLogsCount} firmas pendientes`,
      html: simulationBanner + html,
    });

    return {
      success: true,
      simulatedUser: user.full_name,
      role: user.role,
      activitiesCount: activities.length,
      unsignedLogsCount,
      projects,
      targetEmail,
    };
  }
}

/**
 * Envía el informe detallado de una obra específica a un Administrador.
 */
async function sendProjectReportToAdmin({ projectName, targetEmail, adminUser = {} }) {
  if (!projectName) throw new Error("Debe especificar el nombre de la obra.");
  if (!targetEmail) throw new Error("Debe especificar el correo del destinatario.");

  // Buscar información de la obra
  const project = await new Promise((resolve, reject) => {
    db.get(
      "SELECT id, name, supervisor, capataz, client FROM projects WHERE name = ?",
      [projectName],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });

  const supervisorName = project?.supervisor || "No asignado";
  const capatazName = project?.capataz || "No asignado";

  // Buscar actividades pendientes de la obra
  const activities = await new Promise((resolve, reject) => {
    getPendingActivitiesForProjects([projectName], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

  // Buscar firmas pendientes en reportes diarios de la obra
  const unsignedLogsCount = await new Promise((resolve) => {
    getUnsignedLogsCountForProjects([projectName], (err, count) => {
      resolve(count || 0);
    });
  });

  const transporter = createTransporter();
  const from = process.env.MAIL_FROM || `"Control de Obras DGC" <${process.env.SMTP_USER}>`;

  const html = getOverdueActivitiesHtml({
    userName: adminUser.full_name || "Administración DGC",
    role: "admin",
    activities,
    unsignedLogsCount,
    projectName,
    supervisorName,
    capatazName,
  });

  const adminBanner = `
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 18px; margin: 16px auto; max-width: 680px; font-family: sans-serif; font-size: 13px; color: #166534;">
      <strong>🏢 INFORME OPERATIVO DE OBRA:</strong> Este es el estado crítico de la obra <strong>${projectName}</strong> (Supervisor: <em>${supervisorName}</em> · Capataz: <em>${capatazName}</em>).
    </div>
  `;

  await transporter.sendMail({
    from,
    to: targetEmail,
    subject: `📊 [INFORME OBRA: ${projectName}] ${activities.length} faena(s) críticas · ${unsignedLogsCount} firma(s) pendiente(s)`,
    html: adminBanner + html,
  });

  return {
    success: true,
    projectName,
    supervisorName,
    capatazName,
    activitiesCount: activities.length,
    unsignedLogsCount,
    targetEmail,
  };
}

/**
 * Retorna la lista auditada de supervisores y capataces antes de enviar correos masivos.
 */
async function getAuditedWorkersStatus() {
  const workers = await new Promise((resolve, reject) => {
    db.all(
      "SELECT id, full_name, email, role, allowed_projects FROM users WHERE active = 1 AND role IN ('supervisor', 'viewer') ORDER BY role ASC, full_name ASC",
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const auditList = [];

  for (const worker of workers) {
    const projects = parseAllowedProjects(worker.allowed_projects);
    if (!worker.email) {
      auditList.push({
        id: worker.id,
        fullName: worker.full_name,
        email: "Sin correo registrado",
        role: worker.role === "supervisor" ? "Supervisor" : "Capataz",
        projects,
        overdueCount: 0,
        upcomingCount: 0,
        unsignedLogsCount: 0,
        totalCritical: 0,
        shouldSend: false,
        statusText: "Sin correo",
        badgeVariant: "secondary",
      });
      continue;
    }

    if (projects.length === 0) {
      auditList.push({
        id: worker.id,
        fullName: worker.full_name,
        email: worker.email,
        role: worker.role === "supervisor" ? "Supervisor" : "Capataz",
        projects,
        overdueCount: 0,
        upcomingCount: 0,
        unsignedLogsCount: 0,
        totalCritical: 0,
        shouldSend: false,
        statusText: "Sin obras asignadas",
        badgeVariant: "secondary",
      });
      continue;
    }

    const activities = await new Promise((resolve) => {
      getPendingActivitiesForProjects(projects, (err, rows) => {
        resolve(rows || []);
      });
    });

    let overdueCount = 0;
    let upcomingCount = 0;

    for (const act of activities) {
      if (!act.end_date) continue;
      if (act.end_date < todayStr) {
        overdueCount++;
      } else {
        upcomingCount++;
      }
    }

    const unsignedLogsCount = await new Promise((resolve) => {
      getUnsignedLogsCountForProjects(projects, (err, count) => {
        resolve(count || 0);
      });
    });

    const shouldSend = overdueCount > 0 || upcomingCount > 0 || unsignedLogsCount > 0;

    let statusText = "Al día (Omitido)";
    let badgeVariant = "success";

    if (shouldSend) {
      if (overdueCount > 0) {
        statusText = `🔴 ${overdueCount} atrasada(s)`;
        badgeVariant = "destructive";
      } else if (upcomingCount > 0) {
        statusText = `🟡 ${upcomingCount} por vencer`;
        badgeVariant = "warning";
      } else if (unsignedLogsCount > 0) {
        statusText = `✍️ ${unsignedLogsCount} firma(s)`;
        badgeVariant = "warning";
      }
    }

    auditList.push({
      id: worker.id,
      fullName: worker.full_name,
      email: worker.email,
      role: worker.role === "supervisor" ? "Supervisor" : "Capataz",
      projects,
      overdueCount,
      upcomingCount,
      unsignedLogsCount,
      totalCritical: activities.length,
      shouldSend,
      statusText,
      badgeVariant,
    });
  }

  const willSendCount = auditList.filter((a) => a.shouldSend).length;
  const willSkipCount = auditList.filter((a) => !a.shouldSend).length;

  return {
    total: auditList.length,
    willSendCount,
    willSkipCount,
    workers: auditList,
  };
}

/**
 * Envía el informe resumen ejecutivo a administradores.
 * - targetEmails: Array de correos específicos (ej: ["dgc@dgcelectricidad.cl", "igs@dgcelectricidad.cl"])
 * - targetEmail: "all_admins" | "executive_admins" | correo específico
 * - onlyIfAlerts: si es true, y no hay trabajadores con alertas ni firmas pendientes, no envía nada.
 */
async function sendAdminExecutiveSummary({
  targetEmail = null,
  targetEmails = null,
  adminUser = {},
  onlyIfAlerts = false,
}) {
  const auditData = await getAuditedWorkersStatus();

  // Si onlyIfAlerts es true y no hay trabajadores con atrasos ni firmas pendientes, omitir el envío
  if (onlyIfAlerts && (!auditData.willSendCount || auditData.willSendCount === 0)) {
    return {
      success: true,
      skipped: true,
      reason: "Todas las obras están al día. No se registran atrasos, faenas por vencer ni firmas pendientes.",
      totalSent: 0,
      destinations: [],
      auditSummary: {
        totalWorkers: auditData.total,
        workersWithAlerts: 0,
      },
    };
  }

  const transporter = createTransporter();
  const from = process.env.MAIL_FROM || `"Control de Obras DGC" <${process.env.SMTP_USER}>`;

  let destinations = [];

  const explicitList = Array.isArray(targetEmails) && targetEmails.length > 0
    ? targetEmails
    : targetEmail === "executive_admins"
    ? ["dgc@dgcelectricidad.cl", "igs@dgcelectricidad.cl"]
    : null;

  if (explicitList) {
    const placeholders = explicitList.map(() => "?").join(",");
    const rows = await new Promise((resolve) => {
      db.all(
        `SELECT email, full_name FROM users WHERE LOWER(TRIM(email)) IN (${placeholders})`,
        explicitList.map((e) => String(e).toLowerCase().trim()),
        (err, res) => resolve(res || [])
      );
    });

    destinations = explicitList.map((target) => {
      const match = rows.find(
        (r) => r.email && r.email.toLowerCase().trim() === String(target).toLowerCase().trim()
      );
      return {
        email: String(target).trim(),
        name: match?.full_name || "Administrador DGC",
      };
    });
  } else if (targetEmail === "all_admins") {
    const admins = await new Promise((resolve, reject) => {
      db.all(
        "SELECT email, full_name FROM users WHERE role = 'admin' AND active = 1",
        [],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });
    destinations = admins.filter((a) => a.email && a.email.includes("@")).map((a) => ({
      email: a.email,
      name: a.full_name,
    }));
  } else {
    const email = (targetEmail && targetEmail.trim()) || adminUser.email;
    if (!email) throw new Error("No se especificó un correo de destino para el informe.");
    destinations = [{ email, name: adminUser.full_name || "Administrador DGC" }];
  }

  const results = [];
  for (const dest of destinations) {
    const html = getAdminExecutiveSummaryHtml({
      adminName: dest.name,
      auditData,
    });

    const info = await transporter.sendMail({
      from,
      to: dest.email,
      subject: `📊 [RESUMEN EJECUTIVO DGC] Estado de Obras y Terreno · ${auditData.willSendCount} responsable(s) con alertas`,
      html,
    });

    results.push({ email: dest.email, messageId: info.messageId });
    await new Promise((r) => setTimeout(r, 400));
  }

  return {
    success: true,
    totalSent: results.length,
    destinations: results.map((r) => r.email),
    auditSummary: {
      totalWorkers: auditData.total,
      workersWithAlerts: auditData.willSendCount,
    },
  };
}

module.exports = {
  createTransporter,
  getMondayReminderHtml,
  getOverdueActivitiesHtml,
  getAdminExecutiveSummaryHtml,
  getPendingActivitiesForProjects,
  getUnsignedLogsCountForProjects,
  getAuditedWorkersStatus,
  sendAdminExecutiveSummary,
  sendProjectReportToAdmin,
  sendTestEmail,
  previewEmailHtml,
  initReminderCronJobs,
  executeMondayCronBatch,
  executeActivitiesCronBatch,
  simulateSingleUserReminder,
};

