const express = require("express");
const db = require("../db/connection");

const router = express.Router();
const MIN_TOWER_COUNT = 1;
const MAX_TOWER_COUNT = 10;

function normalizeStatus(status) {
  if (!status) return "activa";

  if (status === "activo") return "activa";
  if (status === "inactivo") return "inactiva";

  return status;
}

function normalizeProjectName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isBlank(value) {
  return !String(value || "").trim();
}

function normalizeTowerCount(value) {
  const towerCount = Number(value);

  if (!Number.isInteger(towerCount) || towerCount < MIN_TOWER_COUNT || towerCount > MAX_TOWER_COUNT) {
    return null;
  }

  return towerCount;
}

function findProjectByName(name, excludeId, callback) {
  const normalizedName = normalizeProjectName(name);

  db.all("SELECT id, name FROM projects", [], (err, projects) => {
    if (err) return callback(err);

    const match = projects.find(
      (project) =>
        normalizeProjectName(project.name) === normalizedName &&
        (!excludeId || Number(project.id) !== Number(excludeId))
    );

    callback(null, match);
  });
}

// Helper to add a project name to a user's allowed_projects by full_name
function addProjectToUser(fullName, projectName, callback) {
  if (!fullName) {
    if (callback) callback();
    return;
  }
  db.get(
    "SELECT id, allowed_projects FROM users WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?))",
    [fullName],
    (err, user) => {
      if (err || !user) {
        if (callback) callback(err);
        return;
      }
      let allowed = [];
      try {
        allowed = JSON.parse(user.allowed_projects || "[]");
      } catch (e) {
        allowed = [];
      }
      if (!Array.isArray(allowed)) {
        allowed = [];
      }
      if (!allowed.includes(projectName)) {
        allowed.push(projectName);
        db.run(
          "UPDATE users SET allowed_projects = ? WHERE id = ?",
          [JSON.stringify(allowed), user.id],
          (err) => {
            if (callback) callback(err);
          }
        );
      } else {
        if (callback) callback();
      }
    }
  );
}

// Helper to remove a project name from a user's allowed_projects by full_name
function removeProjectFromUser(fullName, projectName, callback) {
  if (!fullName) {
    if (callback) callback();
    return;
  }
  db.get(
    "SELECT id, allowed_projects FROM users WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?))",
    [fullName],
    (err, user) => {
      if (err || !user) {
        if (callback) callback(err);
        return;
      }
      let allowed = [];
      try {
        allowed = JSON.parse(user.allowed_projects || "[]");
      } catch (e) {
        allowed = [];
      }
      if (!Array.isArray(allowed)) {
        allowed = [];
      }
      if (allowed.includes(projectName)) {
        allowed = allowed.filter(p => p !== projectName);
        db.run(
          "UPDATE users SET allowed_projects = ? WHERE id = ?",
          [JSON.stringify(allowed), user.id],
          (err) => {
            if (callback) callback(err);
          }
        );
      } else {
        if (callback) callback();
      }
    }
  );
}

// Helper to rename a project name in allowed_projects of all users
function renameProjectInAllowedProjects(oldName, newName, callback) {
  db.all("SELECT id, allowed_projects FROM users", [], (err, users) => {
    if (err || !users) {
      if (callback) callback(err);
      return;
    }
    let pending = users.length;
    if (pending === 0) {
      if (callback) callback();
      return;
    }
    let errorOccurred = null;
    users.forEach((user) => {
      let allowed = [];
      try {
        allowed = JSON.parse(user.allowed_projects || "[]");
      } catch (e) {
        allowed = [];
      }
      if (!Array.isArray(allowed)) {
        allowed = [];
      }
      if (allowed.includes(oldName)) {
        allowed = allowed.map(p => p === oldName ? newName : p);
        db.run(
          "UPDATE users SET allowed_projects = ? WHERE id = ?",
          [JSON.stringify(allowed), user.id],
          (err) => {
            if (err) errorOccurred = err;
            pending--;
            if (pending === 0) {
              if (callback) callback(errorOccurred);
            }
          }
        );
      } else {
        pending--;
        if (pending === 0) {
          if (callback) callback(errorOccurred);
        }
      }
    });
  });
}

// Helper to remove a project name from allowed_projects of all users
function removeProjectFromAllowedProjects(projectName, callback) {
  db.all("SELECT id, allowed_projects FROM users", [], (err, users) => {
    if (err || !users) {
      if (callback) callback(err);
      return;
    }
    let pending = users.length;
    if (pending === 0) {
      if (callback) callback();
      return;
    }
    let errorOccurred = null;
    users.forEach((user) => {
      let allowed = [];
      try {
        allowed = JSON.parse(user.allowed_projects || "[]");
      } catch (e) {
        allowed = [];
      }
      if (!Array.isArray(allowed)) {
        allowed = [];
      }
      if (allowed.includes(projectName)) {
        allowed = allowed.filter(p => p !== projectName);
        db.run(
          "UPDATE users SET allowed_projects = ? WHERE id = ?",
          [JSON.stringify(allowed), user.id],
          (err) => {
            if (err) errorOccurred = err;
            pending--;
            if (pending === 0) {
              if (callback) callback(errorOccurred);
            }
          }
        );
      } else {
        pending--;
        if (pending === 0) {
          if (callback) callback(errorOccurred);
        }
      }
    });
  });
}

