const express = require("express");
const db = require("../db/connection");

const router = express.Router();

router.get("/", (req, res) => {
  const { master_item_id, daily_log_id } = req.query;

  let sql = "SELECT * FROM site_photos";
  const params = [];
  const conditions = [];

  if (master_item_id) {
    conditions.push("master_item_id = ?");
    params.push(Number(master_item_id));
  }

  if (daily_log_id) {
    conditions.push("daily_log_id = ?");
    params.push(Number(daily_log_id));
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY id DESC";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get("/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM site_photos WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!row) {
      return res.status(404).json({ error: "Foto no encontrada" });
    }

    res.json(row);
  });
});

router.post("/", (req, res) => {
  const { daily_log_id, master_item_id, file_url, description, label, date, photo_type, watermark_text } =
    req.body;

  const insertPhoto = () => {
    const sql = `
      INSERT INTO site_photos (
        daily_log_id,
        master_item_id,
        file_url,
        description,
        label,
        date,
        photo_type,
        watermark_text
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
        photo_type || "avance",
        watermark_text || "",
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
          photo_type: photo_type || "avance",
          watermark_text: watermark_text || "",
        });
      }
    );
  };

  if (daily_log_id && file_url) {
    db.get(
      "SELECT * FROM site_photos WHERE daily_log_id = ? AND file_url = ?",
      [daily_log_id, file_url],
      (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        if (existing) {
          return res.status(200).json(existing);
        }
        insertPhoto();
      }
    );
  } else {
    insertPhoto();
  }
});

const fs = require("fs");
const path = require("path");

router.delete("/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM site_photos WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!row) {
      return res.status(404).json({ error: "Foto no encontrada" });
    }

    // Borrar el archivo físico
    if (row.file_url) {
      const filename = path.basename(row.file_url);
      const filePath = path.join(__dirname, "..", "uploads", filename);

      fs.unlink(filePath, (fsErr) => {
        if (fsErr && fsErr.code !== "ENOENT") {
          console.warn("No se pudo eliminar el archivo:", fsErr.message);
        }
      });
    }

    // Borrar el registro de la base de datos
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
});

module.exports = router;