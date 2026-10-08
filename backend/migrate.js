const db = require("./db/connection");

function updateMasterItemStatus(masterItemId, callback) {
  db.get(
    "SELECT id, start_date, planned_qty, executed_qty, status, release_status FROM master_items WHERE id = ?",
    [masterItemId],
    (err, item) => {
      if (err) {
        if (callback) callback(err);
        return;
      }
      if (!item) {
        if (callback) callback(new Error("Master item not found"));
        return;
      }

      db.get(
        "SELECT has_restriction FROM daily_logs WHERE master_item_id = ? ORDER BY date DESC, id DESC LIMIT 1",
        [masterItemId],
        (err, lastLog) => {
          if (err) {
            if (callback) callback(err);
            return;
          }

          const planned = Number(item.planned_qty) || 0;
          const executed = Number(item.executed_qty) || 0;
          const pct = planned <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((executed / planned) * 100)));

          // If already blocked, preserve that
          const isBlocked = item.status === "bloqueado";

          let status = "pendiente";
          let release_status = "no_liberado";

          if (isBlocked) {
            status = "bloqueado";
            release_status = "no_liberado";
          } else if (pct >= 100) {
            status = "completado";
            release_status = "terminado";
          } else {
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`;

            if (item.start_date && todayStr < item.start_date) {
              status = "pendiente";
            } else {
              status = "en_ejecucion";
            }

            const hasRestriction = lastLog && (lastLog.has_restriction === 1 || lastLog.has_restriction === true || lastLog.has_restriction === "true");

            if (hasRestriction) {
              release_status = "parcial";
            } else {
              if (status === "pendiente") {
                release_status = "no_liberado";
              } else {
                release_status = "liberado";
              }
            }
          }

          db.run(
            "UPDATE master_items SET status = ?, release_status = ? WHERE id = ?",
            [status, release_status, masterItemId],
            (err) => {
              if (callback) callback(err);
            }
          );
        }
      );
    }
  );
}

// Fetch all item IDs and migrate them
db.all("SELECT id, activity, project FROM master_items", [], (err, rows) => {
  if (err) {
    console.error("Error reading master items:", err);
    process.exit(1);
  }

  console.log(`Starting migration for ${rows.length} items...`);

  let completed = 0;
  if (rows.length === 0) {
    console.log("No items to migrate.");
    process.exit(0);
  }

  rows.forEach((row) => {
    updateMasterItemStatus(row.id, (err) => {
      if (err) {
        console.error(`Error migrating item ID ${row.id} (${row.activity}):`, err);
      } else {
        console.log(`Successfully migrated item ID ${row.id} (${row.activity} - ${row.project})`);
      }

      completed++;
      if (completed === rows.length) {
        console.log("Migration completed successfully!");
        process.exit(0);
      }
    });
  });
});
