const express = require("express");
const db = require("../db/connection");

let detectCategory = (name) => {
  const clean = String(name || "").trim().toUpperCase();
  if (clean.startsWith("CD") || clean.startsWith("CCDD") || clean.includes("CORRIENTES DÉBILES") || clean.includes("DEBILES")) return "CD";
  if (clean.startsWith("TC") || clean.includes("TELECOM") || clean.includes("TELECOMUNICACIONES")) return "TC";
  return "EL";
};

try {
  const def = require("../constants/defaultActivities");
  if (typeof def.detectCategory === "function") detectCategory = def.detectCategory;
} catch (e) {
  // fallback
}

const router = express.Router();

// Middleware: solo administradores
function requireAdmin(req, res, next) {
  const userEmail = req.headers["x-user-email"];

  if (!userEmail) {
    return res.status(401).json({ error: "No autorizado. Se requiere inicio de sesión." });
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

// Normaliza el nombre asegurando que inicie con el prefijo de categoría (EL, CD, TC)
function formatActivityName(name, category) {
  let clean = String(name || "").trim();
  const cat = String(category || "").toUpperCase().trim();

  // Si ya empieza con el código de categoría seguido de espacio, dos puntos o guión
  const prefixRegex = new RegExp(`^${cat}[\\s:–-]+`, "i");
  if (prefixRegex.test(clean)) {
    clean = clean.replace(prefixRegex, "").trim();
  }

  return `${cat} ${clean}`;
}

// GET /api/activities - Listar actividades
// Query params:
//   category: 'EL' | 'CD' | 'TC'
//   all: 'true' (incluye inactivas)
//   search: texto para buscar en el nombre
router.get("/", (req, res) => {
  const { category, all, search } = req.query;

  let sql = `
    SELECT 
      a.id, a.category, a.name, a.active, a.created_at,
      (
        (SELECT COUNT(*) FROM master_items mi WHERE mi.activity = a.name) +
        (SELECT COUNT(*) FROM daily_logs dl WHERE dl.activity = a.name)
      ) AS usage_count
    FROM activities a 
    WHERE 1=1
  `;
  const params = [];

  if (all !== "true") {
    sql += " AND a.active = 1";
  }

  if (category && ["EL", "CD", "TC"].includes(category.toUpperCase())) {
    sql += " AND a.category = ?";
    params.push(category.toUpperCase());
  }

  if (search && search.trim()) {
    sql += " AND a.name LIKE ?";
    params.push(`%${search.trim()}%`);
  }

  sql += " ORDER BY a.category ASC, a.name ASC";

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// POST /api/activities - Crear nueva actividad (Solo Admin)
router.post("/", requireAdmin, (req, res) => {
  const { name } = req.body;
  let { category } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "El nombre de la actividad es obligatorio." });
  }

  if (!category || !["EL", "CD", "TC"].includes(category.toUpperCase())) {
    category = detectCategory(name);
  } else {
    category = category.toUpperCase();
  }

  const formattedName = formatActivityName(name, category);

  // Verificar si ya existe (case-insensitive)
  db.get(
    "SELECT * FROM activities WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))",
    [formattedName],
    (err, existing) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (existing) {
        if (existing.active === 1) {
          return res.status(400).json({
            error: `La actividad "${formattedName}" ya existe en el catálogo.`,
          });
        } else {
          // Si existía pero estaba inactiva, la reactivamos
          db.run(
            "UPDATE activities SET active = 1, category = ? WHERE id = ?",
            [category, existing.id],
            function (updateErr) {
              if (updateErr) {
                return res.status(500).json({ error: updateErr.message });
              }
              return res.json({
                id: existing.id,
                category,
                name: existing.name,
                active: 1,
                message: "Actividad reactivada exitosamente.",
              });
            }
          );
          return;
        }
      }

      // Insertar nueva actividad
      db.run(
        "INSERT INTO activities (category, name, active) VALUES (?, ?, 1)",
        [category, formattedName],
        function (insertErr) {
          if (insertErr) {
            return res.status(500).json({ error: insertErr.message });
          }

          db.get("SELECT * FROM activities WHERE id = ?", [this.lastID], (getErr, newRow) => {
            if (getErr) {
              return res.json({ id: this.lastID, category, name: formattedName, active: 1 });
            }
            res.status(201).json(newRow);
          });
        }
      );
    }
  );
});

