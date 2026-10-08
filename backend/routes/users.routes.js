const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db/connection");

const router = express.Router();

// Middleware: solo admins pueden acceder
function requireAdmin(req, res, next) {
  const userEmail = req.headers["x-user-email"];

  if (!userEmail) {
    return res.status(401).json({ error: "No autorizado." });
  }

  db.get(
    "SELECT role FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND active = 1",
    [userEmail],
    (err, user) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Acceso denegado. Se requiere rol administrador." });
      }
      next();
    }
  );
}

//Middleware: cualquier usuario autenticado
function requireAuth(req, res, next) {
  const userEmail = req.headers["x-user-email"];
  if (!userEmail) {
    return res.status(401).json({error: "No autorizado."})
  }
  next();
}

// GET /api/users/list?role=supervisor o ?roles=supervisor,admin — para dropdowns
router.get("/list", requireAuth, (req, res) => {
  const { role, roles } = req.query;
  let sql = "SELECT id, full_name, email, role FROM users WHERE active = 1";
  const params = [];

  const rawRoles = roles || role;
  if (rawRoles) {
    const roleList = Array.isArray(rawRoles)
      ? rawRoles
      : String(rawRoles)
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean);

    if (roleList.length === 1) {
      sql += " AND role = ?";
      params.push(roleList[0]);
    } else if (roleList.length > 1) {
      const placeholders = roleList.map(() => "?").join(",");
      sql += ` AND role IN (${placeholders})`;
      params.push(...roleList);
    }
  }

  sql += " ORDER BY full_name ASC";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET /api/users — listar todos
router.get("/", requireAdmin, (req, res) => {
  db.all(
    "SELECT id, email, full_name, role, allowed_projects, active, last_seen, created_at FROM users ORDER BY full_name ASC",
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows.map((u) => ({
        ...u,
        allowed_projects: JSON.parse(u.allowed_projects || "[]"),
      })));
    }
  );
});

// POST /api/users/heartbeat — registrar presencia activa del usuario
router.post("/heartbeat", (req, res) => {
  const userEmail = req.headers["x-user-email"] || req.body?.email;

  if (!userEmail) {
    return res.status(401).json({ error: "No autorizado. Falta identificación del usuario." });
  }

  const nowIso = new Date().toISOString();
  db.run(
    "UPDATE users SET last_seen = ? WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))",
    [nowIso, userEmail],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true, last_seen: nowIso });
    }
  );
});

// POST /api/users — crear usuario
router.post("/", requireAdmin, async (req, res) => {
  const { email, password, full_name, role, allowed_projects } = req.body;

  if (!email || !password || !full_name) {
    return res.status(400).json({ error: "Email, contraseña y nombre son requeridos." });
  }

  // Verificar email duplicado
  db.get(
    "SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))",
    [email],
    async (err, existing) => {
      if (err) return res.status(500).json({ error: err.message });
      if (existing) {
        return res.status(409).json({ error: `Ya existe un usuario con el email "${email}".` });
      }

      const hash = await bcrypt.hash(password, 10);

      db.run(
        `INSERT INTO users (email, password_hash, full_name, role, allowed_projects) VALUES (?, ?, ?, ?, ?)`,
        [
          email.trim().toLowerCase(),
          hash,
          full_name,
          role || "viewer",
          JSON.stringify(allowed_projects || []),
        ],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.status(201).json({
            id: this.lastID,
            email: email.trim().toLowerCase(),
            full_name,
            role: role || "viewer",
            allowed_projects: allowed_projects || [],
            active: true,
          });
        }
      );
    }
  );
});

// PUT /api/users/:id — editar usuario
router.put("/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { email, password, full_name, role, allowed_projects, active } = req.body;

  if (!email || !full_name) {
    return res.status(400).json({ error: "Email y nombre son requeridos." });
  }

  // Verificar email duplicado excluyendo el propio
  db.get(
    "SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND id != ?",
    [email, id],
    async (err, existing) => {
      if (err) return res.status(500).json({ error: err.message });
      if (existing) {
        return res.status(409).json({ error: `Ya existe un usuario con el email "${email}".` });
      }

      // Si viene nueva contraseña, hashearla
      let hashUpdate = "";
      const params = [];

      if (password && password.trim() !== "") {
        const hash = await bcrypt.hash(password, 10);
        hashUpdate = ", password_hash = ?";
        params.push(hash);
      }

      const sql = `
        UPDATE users
        SET email = ?, full_name = ?, role = ?, allowed_projects = ?, active = ?${hashUpdate}
        WHERE id = ?
      `;

      params.unshift(
        email.trim().toLowerCase(),
        full_name,
        role || "viewer",
        JSON.stringify(allowed_projects || []),
        active !== undefined ? (active ? 1 : 0) : 1
      );
      params.push(id);

      db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Usuario no encontrado." });

        res.json({
          id: Number(id),
          email: email.trim().toLowerCase(),
          full_name,
          role: role || "viewer",
          allowed_projects: allowed_projects || [],
          active: active !== undefined ? Boolean(active) : true,
        });
      });
    }
  );
});

// DELETE /api/users/:id — eliminar usuario
router.delete("/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const userEmail = req.headers["x-user-email"];

  // No permitir que el admin se elimine a sí mismo
  db.get("SELECT email FROM users WHERE id = ?", [id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado." });

    if (user.email.toLowerCase() === userEmail.toLowerCase()) {
      return res.status(400).json({ error: "No puedes eliminar tu propio usuario." });
    }

    db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Usuario eliminado.", deleted_id: Number(id) });
    });
  });
});

module.exports = router;