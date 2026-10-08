const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db/connection");

const router = express.Router();

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña son requeridos." });
  }

  db.get(
    "SELECT * FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND active = 1",
    [email],
    async (err, user) => {
      if (err) return res.status(500).json({ error: err.message });

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
  const email = req.headers["x-user-email"];

  if (!email) {
    return res.status(401).json({ error: "No autorizado. Falta cabecera x-user-email." });
  }

  db.get(
    "SELECT * FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND active = 1",
    [email],
    (err, user) => {
      if (err) return res.status(500).json({ error: err.message });

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