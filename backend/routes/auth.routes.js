const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db/connection");

const router = express.Router();

function normalizeStr(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña son requeridos." });
  }

  // Permite autenticarse por email exacto, prefijo de correo (ej: 'bap') o nombre (ej: 'benjamin', 'Benjamín Astroza')
  db.all(
    "SELECT * FROM users WHERE active = 1",
    [],
    async (err, users) => {
      if (err) return res.status(500).json({ error: err.message });

      const normTerm = normalizeStr(email);

      const user = (users || []).find((u) => {
        const uEmail = normalizeStr(u.email);
        const uEmailPrefix = uEmail.split("@")[0];
        const uName = normalizeStr(u.full_name);

        return (
          uEmail === normTerm ||
          uEmailPrefix === normTerm ||
          uName === normTerm ||
          (normTerm.length >= 3 && uName.includes(normTerm))
        );
      });

      if (!user) {
        return res.status(401).json({ error: "Credenciales inválidas." });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        return res.status(401).json({ error: "Credenciales inválidas." });
      }

      const nowIso = new Date().toISOString();
      db.run("UPDATE users SET last_seen = ? WHERE id = ?", [nowIso, user.id]);

      res.json({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        allowed_projects: JSON.parse(user.allowed_projects || "[]"),
      });
    }
  );
});

router.get("/me", (req, res) => {
  const emailHeader = req.headers["x-user-email"];

  if (!emailHeader) {
    return res.status(401).json({ error: "No autorizado. Falta cabecera x-user-email." });
  }

  const normTerm = normalizeStr(emailHeader);

  db.all(
    "SELECT * FROM users WHERE active = 1",
    [],
    (err, users) => {
      if (err) return res.status(500).json({ error: err.message });

      const user = (users || []).find((u) => {
        const uEmail = normalizeStr(u.email);
        const uEmailPrefix = uEmail.split("@")[0];
        const uName = normalizeStr(u.full_name);

        return (
          uEmail === normTerm ||
          uEmailPrefix === normTerm ||
          uName === normTerm ||
          (normTerm.length >= 3 && uName.includes(normTerm))
        );
      });

      if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado o inactivo." });
      }

      const nowIso = new Date().toISOString();
      db.run("UPDATE users SET last_seen = ? WHERE id = ?", [nowIso, user.id]);

      res.json({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        allowed_projects: JSON.parse(user.allowed_projects || "[]"),
      });
    }
  );
});

module.exports = router;