// Helper to handle all updates when a project is edited
function handleProjectUpdate(currentProject, newName, newSupervisor, newCapataz, callback) {
  const oldName = currentProject.name;
  const oldSupervisor = currentProject.supervisor;
  const oldCapataz = currentProject.capataz;

  const nameChanged = oldName !== newName;

  const step1 = (next) => {
    if (nameChanged) {
      renameProjectInAllowedProjects(oldName, newName, next);
    } else {
      next();
    }
  };

  step1((err) => {
    if (err) return callback(err);

    const handleSupervisor = (next) => {
      if (oldSupervisor !== newSupervisor) {
        removeProjectFromUser(oldSupervisor, newName, (err) => {
          addProjectToUser(newSupervisor, newName, next);
        });
      } else {
        addProjectToUser(newSupervisor, newName, next);
      }
    };

    handleSupervisor((err) => {
      if (err) return callback(err);

      if (oldCapataz !== newCapataz) {
        removeProjectFromUser(oldCapataz, newName, (err) => {
          addProjectToUser(newCapataz, newName, callback);
        });
      } else {
        addProjectToUser(newCapataz, newName, callback);
      }
    });
  });
}

router.get("/", (req, res) => {
  db.all("SELECT * FROM projects ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json(rows);
  });
});

router.get("/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM projects WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!row) {
      return res.status(404).json({ error: "Obra no encontrada" });
    }

    res.json(row);
  });
});

