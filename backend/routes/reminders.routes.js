const express = require("express");
const db = require("../db/connection");
const {
  sendTestEmail,
  previewEmailHtml,
  executeMondayCronBatch,
  executeActivitiesCronBatch,
  simulateSingleUserReminder,
  getAuditedWorkersStatus,
  sendProjectReportToAdmin,
  sendAdminExecutiveSummary,
} = require("../services/reminderEmail.service");

const router = express.Router();

// Middleware: solo administradores pueden gestionar recordatorios
function requireAdmin(req, res, next) {
  const userEmail = req.headers["x-user-email"];

  if (!userEmail) {
    return res.status(401).json({ error: "No autorizado. Falta cabecera x-user-email." });
  }

  db.get(
    "SELECT id, full_name, email, role, allowed_projects FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND active = 1",
    [userEmail],
    (err, user) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Acceso denegado. Se requiere rol de administrador." });
      }
      req.adminUser = user;
      next();
    }
  );
}

/**
 * GET /api/reminders/recipients-audit
 * Retorna la lista previa de supervisores y capataces antes de enviar correos
 */
router.get("/recipients-audit", requireAdmin, async (req, res) => {
  try {
    const data = await getAuditedWorkersStatus();
    res.json(data);
  } catch (error) {
    console.error("Error al auditar destinatarios:", error);
    res.status(500).json({ error: error.message || "Error al auditar destinatarios." });
  }
});

/**
 * POST /api/reminders/send-project-report
 * Envía el informe de control de una obra específica a un Administrador
 */
router.post("/send-project-report", requireAdmin, async (req, res) => {
  const { projectName, targetEmail } = req.body;
  const adminUser = req.adminUser;
  const destination = (targetEmail && targetEmail.trim()) || adminUser.email;

  if (!projectName) {
    return res.status(400).json({ error: "Debe seleccionar una obra." });
  }

  try {
    const result = await sendProjectReportToAdmin({
      projectName,
      targetEmail: destination,
      adminUser,
    });
    res.json({
      success: true,
      message: `Informe de la obra "${projectName}" enviado exitosamente a ${destination}.`,
      result,
    });
  } catch (error) {
    console.error("Error al enviar informe de obra:", error);
    res.status(500).json({ error: error.message || "Error al enviar informe de obra." });
  }
});

/**
 * GET /api/reminders/preview?type=monday|activities
 * Previsualización directa en el navegador del HTML del correo
 */
router.get("/preview", requireAdmin, async (req, res) => {
  try {
    const type = req.query.type || "monday";
    const html = await previewEmailHtml({ type, adminUser: req.adminUser });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    res.status(500).send(`<h3>Error al generar vista previa: ${error.message}</h3>`);
  }
});

/**
 * POST /api/reminders/send-test
 * Envía un correo de prueba al administrador solicitante, a todos los admins, o a un correo específico
 */
router.post("/send-test", requireAdmin, async (req, res) => {
  const { targetEmail, type = "monday" } = req.body;
  const adminUser = req.adminUser;

  try {
    if (targetEmail === "all_admins") {
      const admins = await new Promise((resolve, reject) => {
        db.all(
          "SELECT email, full_name, role, allowed_projects FROM users WHERE role = 'admin' AND active = 1",
          [],
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
          }
        );
      });

      const results = [];
      for (const adm of admins) {
        if (!adm.email) continue;
        const result = await sendTestEmail({
          targetEmail: adm.email,
          type,
          adminUser: adm,
        });
        results.push(result);
      }

      return res.json({
        success: true,
        message: `Correo de prueba (${type}) enviado exitosamente a todos los administradores (${admins.length}).`,
        recipients: admins.map((a) => a.email),
        results,
      });
    }

    const destination = (targetEmail && targetEmail.trim()) || adminUser.email;
    const result = await sendTestEmail({
      targetEmail: destination,
      type,
      adminUser,
    });

    res.json({
      success: true,
      message: `Correo de prueba (${type}) enviado exitosamente a ${destination}.`,
      result,
    });
  } catch (error) {
    console.error("Error al enviar correo de prueba:", error);
    res.status(500).json({
      error: error.message || "Error al enviar correo de prueba.",
    });
  }
});

/**
 * POST /api/reminders/simulate-user
 * Simula el correo real de un supervisor o capataz específico con sus actividades reales de BD,
 * pero enviándolo al correo del administrador solicitante.
 */
router.post("/simulate-user", requireAdmin, async (req, res) => {
  const { simulateUserId, targetEmail, type = "activities" } = req.body;
  const adminUser = req.adminUser;
  const destination = (targetEmail && targetEmail.trim()) || adminUser.email;

  if (!simulateUserId) {
    return res.status(400).json({ error: "Debe indicar el usuario a simular (simulateUserId)." });
  }

  try {
    const result = await simulateSingleUserReminder({
      simulateUserId,
      targetEmail: destination,
      type,
    });
    res.json({
      success: true,
      message: `Simulación de ${result.simulatedUser} enviada con éxito a ${destination}.`,
      result,
    });
  } catch (error) {
    console.error("Error en simulación:", error);
    res.status(500).json({ error: error.message || "Error al simular correo." });
  }
});

/**
 * POST /api/reminders/trigger-now
 * Ejecuta en vivo el lote de correos para los supervisores/capataces seleccionados (o todos)
 */
router.post("/trigger-now", requireAdmin, async (req, res) => {
  const { type = "monday", userIds = null, copyToAdmin = false } = req.body;
  try {
    let summary;
    if (type === "monday") {
      summary = await executeMondayCronBatch(userIds);
    } else {
      summary = await executeActivitiesCronBatch(userIds);
    }

    // Enviar copia del Resumen Ejecutivo al Administrador si fue solicitada
    if (copyToAdmin && req.adminUser?.email) {
      try {
        await sendAdminExecutiveSummary({
          targetEmail: req.adminUser.email,
          adminUser: req.adminUser,
        });
      } catch (copyErr) {
        console.warn("No se pudo enviar resumen ejecutivo al admin:", copyErr.message);
      }
    }

    res.json({
      success: true,
      message: `Envío ejecutado exitosamente: ${summary.sent} correos enviados de ${summary.total} seleccionados.`,
      summary,
    });
  } catch (error) {
    console.error("Error en trigger-now:", error);
    res.status(500).json({ error: error.message || "Error al disparar lote de correos." });
  }
});

/**
 * POST /api/reminders/send-admin-summary
 * Envía el informe resumen ejecutivo a uno o a todos los administradores
 */
router.post("/send-admin-summary", requireAdmin, async (req, res) => {
  const { targetEmail = null, targetEmails = null, onlyIfAlerts = false } = req.body;
  try {
    const result = await sendAdminExecutiveSummary({
      targetEmail: targetEmail || (targetEmails ? null : req.adminUser.email),
      targetEmails,
      adminUser: req.adminUser,
      onlyIfAlerts,
    });
    if (result.skipped) {
      return res.json({
        success: true,
        skipped: true,
        message: result.reason,
        result,
      });
    }
    res.json({
      success: true,
      message: `Resumen ejecutivo enviado exitosamente a ${result.destinations.join(", ")}.`,
      result,
    });
  } catch (error) {
    console.error("Error al enviar resumen ejecutivo a administradores:", error);
    res.status(500).json({ error: error.message || "Error al enviar resumen ejecutivo." });
  }
});

module.exports = router;
