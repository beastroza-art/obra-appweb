const express = require("express");
const db = require("../db/connection");

const router = express.Router();

router.get("/", (req, res) => {
  db.all("SELECT * FROM audit_logs ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json(rows);
  });
});

router.get("/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM audit_logs WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!row) {
      return res.status(404).json({ error: "Registro de auditoría no encontrado" });
    }

    res.json(row);
  });
});

router.post("/", (req, res) => {
  const {
    action,
    entity_name,
    entity_id,
    user_name,
    user_email,
    description,
    previous_data,
  } = req.body;

  const sql = `
    INSERT INTO audit_logs (
      action,
      entity_name,
      entity_id,
      user_name,
      user_email,
      description,
      previous_data
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const parsedPreviousData = previous_data
    ? typeof previous_data === "string"
      ? previous_data
      : JSON.stringify(previous_data)
    : "";

  db.run(
    sql,
    [
      action || "",
      entity_name || "",
      entity_id || "",
      user_name || "",
      user_email || "",
      description || "",
      parsedPreviousData,
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      res.status(201).json({
        id: this.lastID,
        action: action || "",
        entity_name: entity_name || "",
        entity_id: entity_id || "",
        user_name: user_name || "",
        user_email: user_email || "",
        description: description || "",
        previous_data: parsedPreviousData,
      });
    }
  );
});

router.delete("/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM audit_logs WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    if (this.changes === 0) {
      return res.status(404).json({
        error: "Registro de auditoría no encontrado",
      });
    }

    res.json({
      message: "Registro de auditoría eliminado correctamente",
      deleted_id: Number(id),
    });
  });
});

module.exports = router;