router.post("/", (req, res) => {
  const {
    name,
    client,
    address,
    location,
    description,
    status,
    start_date,
    end_date,
    supervisor,
    capataz,
    tower_count,
    floors,
    departments,
    vertical_el_count,
    vertical_tc_count,
    vertical_cd_count,
  } = req.body;

  const projectName = name?.trim();

  if (!projectName) {
    return res.status(400).json({
      error: "El nombre de la obra es obligatorio",
    });
  }

  const projectAddress = address || location || "";

  const requiredFields = [
    [projectAddress, "La ubicacion es obligatoria"],
    [client, "El cliente es obligatorio"],
    [supervisor, "El supervisor es obligatorio"],
    [capataz, "El capataz es obligatorio"],
    [start_date, "La fecha de inicio es obligatoria"],
    [end_date, "La fecha de termino es obligatoria"],
    [description, "La descripcion es obligatoria"],
  ];
  const missingField = requiredFields.find(([value]) => isBlank(value));
  if (missingField) {
    return res.status(400).json({ error: missingField[1] });
  }

  const towerCount = normalizeTowerCount(tower_count);
  if (!towerCount) {
    return res.status(400).json({ error: "La cantidad de torres debe ser un numero entre 1 y 10" });
  }

  findProjectByName(projectName, null, (err, existingProject) => {
    if (err) return res.status(500).json({ error: err.message });

    if (existingProject) {
      return res.status(409).json({
        error: `Ya existe una obra con el nombre "${existingProject.name}". Usa otro nombre o edita la obra existente.`,
      });
    }

    const sql = `
      INSERT INTO projects (
        name,
        client,
        address,
        description,
        status,
        start_date,
        end_date,
        supervisor,
        capataz,
        tower_count,
        floors,
        departments,
        vertical_el_count,
        vertical_tc_count,
        vertical_cd_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(
      sql,
      [
        projectName,
        client || "",
        projectAddress,
        description || "",
        normalizeStatus(status),
        start_date || "",
        end_date || "",
        supervisor || "",
        capataz || "",
        towerCount,
        JSON.stringify(floors || []),
        JSON.stringify(departments || {}),
        Number(vertical_el_count || 0),
        Number(vertical_tc_count || 0),
        Number(vertical_cd_count || 0),
      ],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        addProjectToUser(supervisor, projectName, (err1) => {
          addProjectToUser(capataz, projectName, (err2) => {
            res.status(201).json({
              id: this.lastID,
              name: projectName,
              client: client || "",
              address: projectAddress,
              description: description || "",
              status: normalizeStatus(status),
              start_date: start_date || "",
              end_date: end_date || "",
              supervisor: supervisor || "",
              capataz: capataz || "",
              tower_count: towerCount,
              floors: floors || [],
              departments: departments || {},
              vertical_el_count: Number(vertical_el_count || 0),
              vertical_tc_count: Number(vertical_tc_count || 0),
              vertical_cd_count: Number(vertical_cd_count || 0),
            });
          });
        });
      }
    );
  });
});

router.put("/:id", (req, res) => {
  const { id } = req.params;

  const {
    name,
    client,
    address,
    location,
    description,
    status,
    start_date,
    end_date,
    supervisor,
    capataz,
    tower_count,
    floors,
    departments,
    vertical_el_count,
    vertical_tc_count,
    vertical_cd_count,
  } = req.body;

  const projectName = name?.trim();

  if (!projectName) {
    return res.status(400).json({
      error: "El nombre de la obra es obligatorio",
    });
  }

  const projectAddress = address || location || "";

  const requiredFields = [
    [projectAddress, "La ubicacion es obligatoria"],
    [client, "El cliente es obligatorio"],
    [supervisor, "El supervisor es obligatorio"],
    [capataz, "El capataz es obligatorio"],
    [start_date, "La fecha de inicio es obligatoria"],
    [end_date, "La fecha de termino es obligatoria"],
    [description, "La descripcion es obligatoria"],
  ];
  const missingField = requiredFields.find(([value]) => isBlank(value));
  if (missingField) {
    return res.status(400).json({ error: missingField[1] });
  }

  const towerCount = normalizeTowerCount(tower_count);
  if (!towerCount) {
    return res.status(400).json({ error: "La cantidad de torres debe ser un numero entre 1 y 10" });
  }

  findProjectByName(projectName, id, (err, existingProject) => {
    if (err) return res.status(500).json({ error: err.message });

    if (existingProject) {
      return res.status(409).json({
        error: `Ya existe una obra con el nombre "${existingProject.name}". Usa otro nombre.`,
      });
    }

    db.get("SELECT * FROM projects WHERE id = ?", [id], (err, currentProject) => {
      if (err) return res.status(500).json({ error: err.message });

      if (!currentProject) {
        return res.status(404).json({ error: "Obra no encontrada" });
      }

      const sql = `
        UPDATE projects
        SET
          name = ?,
          client = ?,
          address = ?,
          description = ?,
          status = ?,
          start_date = ?,
          end_date = ?,
          supervisor = ?,
          capataz = ?,
          tower_count = ?,
          floors = ?,
          departments = ?,
          vertical_el_count = ?,
          vertical_tc_count = ?,
          vertical_cd_count = ?
        WHERE id = ?
      `;

      db.serialize(() => {
        db.run(
          sql,
          [
            projectName,
            client || "",
            projectAddress,
            description || "",
            normalizeStatus(status),
            start_date || "",
            end_date || "",
            supervisor || "",
            capataz || "",
            towerCount,
            JSON.stringify(floors || []),
            JSON.stringify(departments || {}),
            Number(vertical_el_count || 0),
            Number(vertical_tc_count || 0),
            Number(vertical_cd_count || 0),
            id,
          ],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });

            if (this.changes === 0) {
              return res.status(404).json({ error: "Obra no encontrada" });
            }

            db.run(
              "UPDATE master_items SET project = ? WHERE project = ?",
              [projectName, currentProject.name],
              (err) => {
                if (err) return res.status(500).json({ error: err.message });

                db.run(
                  "UPDATE daily_logs SET project = ? WHERE project = ?",
                  [projectName, currentProject.name],
                  (err) => {
                    if (err) return res.status(500).json({ error: err.message });

                    handleProjectUpdate(currentProject, projectName, supervisor || "", capataz || "", (errUpdate) => {
                      if (errUpdate) console.error("Error updating allowed_projects:", errUpdate);

                      res.json({
                        id: Number(id),
                        name: projectName,
                        client: client || "",
                        address: projectAddress,
                        description: description || "",
                        status: normalizeStatus(status),
                        start_date: start_date || "",
                        end_date: end_date || "",
                        supervisor: supervisor || "",
                        capataz: capataz || "",
                        tower_count: towerCount,
                        floors: floors || [],
                        departments: departments || {},
                        vertical_el_count: Number(vertical_el_count || 0),
                        vertical_tc_count: Number(vertical_tc_count || 0),
                        vertical_cd_count: Number(vertical_cd_count || 0),
                      });
                    });
                  }
                );
              }
            );
          }
        );
      });
    });
  });
});

router.delete("/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM projects WHERE id = ?", [id], (err, project) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!project) {
      return res.status(404).json({ error: "Obra no encontrada" });
    }

    db.serialize(() => {
      db.all(
        "SELECT id FROM master_items WHERE project = ?",
        [project.name],
        (err, items) => {
          if (err) return res.status(500).json({ error: err.message });

          const itemIds = items.map((item) => item.id);

          if (itemIds.length > 0) {
            const placeholders = itemIds.map(() => "?").join(",");

            db.run(
              `DELETE FROM daily_logs WHERE master_item_id IN (${placeholders})`,
              itemIds
            );

            db.run(
              `DELETE FROM site_photos WHERE master_item_id IN (${placeholders})`,
              itemIds
            );

            db.run(
              `DELETE FROM master_items WHERE id IN (${placeholders})`,
              itemIds
            );
          }

          db.run("DELETE FROM projects WHERE id = ?", [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            removeProjectFromAllowedProjects(project.name, (errRemove) => {
              if (errRemove) console.error("Error removing project from allowed_projects:", errRemove);

              res.json({
                message: "Obra eliminada correctamente",
                deleted_project: project.name,
                deleted_items: itemIds.length,
              });
            });
          });
        }
      );
    });
  });
});

module.exports = router;