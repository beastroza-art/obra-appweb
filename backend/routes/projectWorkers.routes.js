const express = require("express");
const db = require("../db/connection");

const router = express.Router();

router.get("/", (req, res) => {
  const { project } = req.query;
  let sql = "SELECT * FROM project_workers ORDER BY name ASC";
  const params = [];

  if (project) {
    sql = "SELECT * FROM project_workers WHERE project = ? ORDER BY name ASC";
    params.push(project);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post("/", (req, res) => {
  const { project, name, role, active, transfer_date } = req.body;

  if (!project || !name) {
    return res.status(400).json({ error: "Faltan campos obligatorios: project y name" });
  }

  // Verificar nombre duplicado globalmente
  db.get(
    "SELECT id FROM project_workers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))",
    [name],
    (err, existing) => {
      if (err) return res.status(500).json({ error: err.message });

      if (existing) {
        return res.status(409).json({ error: `Ya existe una persona con el nombre "${name}" en el padrón.` });
      }

      db.run(
        `INSERT INTO project_workers (project, name, role, active, transfer_date) VALUES (?, ?, ?, ?, ?)`,
        [project, name, role || "", active ? 1 : 0, transfer_date || ""],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.status(201).json({
            id: this.lastID,
            project,
            name,
            role: role || "",
            active: Boolean(active),
            transfer_date: transfer_date || "",
            current_activity: "",
          });
        }
      );
    }
  );
});

router.put("/:id", (req, res) => {
  const { id } = req.params;
  const { project, name, role, transfer_date } = req.body;

  if (!project || !name) {
    return res.status(400).json({ error: "Faltan campos obligatorios: project y name" });
  }

  // Verificar nombre duplicado globalmente, excluyendo el propio registro
  db.get(
    "SELECT id FROM project_workers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?",
    [name, id],
    (err, existing) => {
      if (err) return res.status(500).json({ error: err.message });

      if (existing) {
        return res.status(409).json({ error: `Ya existe una persona con el nombre "${name}" en el padrón.` });
      }

      db.run(
        `UPDATE project_workers SET project = ?, name = ?, role = ?, transfer_date = ? WHERE id = ?`,
        [project, name, role || "", transfer_date || "", id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          if (this.changes === 0) return res.status(404).json({ error: "Trabajador no encontrado" });

          res.json({ id: Number(id), project, name, role: role || "", transfer_date: transfer_date || "" });
        }
      );
    }
  );
});

router.delete("/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM project_workers WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Trabajador no encontrado" });
    res.json({ message: "Trabajador eliminado", deleted_id: Number(id) });
  });
});

module.exports = router;