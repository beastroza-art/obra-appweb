const db = require("./connection");

let DEFAULT_ACTIVITIES = [];
let detectCategory = (name) => {
  const clean = String(name || "").trim().toUpperCase();
  if (clean.startsWith("CD") || clean.startsWith("CCDD") || clean.includes("CORRIENTES DÉBILES") || clean.includes("DEBILES")) return "CD";
  if (clean.startsWith("TC") || clean.includes("TELECOM") || clean.includes("TELECOMUNICACIONES")) return "TC";
  return "EL";
};

try {
  const def = require("../constants/defaultActivities");
  if (Array.isArray(def.DEFAULT_ACTIVITIES)) DEFAULT_ACTIVITIES = def.DEFAULT_ACTIVITIES;
  if (typeof def.detectCategory === "function") detectCategory = def.detectCategory;
} catch (err) {
  console.warn("Aviso: Carpeta backend/constants/ no encontrada aún en el servidor, usando configuración de respaldo.");
}

function initDatabase() {
  db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");

    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        client TEXT DEFAULT '',
        address TEXT DEFAULT '',
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'activa',
        start_date TEXT DEFAULT '',
        end_date TEXT DEFAULT '',
        supervisor TEXT DEFAULT '',
        capataz TEXT DEFAULT '',
        tower_count INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.all("PRAGMA table_info(projects)", [], (err, columns) => {
      if (err) {
        console.error("Error revisando columnas de projects:", err.message);
        return;
      }

      const columnNames = columns.map((column) => column.name);
      const migrations = [
        ["tower_count", "ALTER TABLE projects ADD COLUMN tower_count INTEGER DEFAULT 1"],
        ["floors", "ALTER TABLE projects ADD COLUMN floors TEXT DEFAULT '[]'"],
        ["departments", "ALTER TABLE projects ADD COLUMN departments TEXT DEFAULT '{}'"],
        ["vertical_el_count", "ALTER TABLE projects ADD COLUMN vertical_el_count INTEGER DEFAULT 0"],
        ["vertical_tc_count", "ALTER TABLE projects ADD COLUMN vertical_tc_count INTEGER DEFAULT 0"],
        ["vertical_cd_count", "ALTER TABLE projects ADD COLUMN vertical_cd_count INTEGER DEFAULT 0"],
      ];

      migrations.forEach(([columnName, sql]) => {
        if (!columnNames.includes(columnName)) {
          db.run(sql, (migrationErr) => {
            if (migrationErr) {
              console.error(`Error al ejecutar migración para ${columnName}:`, migrationErr.message);
            } else {
              console.log(`Migración exitosa: columna ${columnName} añadida a projects.`);
            }
          });
        }
      });
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS master_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project TEXT DEFAULT '',
        tower TEXT DEFAULT '',
        floor TEXT DEFAULT '',
        scope_type TEXT DEFAULT 'piso',
        departments TEXT DEFAULT '',
        activity TEXT DEFAULT '',
        start_date TEXT DEFAULT '',
        end_date TEXT DEFAULT '',
        planned_qty REAL DEFAULT 0,
        executed_qty REAL DEFAULT 0,
        unit TEXT DEFAULT 'und',
        crew_name TEXT DEFAULT '',
        crew_size INTEGER DEFAULT 0,
        crew_members TEXT DEFAULT '[]',
        restrictions TEXT DEFAULT '',
        observations TEXT DEFAULT '',
        status TEXT DEFAULT 'pendiente',
        release_status TEXT DEFAULT 'no_liberado',
        parent_id INTEGER DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.all("PRAGMA table_info(master_items)", [], (err, columns) => {
      if (err) {
        console.error("Error revisando columnas de master_items:", err.message);
        return;
      }

      const columnNames = columns.map((column) => column.name);
      const migrations = [
        ["scope_type", "ALTER TABLE master_items ADD COLUMN scope_type TEXT DEFAULT 'piso'"],
        ["departments", "ALTER TABLE master_items ADD COLUMN departments TEXT DEFAULT ''"],
        ["parent_id", "ALTER TABLE master_items ADD COLUMN parent_id INTEGER DEFAULT NULL"],
      ];

      migrations.forEach(([columnName, sql]) => {
        if (!columnNames.includes(columnName)) {
          db.run(sql);
        }
      });

      const needsFloorRangeCleanup = columnNames.includes("floor_from") || columnNames.includes("floor_to");
      if (needsFloorRangeCleanup) {
        db.serialize(() => {
          db.run("ALTER TABLE master_items RENAME TO master_items_old", (renameErr) => {
            if (renameErr) {
              console.error("Error renombrando master_items para limpiar columnas:", renameErr.message);
              return;
            }

            db.run(`
              CREATE TABLE master_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project TEXT DEFAULT '',
                tower TEXT DEFAULT '',
                floor TEXT DEFAULT '',
                scope_type TEXT DEFAULT 'piso',
                departments TEXT DEFAULT '',
                activity TEXT DEFAULT '',
                start_date TEXT DEFAULT '',
                end_date TEXT DEFAULT '',
                planned_qty REAL DEFAULT 0,
                executed_qty REAL DEFAULT 0,
                unit TEXT DEFAULT 'und',
                crew_name TEXT DEFAULT '',
                crew_size INTEGER DEFAULT 0,
                crew_members TEXT DEFAULT '[]',
                restrictions TEXT DEFAULT '',
                observations TEXT DEFAULT '',
                status TEXT DEFAULT 'pendiente',
                release_status TEXT DEFAULT 'no_liberado',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
              )
            `, (createErr) => {
              if (createErr) {
                console.error("Error recreando master_items sin floor_from/floor_to:", createErr.message);
                return;
              }

              db.run(`
                INSERT INTO master_items (
                  id, project, tower, floor, scope_type, departments, activity, start_date, end_date,
                  planned_qty, executed_qty, unit, crew_name, crew_size, crew_members, restrictions,
                  observations, status, release_status, created_at
                )
                SELECT
                  id, project, tower, floor, scope_type, departments, activity, start_date, end_date,
                  planned_qty, executed_qty, unit, crew_name, crew_size, crew_members, restrictions,
                  observations, status, release_status, created_at
                FROM master_items_old
              `, (copyErr) => {
                if (copyErr) {
                  console.error("Error copiando datos al recrear master_items:", copyErr.message);
                  return;
                }

                db.run("DROP TABLE master_items_old", (dropErr) => {
                  if (dropErr) {
                    console.error("Error eliminando tabla antigua de master_items:", dropErr.message);
                  } else {
                    console.log("Migración completada: columnas floor_from y floor_to removidas de master_items.");
                  }
                });
              });
            });
          });
        });
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS daily_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        master_item_id INTEGER NOT NULL,
        project TEXT DEFAULT '',
        tower TEXT DEFAULT '',
        floor TEXT DEFAULT '',
        activity TEXT DEFAULT '',
        date TEXT DEFAULT '',
        executed_today REAL DEFAULT 0,
        supervisor TEXT DEFAULT '',
        crew_name TEXT DEFAULT '',
        crew_workers TEXT DEFAULT '[]',
        hours_worked REAL DEFAULT 0,
        has_restriction INTEGER DEFAULT 0,
        restriction_detail TEXT DEFAULT '',
        observations TEXT DEFAULT '',
        capataz_name TEXT DEFAULT '',
        capataz_signature TEXT DEFAULT '',
        is_zero_progress INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(master_item_id) REFERENCES master_items(id) ON DELETE CASCADE
      )
    `);

    db.all("PRAGMA table_info(daily_logs)", [], (err, columns) => {
      if (err) {
        console.error("Error revisando columnas de daily_logs:", err.message);
        return;
      }

      const columnNames = columns.map((column) => column.name);
      const migrations = [
        ["is_zero_progress", "ALTER TABLE daily_logs ADD COLUMN is_zero_progress INTEGER DEFAULT 0"],
      ];

      migrations.forEach(([columnName, sql]) => {
        if (!columnNames.includes(columnName)) {
          db.run(sql, (migrationErr) => {
            if (migrationErr) {
              console.error(`Error al ejecutar migración para ${columnName} en daily_logs:`, migrationErr.message);
            } else {
              console.log(`Migración exitosa: columna ${columnName} añadida a daily_logs.`);
            }
          });
        }
      });
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS site_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        daily_log_id INTEGER,
        master_item_id INTEGER,
        file_url TEXT DEFAULT '',
        description TEXT DEFAULT '',
        label TEXT DEFAULT '',
        date TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(daily_log_id) REFERENCES daily_logs(id) ON DELETE CASCADE,
      FOREIGN KEY(master_item_id) REFERENCES master_items(id) ON DELETE CASCADE
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT DEFAULT '',
        entity_name TEXT DEFAULT '',
        entity_id TEXT DEFAULT '',
        user_name TEXT DEFAULT '',
        user_email TEXT DEFAULT '',
        description TEXT DEFAULT '',
        previous_data TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS project_workers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT '',
        active INTEGER DEFAULT 1,
        transfer_date TEXT DEFAULT '',
        current_activity TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.all("PRAGMA table_info(project_workers)", [], (err, columns) => {
      if (err) {
        console.error("Error revisando columnas de project_workers:", err.message);
        return;
      }

      const columnNames = columns.map((column) => column.name);
      const migrations = [
        ["transfer_date", "ALTER TABLE project_workers ADD COLUMN transfer_date TEXT DEFAULT ''"],
        ["current_activity", "ALTER TABLE project_workers ADD COLUMN current_activity TEXT DEFAULT ''"],
      ];

      migrations.forEach(([columnName, sql]) => {
        if (!columnNames.includes(columnName)) {
          db.run(sql, (migrationErr) => {
            if (migrationErr) {
              console.error(`Error al ejecutar migración para ${columnName}:`, migrationErr.message);
            } else {
              console.log(`Migración exitosa: columna ${columnName} añadida a project_workers.`);
            }
          });
        }
      });
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT DEFAULT 'viewer',
        allowed_projects TEXT DEFAULT '[]',
        active INTEGER DEFAULT 1,
        last_seen TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, () => {
      // Sembrar usuario admin si la base de datos es nueva
      db.get("SELECT COUNT(*) AS count FROM users", (uErr, uRow) => {
        if (!uErr && uRow && uRow.count === 0) {
          db.run(
            `INSERT INTO users (id, email, password_hash, full_name, role, allowed_projects, active)
             VALUES (1, 'bap@dgcelectricidad.cl', '$2b$10$VA..u0ytXdt1R28tGKgyvO8MHaxzdNffTqILMEZrRrgX/f5rL/ULi', 'Benjamín Astroza', 'admin', '[]', 1)`,
            (seedErr) => {
              if (seedErr) {
                console.error("Error al sembrar usuario admin:", seedErr.message);
              } else {
                console.log("Usuario inicial Benjamín Astroza configurado correctamente.");
              }
            }
          );
        }
      });

      // Ejecutar backfill de actividades de trabajadores e inicializar actividades
      backfillWorkersCurrentActivity(db);
      initActivities(db);
    });

    db.all("PRAGMA table_info(users)", [], (err, columns) => {
      if (err) {
        console.error("Error revisando columnas de users:", err.message);
        return;
      }

      const columnNames = (columns || []).map((col) => col.name);
      if (!columnNames.includes("last_seen")) {
        db.run("ALTER TABLE users ADD COLUMN last_seen TEXT DEFAULT NULL", (migrationErr) => {
          if (migrationErr) {
            console.error("Error al añadir columna last_seen a users:", migrationErr.message);
          } else {
            console.log("Migración exitosa: columna last_seen añadida a users.");
          }
        });
      }
    });
  });
}

function backfillWorkersCurrentActivity(db) {
  const sql = `
    SELECT 
      dl.project, dl.crew_workers, dl.tower, dl.floor, dl.activity,
      mi.scope_type
    FROM daily_logs dl
    LEFT JOIN master_items mi ON dl.master_item_id = mi.id
    ORDER BY dl.date ASC, dl.id ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Error al consultar daily_logs para backfill:", err.message);
      return;
    }

    if (!rows || rows.length === 0) return;

    db.serialize(() => {
      const stmt = db.prepare(
        "UPDATE project_workers SET current_activity = ? WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND project = ?"
      );

      rows.forEach((row) => {
        let workers = [];
        try {
          if (row.crew_workers) {
            workers = Array.isArray(row.crew_workers) ? row.crew_workers : JSON.parse(row.crew_workers);
          }
        } catch (e) {
          // ignorar
        }

        if (Array.isArray(workers) && workers.length > 0) {
          const scopeType = row.scope_type || "";
          const floorText = scopeType.startsWith("vertical")
            ? "Vertical Completa"
            : (row.floor || "General");
          const fullRuta = `${row.tower} / ${floorText} / ${row.activity}`;

          workers.forEach((w) => {
            if (w && w.name) {
              stmt.run([fullRuta, String(w.name).trim(), row.project]);
            }
          });
        }
      });

      stmt.finalize((finalizeErr) => {
        if (finalizeErr) {
          console.error("Error al finalizar backfill:", finalizeErr.message);
        } else {
          console.log("Backfill de actividad actual para personal completado con éxito.");
        }
      });
    });
  });

  reconcileLegacyDailyLogs();
}

function reconcileLegacyDailyLogs() {
  db.all("SELECT id, executed_today, crew_workers FROM daily_logs", [], (err, rows) => {
    if (err || !rows) return;
    rows.forEach((r) => {
      let workers = [];
      try {
        workers = typeof r.crew_workers === "string" ? JSON.parse(r.crew_workers) : r.crew_workers;
      } catch (e) {}
      if (!Array.isArray(workers) || workers.length === 0) return;
      const target = Number(r.executed_today) || 0;
      const currentSum = workers.reduce((acc, w) => acc + (Number(w.executed) || 0), 0);
      if (target > 0 && Math.abs(currentSum - target) > 0.05) {
        let running = 0;
        const newWorkers = workers.map((w, idx) => {
          if (idx === workers.length - 1) {
            const rem = Math.max(0, Math.round((target - running) * 100) / 100);
            return { ...w, executed: rem };
          }
          const ratio = currentSum > 0 ? (Number(w.executed) || 0) / currentSum : (1 / workers.length);
          const val = Math.round(target * ratio * 100) / 100;
          running += val;
          return { ...w, executed: val };
        });
        db.run("UPDATE daily_logs SET crew_workers = ? WHERE id = ?", [JSON.stringify(newWorkers), r.id]);
      }
    });
  });
}

function initActivities(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error("Error creando tabla activities:", err.message);
      return;
    }

    db.run("CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category)");
    db.run("CREATE INDEX IF NOT EXISTS idx_activities_active ON activities(active)");

    db.serialize(() => {
      const stmt = db.prepare("INSERT OR IGNORE INTO activities (category, name, active) VALUES (?, ?, 1)");
      DEFAULT_ACTIVITIES.forEach((act) => {
        stmt.run([act.category, act.name]);
      });

      db.all("SELECT DISTINCT activity FROM master_items WHERE activity IS NOT NULL AND TRIM(activity) != ''", [], (miErr, miRows) => {
        if (!miErr && miRows && miRows.length > 0) {
          miRows.forEach((mi) => {
            const actName = mi.activity.trim();
            const cat = detectCategory(actName);
            stmt.run([cat, actName]);
          });
        }
        stmt.finalize(() => {
          console.log("Catálogo de actividades sincronizado.");
        });
      });
    });
  });
}

module.exports = initDatabase;