// PUT /api/activities/:id - Editar actividad (Solo Admin)
router.put("/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, category, active } = req.body;

  db.get("SELECT * FROM activities WHERE id = ?", [id], (err, current) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!current) return res.status(404).json({ error: "Actividad no encontrada." });

    const newCategory = category
      ? category.toUpperCase()
      : current.category;

    let newName = current.name;
    if (name && name.trim()) {
      newName = formatActivityName(name, newCategory);
    }

    const newActive = active !== undefined ? (active ? 1 : 0) : current.active;
    const oldName = current.name;

    // Verificar si el nuevo nombre colisiona con otra actividad distinta
    db.get(
      "SELECT id FROM activities WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?",
      [newName, id],
      (colErr, collision) => {
        if (colErr) return res.status(500).json({ error: colErr.message });
        if (collision) {
          return res.status(400).json({ error: `Ya existe otra actividad con el nombre "${newName}".` });
        }

        db.serialize(() => {
          db.run("BEGIN TRANSACTION");

          // 1. Actualizar catálogo de actividades
          db.run(
            "UPDATE activities SET name = ?, category = ?, active = ? WHERE id = ?",
            [newName, newCategory, newActive, id],
            (updateErr) => {
              if (updateErr) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: updateErr.message });
              }
            }
          );

          // 2. Si el nombre de la actividad cambió, propagar en cascada
          if (oldName !== newName) {
            // Actualizar partidas del Plan Maestro
            db.run(
              "UPDATE master_items SET activity = ? WHERE activity = ?",
              [newName, oldName]
            );

            // Actualizar reportes diarios
            db.run(
              "UPDATE daily_logs SET activity = ? WHERE activity = ?",
              [newName, oldName]
            );

            // Actualizar asignación de actividad en personal
            db.run(
              "UPDATE project_workers SET current_activity = REPLACE(current_activity, ?, ?) WHERE current_activity LIKE ?",
              [oldName, newName, `%${oldName}%`]
            );
          }

          db.run("COMMIT", (commitErr) => {
            if (commitErr) {
              return res.status(500).json({ error: commitErr.message });
            }

            db.get("SELECT * FROM activities WHERE id = ?", [id], (fetchErr, updatedRow) => {
              if (fetchErr) {
                return res.json({ id, name: newName, category: newCategory, active: newActive });
              }
              res.json({
                ...updatedRow,
                cascadeUpdated: oldName !== newName,
                oldName,
              });
            });
          });
        });
      }
    );
  });
});

// DELETE /api/activities/:id - Eliminación Inteligente (Solo Admin)
// - Si uso == 0: Eliminación física definitiva (Hard Delete).
// - Si uso > 0: Desactivación lógica (Soft Delete) para resguardar historial.
// - Parámetro opcional ?permanent=true: Bloquea si tiene registros, o fuerza hard delete si uso == 0.
router.delete("/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const forcePermanent = req.query.permanent === "true";

  const checkSql = `
    SELECT 
      a.id, a.name, a.active,
      (
        (SELECT COUNT(*) FROM master_items mi WHERE mi.activity = a.name) +
        (SELECT COUNT(*) FROM daily_logs dl WHERE dl.activity = a.name)
      ) AS usage_count
    FROM activities a
    WHERE a.id = ?
  `;

  db.get(checkSql, [id], (err, activity) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!activity) return res.status(404).json({ error: "Actividad no encontrada." });

    const usageCount = Number(activity.usage_count) || 0;

    // Si se solicitó borrado permanente explícito pero tiene registros asociados
    if (forcePermanent && usageCount > 0) {
      return res.status(400).json({
        error: `No se puede eliminar definitivamente la actividad "${activity.name}" porque tiene ${usageCount} registros históricos (partidas o reportes diarios) asociados. Debe mantenerse como inactiva para proteger la integridad de los datos.`,
      });
    }

    // Si no tiene registros en el sistema O fue explícitamente solicitada y tiene 0 -> Hard Delete
    if (usageCount === 0) {
      db.run("DELETE FROM activities WHERE id = ?", [id], function (delErr) {
        if (delErr) return res.status(500).json({ error: delErr.message });
        return res.json({
          message: `Actividad "${activity.name}" eliminada definitivamente del sistema (no tenía registros asociados).`,
          permanent: true,
          id: Number(id),
          name: activity.name,
          usage_count: 0,
        });
      });
    } else {
      // Tiene registros históricos -> Soft Delete (Desactivar)
      db.run("UPDATE activities SET active = 0 WHERE id = ?", [id], function (updErr) {
        if (updErr) return res.status(500).json({ error: updErr.message });
        return res.json({
          message: `Actividad "${activity.name}" desactivada. Se resguardaron ${usageCount} registros históricos asociados.`,
          permanent: false,
          id: Number(id),
          name: activity.name,
          usage_count: usageCount,
        });
      });
    }
  });
});

// POST /api/activities/:id/reactivate - Reactivar actividad (Solo Admin)
router.post("/:id/reactivate", requireAdmin, (req, res) => {
  const { id } = req.params;

  db.run("UPDATE activities SET active = 1 WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Actividad no encontrada." });

    res.json({ message: "Actividad reactivada correctamente.", id: Number(id) });
  });
});

module.exports = router;
