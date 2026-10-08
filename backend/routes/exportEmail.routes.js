const express = require("express");
const nodemailer = require("nodemailer");
const db = require("../db/connection");

const router = express.Router();
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const RETRYABLE_EMAIL_ERRORS = new Set([
  "ECONNECTION",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta configurar ${name}`);
  }
  return value;
}

function createTransporter() {
  return nodemailer.createTransport({
    host: getRequiredEnv("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    auth: {
      user: getRequiredEnv("SMTP_USER"),
      pass: getRequiredEnv("SMTP_PASS"),
    },
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAttachmentBuffer(fileBase64) {
  const buffer = Buffer.from(fileBase64, "base64");

  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `El archivo pesa ${(buffer.length / 1024 / 1024).toFixed(1)} MB y supera el limite de 20 MB para envio por correo.`
    );
  }

  return buffer;
}

async function sendMailWithRetry(mailOptions) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const transporter = createTransporter();
      return await transporter.sendMail(mailOptions);
    } catch (error) {
      lastError = error;
      const errorCode = error.code || error.errno;
      const shouldRetry = RETRYABLE_EMAIL_ERRORS.has(errorCode) && attempt < 3;

      if (!shouldRetry) {
        throw error;
      }

      await wait(attempt * 1500);
    }
  }

  throw lastError;
}

router.post("/excel", (req, res) => {
  const userEmail = req.headers["x-user-email"];
  const { filename, subject, fileBase64 } = req.body;

  if (!userEmail) {
    return res.status(401).json({ error: "No autorizado. Falta cabecera x-user-email." });
  }

  if (!filename || !subject || !fileBase64) {
    return res.status(400).json({ error: "Archivo, nombre y asunto son requeridos." });
  }

  db.get(
    "SELECT email, full_name FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND active = 1",
    [userEmail],
    async (err, user) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!user) return res.status(404).json({ error: "Usuario no encontrado o inactivo." });

      try {
        const from = process.env.MAIL_FROM || process.env.SMTP_USER;
        const attachmentBuffer = getAttachmentBuffer(fileBase64);

        await sendMailWithRetry({
          from,
          to: user.email,
          subject,
          text: `Hola ${user.full_name || ""},\n\nAdjuntamos el informe Excel solicitado desde Control de Obras DGC.\n`,
          attachments: [
            {
              filename,
              content: attachmentBuffer,
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          ],
        });

        res.json({ message: "Correo enviado correctamente.", to: user.email });
      } catch (error) {
        res.status(500).json({ error: error.message || "No se pudo enviar el correo." });
      }
    }
  );
});

router.post("/pdf", (req, res) => {
  const userEmail = req.headers["x-user-email"];
  const { filename, subject, fileBase64 } = req.body;

  if (!userEmail) {
    return res.status(401).json({ error: "No autorizado. Falta cabecera x-user-email." });
  }

  if (!filename || !subject || !fileBase64) {
    return res.status(400).json({ error: "Archivo, nombre y asunto son requeridos." });
  }

  db.get(
    "SELECT email, full_name FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND active = 1",
    [userEmail],
    async (err, user) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!user) return res.status(404).json({ error: "Usuario no encontrado o inactivo." });

      try {
        const from = process.env.MAIL_FROM || process.env.SMTP_USER;
        const attachmentBuffer = getAttachmentBuffer(fileBase64);

        await sendMailWithRetry({
          from,
          to: user.email,
          subject,
          text: `Hola ${user.full_name || ""},\n\nAdjuntamos el informe PDF solicitado desde Control de Obras DGC.\n`,
          attachments: [
            {
              filename,
              content: attachmentBuffer,
              contentType: "application/pdf",
            },
          ],
        });

        res.json({ message: "Correo enviado correctamente.", to: user.email });
      } catch (error) {
        res.status(500).json({ error: error.message || "No se pudo enviar el correo." });
      }
    }
  );
});

module.exports = router;
