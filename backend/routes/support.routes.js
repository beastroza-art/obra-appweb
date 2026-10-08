const express = require("express");
const db = require("../db/connection");

const router = express.Router();

router.get("/site-photos", (req, res) => {
  db.all("SELECT * FROM site_photos ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json(rows);
  });
});

router.get("/site-photos/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM site_photos WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!row) {
      return res.status(404).json({ error: "Foto no encontrada" });
    }

    res.json(row);
  });
});

router.post("/site-photos", (req, res) => {
  const {
    daily_log_id,
    master_item_id,
    file_url,
    description,
    label,
    date,
  } = req.body;

  const sql = `
    INSERT INTO site_photos (
      daily_log_id,
      master_item_id,
      file_url,
      description,
      label,
      date
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [
      daily_log_id || null,
      master_item_id || null,
      file_url || "",
      description || "",
      label || "",
      date || "",
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      res.status(201).json({
        id: this.lastID,
        daily_log_id: daily_log_id || null,
        master_item_id: master_item_id || null,
        file_url: file_url || "",
        description: description || "",
        label: label || "",
        date: date || "",
      });
    }
  );
});

router.delete("/site-photos/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM site_photos WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    if (this.changes === 0) {
      return res.status(404).json({ error: "Foto no encontrada" });
    }

    res.json({
      message: "Foto eliminada correctamente",
      deleted_id: Number(id),
    });
  });
});

router.get("/audit-logs", (req, res) => {
  db.all("SELECT * FROM audit_logs ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json(rows);
  });
});

router.post("/audit-logs", (req, res) => {
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

  db.run(
    sql,
    [
      action || "",
      entity_name || "",
      entity_id || "",
      user_name || "",
      user_email || "",
      description || "",
      previous_data
        ? typeof previous_data === "string"
          ? previous_data
          : JSON.stringify(previous_data)
        : "",
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
        previous_data: previous_data || "",
      });
    }
  );
});

router.delete("/audit-logs/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM audit_logs WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    if (this.changes === 0) {
      return res.status(404).json({ error: "Registro de auditoría no encontrado" });
    }

    res.json({
      message: "Registro de auditoría eliminado correctamente",
      deleted_id: Number(id),
    });
  });
});

module.exports = router;