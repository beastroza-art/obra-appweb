const express = require("express");
const db = require("../db/connection");
const {
  SCOPE_TYPES,
  VALID_SCOPE_TYPES,
  VALID_UNITS,
  normalizeScopeTypeValue,
  isVerticalScope,
} = require("../constants/activityScope");

const router = express.Router();
const TOWER_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

function toNumber(value) {
  return Number(value || 0);
}

function stringifyArray(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (!value) return "[]";
  return value;
}

function safeParseArray(value) {
  try {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function isBlank(value) {
  return !String(value || "").trim();
}

function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function updateMasterItemStatus(masterItemId, callback) {
  db.get(
    "SELECT id, start_date, planned_qty, executed_qty, status, release_status, parent_id FROM master_items WHERE id = ?",
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

          const isBlocked = item.status === "bloqueado" || item.status === "piso bloqueado";

          let status = "pendiente";
          let release_status = "no_liberado";

          const d = new Date();
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const todayStr = `${year}-${month}-${day}`;

          const hasRestriction = lastLog && (lastLog.has_restriction === 1 || lastLog.has_restriction === true || lastLog.has_restriction === "true");

          db.all(
            "SELECT id, status FROM master_items WHERE parent_id = ?",
            [masterItemId],
            (childErr, children) => {
              if (childErr) {
                if (callback) callback(childErr);
                return;
              }

              const hasChildren = children && children.length > 0;
              const targetItemIds = hasChildren
                ? [masterItemId, ...children.map(c => c.id)]
                : [masterItemId];

              const placeholders = targetItemIds.map(() => "?").join(",");
              db.get(
                `SELECT 1 FROM daily_logs WHERE master_item_id IN (${placeholders}) AND (capataz_signature IS NULL OR TRIM(capataz_signature) = '') LIMIT 1`,
                targetItemIds,
                (sigErr, unsignedLog) => {
                  const hasUnsignedLogs = Boolean(unsignedLog);

                  if (hasChildren) {
                    const totalChildren = children.length;
                    const blockedChildren = children.filter(c => c.status === "bloqueado").length;

                    if (blockedChildren === totalChildren) {
                      status = "bloqueado";
                      release_status = "no_liberado";
                    } else if (blockedChildren > 0) {
                      status = "piso bloqueado";
                      release_status = "no_liberado";
                    } else {
                      if (pct >= 100) {
                        if (hasUnsignedLogs) {
                          status = "pendiente";
                          release_status = "no_liberado";
                        } else {
                          status = "completado";
                          release_status = "terminado";
                        }
                      } else if (item.start_date && todayStr < item.start_date) {
                        status = "pendiente";
                      } else {
                        status = "en_ejecucion";
                      }

                      if (hasRestriction) {
                        release_status = "parcial";
                      } else if (status !== "completado") {
                        if (status === "pendiente") {
                          release_status = "no_liberado";
                        } else {
                          release_status = "liberado";
                        }
                      }
                    }
                  } else {
                    if (isBlocked) {
                      status = item.status === "piso bloqueado" ? "en_ejecucion" : (item.status || "bloqueado");
                      release_status = "no_liberado";
                    } else if (pct >= 100) {
                      if (hasUnsignedLogs) {
                        status = "pendiente";
                        release_status = "no_liberado";
                      } else {
                        status = "completado";
                        release_status = "terminado";
                      }
                    } else {
                      if (item.start_date && todayStr < item.start_date) {
                        status = "pendiente";
                      } else {
                        status = "en_ejecucion";
                      }

                      if (hasRestriction) {
                        release_status = "parcial";
                      } else if (status !== "completado") {
                        if (status === "pendiente") {
                          release_status = "no_liberado";
                        } else {
                          release_status = "liberado";
                        }
                      }
                    }
                  }

                  db.run(
                    "UPDATE master_items SET status = ?, release_status = ? WHERE id = ?",
                    [status, release_status, masterItemId],
                    (err) => {
                      if (err) {
                        if (callback) callback(err);
                        return;
                      }

                      // If it's a child item, update its parent item as well
                      if (item.parent_id) {
                        db.get(
                          "SELECT SUM(executed_qty) as total_exec, SUM(planned_qty) as total_plan FROM master_items WHERE parent_id = ?",
                          [item.parent_id],
                          (sumErr, sumData) => {
                            if (!sumErr && sumData) {
                              const parentExecuted = Number(sumData.total_exec || 0);
                              const parentPlanned = Number(sumData.total_plan || 0);
                              db.run(
                                "UPDATE master_items SET executed_qty = ?, planned_qty = ? WHERE id = ?",
                                [parentExecuted, parentPlanned, item.parent_id],
                                (updateErr) => {
                                  if (!updateErr) {
                                    updateMasterItemStatus(item.parent_id, callback);
                                  } else {
                                    if (callback) callback(updateErr);
                                  }
                                }
                              );
                            } else {
                              if (callback) callback(sumErr || new Error("Failed to calculate parent sums"));
                            }
                          }
                        );
                      } else {
                        if (callback) callback(null);
                      }
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
}

function getTowerOptions(towerCount) {
  const count = Number.isInteger(Number(towerCount)) ? Number(towerCount) : 1;
  return TOWER_LETTERS.slice(
    0,
    Math.min(Math.max(count, 1), TOWER_LETTERS.length),
  ).map((letter) => `Torre ${letter}`);
}

function normalizeTowerStr(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function validateProjectTower(projectName, tower, callback) {
  db.get(
    "SELECT name, tower_count FROM projects WHERE name = ?",
    [projectName],
    (err, project) => {
      if (err) return callback(err);

      if (!project) {
        return callback(null, "La obra seleccionada no existe");
      }

      const validTowers = [
        ...getTowerOptions(project.tower_count),
        "Exteriores",
        "Subterráneo",
        "Áreas Comunes",
      ];
      const normalizedTower = normalizeTowerStr(tower);
      const matched = validTowers.find((vt) => normalizeTowerStr(vt) === normalizedTower);

      if (!matched) {
        return callback(
          null,
          `La torre o sector seleccionado no pertenece a la obra. Debe ser uno de: ${validTowers.join(", ")}`,
        );
      }

      callback(null, "", matched);
    },
  );
}

function normalizeScopeType(value) {
  const normalized = normalizeScopeTypeValue(value);
  return VALID_SCOPE_TYPES.includes(normalized) ||
    normalized === "vertical" ||
    normalized === "obra"
    ? normalized
    : SCOPE_TYPES.PISO;
}

function normalizeScopePayload(payload) {
  const scopeType = normalizeScopeTypeValue(payload.scope_type);
  let tower = String(payload.tower || "").trim();
  let floor = String(payload.floor || "").trim();
  let departments = String(payload.departments || "").trim();

  switch (scopeType) {
    case SCOPE_TYPES.TORRE:
      return {
        scope_type: scopeType,
        tower,
        floor: "",
        departments: "",
      };
    case SCOPE_TYPES.PISO:
      return {
        scope_type: scopeType,
        tower,
        floor,
        departments: "",
      };
    case SCOPE_TYPES.DEPARTAMENTO:
      return {
        scope_type: scopeType,
        tower,
        floor,
        departments,
      };
    case SCOPE_TYPES.PASILLO:
    case SCOPE_TYPES.ESPACIOS_COMUNES:
    case SCOPE_TYPES.SALAS_ASIGNABLES:
    case SCOPE_TYPES.BODEGAS:
    case SCOPE_TYPES.MULTIPLES_PISOS:
      return {
        scope_type: scopeType,
        tower,
        floor,
        departments: "",
      };
    default:
      if (isVerticalScope(scopeType)) {
        return {
          scope_type: scopeType,
          tower,
          floor: "",
          departments: "",
        };
      }

      return {
        scope_type: SCOPE_TYPES.PISO,
        tower,
        floor,
        departments: "",
      };
  }
}

function validateMasterItemPayload(payload) {
  const scopeType = normalizeScopeTypeValue(payload.scope_type);
  const scopeFields = normalizeScopePayload(payload);

  const requiredFields = [
    [payload.project, "Debe seleccionar una obra/proyecto"],
    [payload.activity, "Debe ingresar una actividad"],
    [payload.start_date, "Debe ingresar la fecha de inicio"],
    [payload.end_date, "Debe ingresar la fecha de termino"],
    [payload.unit, "Debe seleccionar una unidad de medición"],
    [payload.crew_name, "Debe ingresar el nombre de la cuadrilla"],
    [payload.observations, "Debe ingresar observaciones"],
  ];
  const missingField = requiredFields.find(([value]) => isBlank(value));
  if (missingField) return missingField[1];

  const unit = String(payload.unit || "").trim().toLowerCase();
  if (!VALID_UNITS.includes(unit)) {
    return `Unidad de medición inválida. Debe ser una de: ${VALID_UNITS.join(", ")}`;
  }

  switch (scopeType) {
    case SCOPE_TYPES.TORRE:
      if (isBlank(scopeFields.tower)) return "Debe seleccionar una torre";
      break;
    case SCOPE_TYPES.PISO:
      if (isBlank(scopeFields.tower)) return "Debe seleccionar una torre";
      if (isBlank(scopeFields.floor)) return "Debe seleccionar al menos un piso";
      break;
    case SCOPE_TYPES.DEPARTAMENTO:
      if (isBlank(scopeFields.tower)) return "Debe seleccionar una torre";
      if (isBlank(scopeFields.floor)) return "Debe seleccionar el piso del departamento";
      if (isBlank(scopeFields.departments)) return "Debe ingresar al menos un departamento";
      break;
    case SCOPE_TYPES.PASILLO:
    case SCOPE_TYPES.ESPACIOS_COMUNES:
    case SCOPE_TYPES.SALAS_ASIGNABLES:
    case SCOPE_TYPES.BODEGAS:
      if (isBlank(scopeFields.tower)) return "Debe seleccionar una torre";
      if (isBlank(scopeFields.floor)) return "Debe seleccionar el piso";
      break;
    case SCOPE_TYPES.MULTIPLES_PISOS:
      if (isBlank(scopeFields.tower)) return "Debe seleccionar una torre";
      if (isBlank(scopeFields.floor)) return "Debe seleccionar al menos un piso";
      break;
    default:
      if (isVerticalScope(scopeType)) {
        if (isBlank(scopeFields.tower)) return "Debe seleccionar una torre";
      }
      break;
  }

  if (!payload.planned_qty || toNumber(payload.planned_qty) <= 0) {
    return "Debe ingresar una cantidad planificada mayor a 0";
  }

  const crewMembers = safeParseArray(payload.crew_members).filter(
    (member) => !isBlank(member?.name) || !isBlank(member?.role),
  );
  if (crewMembers.length === 0) {
    return "Debe agregar al menos una persona en Integrantes de la Cuadrilla";
  }

  const crewMemberNames = crewMembers
    .map((member) => String(member?.name || "").trim())
    .filter(Boolean);
  if (new Set(crewMemberNames).size !== crewMemberNames.length) {
    return "No se puede repetir el mismo integrante dentro de la cuadrilla";
  }

  if (
    crewMembers.some((member) => isBlank(member?.name) || isBlank(member?.role))
  ) {
    return "Cada integrante de la cuadrilla debe tener nombre y cargo";
  }

  return "";
}

function validateDailyLogPayload(payload) {
  const requiredFields = [
    [payload.date, "Debe ingresar la fecha del reporte"],
    [payload.supervisor, "Debe seleccionar un supervisor"],
    [payload.crew_name, "Debe ingresar la cuadrilla"],
    [payload.capataz_name, "Debe ingresar el nombre del capataz"],
    [payload.observations, "Debe ingresar observaciones"],
  ];
  const missingField = requiredFields.find(([value]) => isBlank(value));
  if (missingField) return missingField[1];

  if (!payload.executed_today || toNumber(payload.executed_today) <= 0) {
    return "Debe ingresar la cantidad ejecutada hoy";
  }

  if (!payload.hours_worked || toNumber(payload.hours_worked) <= 0) {
    return "Debe ingresar las horas trabajadas";
  }

  if (payload.has_restriction && isBlank(payload.restriction_detail)) {
    return "Debe ingresar el detalle de la restriccion";
  }

  const crewWorkers = safeParseArray(payload.crew_workers).filter(
    (worker) =>
      !isBlank(worker?.name) ||
      !isBlank(worker?.role) ||
      !isBlank(worker?.hours) ||
      !isBlank(worker?.executed),
  );
  if (crewWorkers.length === 0) {
    return "Debe agregar al menos una persona en personal presente";
  }
  if (
    crewWorkers.some(
      (worker) =>
        isBlank(worker?.name) ||
        isBlank(worker?.role) ||
        !worker?.hours ||
        toNumber(worker.hours) <= 0 ||
        worker?.executed === undefined ||
        worker?.executed === null ||
        String(worker.executed).trim() === "" ||
        Number(worker.executed) < 0,
    )
  ) {
    return "Cada persona presente debe tener nombre, cargo, horas y ejecutado";
  }

  const executedToday = toNumber(payload.executed_today);
  const hasWorkerExceedingToday = crewWorkers.some((w) => toNumber(w.executed) > executedToday);
  if (hasWorkerExceedingToday) {
    return `El ejecutado de cada integrante no puede superar la cantidad ejecutada hoy (${executedToday}).`;
  }

  return "";
}

function getFloorValues(floor) {
  const floors = String(floor || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return floors.length > 0 ? floors : [""];
}

router.get("/", (req, res) => {
  db.all("SELECT * FROM master_items ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json(rows);
  });
});

router.get("/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM master_items WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!row) {
      return res.status(404).json({ error: "Ítem no encontrado" });
    }

    res.json(row);
  });
});

router.post("/", (req, res) => {
  const validationError = validateMasterItemPayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const scopeFields = normalizeScopePayload(req.body);
  const {
    project,
    activity,
    start_date,
    end_date,
    planned_qty,
    executed_qty,
    unit,
    crew_name,
    crew_size,
    crew_members,
    restrictions,
    observations,
    status,
    release_status,
    floor_planned_qtys,
  } = req.body;

  const { tower, floor, scope_type, departments } = scopeFields;
  const zone_type = req.body.zone_type || (
    tower === "Subterráneo" ? "subterraneo" :
    tower === "Exteriores" ? "exterior" :
    tower === "Áreas Comunes" ? "comun" :
    isVerticalScope(scope_type) ? "vertical" : "torre"
  );

  const runInsert = () => {
    if (scope_type === "multiples_pisos") {
      // First, insert parent item
      const parentSql = `
        INSERT INTO master_items (
          project, tower, floor, scope_type, departments, activity, start_date, end_date,
          planned_qty, executed_qty, unit, crew_name, crew_size, crew_members, restrictions,
          observations, status, release_status, parent_id, zone_type
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      `;
      
      const floorsList = getFloorValues(floor);
      const totalPlanned = floorsList.reduce((sum, f) => {
        const q = floor_planned_qtys && floor_planned_qtys[f] !== undefined
          ? toNumber(floor_planned_qtys[f])
          : toNumber(planned_qty) / floorsList.length;
        return sum + q;
      }, 0);

      const parentValues = [
        project || "",
        tower || "",
        floor || "",
        scope_type,
        departments || "",
        activity || "",
        start_date || "",
        end_date || "",
        totalPlanned,
        0,
        String(unit || "und").trim().toLowerCase(),
        crew_name || "",
        toNumber(crew_size),
        stringifyArray(crew_members),
        restrictions || "",
        observations || "",
        status || "pendiente",
        release_status || "no_liberado",
        zone_type,
      ];

      db.run(parentSql, parentValues, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const parentId = this.lastID;
        const createdItems = [];

        // Insert child items
        const childSql = `
          INSERT INTO master_items (
            project, tower, floor, scope_type, departments, activity, start_date, end_date,
            planned_qty, executed_qty, unit, crew_name, crew_size, crew_members, restrictions,
            observations, status, release_status, parent_id, zone_type
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const statement = db.prepare(childSql);
        const insertNextChild = (index) => {
          if (index >= floorsList.length) {
            statement.finalize((err) => {
              if (err) return res.status(500).json({ error: err.message });
              
              // Recalculate parent status based on children
              updateMasterItemStatus(parentId, (err) => {
                if (err) console.error("Error updating parent status:", err);
                
                db.get("SELECT * FROM master_items WHERE id = ?", [parentId], (err, parentRow) => {
                  return res.status(201).json({
                    ...parentRow,
                    created_items: createdItems,
                  });
                });
              });
            });
            return;
          }

          const floorVal = floorsList[index];
          const childPlanned = floor_planned_qtys && floor_planned_qtys[floorVal] !== undefined
            ? toNumber(floor_planned_qtys[floorVal])
            : toNumber(planned_qty) / floorsList.length;

          const childValues = [
            project || "",
            tower || "",
            floorVal,
            scope_type,
            departments || "",
            activity || "",
            start_date || "",
            end_date || "",
            childPlanned,
            0,
            String(unit || "und").trim().toLowerCase(),
            crew_name || "",
            toNumber(crew_size),
            stringifyArray(crew_members),
            restrictions || "",
            observations || "",
            status || "pendiente",
            release_status || "no_liberado",
            parentId,
            zone_type,
          ];

          statement.run(childValues, function (err) {
            if (err) {
              statement.finalize(() => {});
              return res.status(500).json({ error: err.message });
            }
            const childId = this.lastID;
            updateMasterItemStatus(childId, (err) => {
              db.get("SELECT * FROM master_items WHERE id = ?", [childId], (err, row) => {
                createdItems.push(row);
                insertNextChild(index + 1);
              });
            });
          });
        };

        insertNextChild(0);
      });
      return;
    }

    const sql = `
      INSERT INTO master_items (
        project,
        tower,
        floor,
        scope_type,
        departments,
        activity,
        start_date,
        end_date,
        planned_qty,
        executed_qty,
        unit,
        crew_name,
        crew_size,
        crew_members,
        restrictions,
        observations,
        status,
        release_status,
        zone_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const buildItem = (id, floorValue) => ({
      id,
      project: project || "",
      tower: tower || "",
      floor: floorValue,
      scope_type: scope_type || SCOPE_TYPES.PISO,
      departments: departments || "",
      activity: activity || "",
      start_date: start_date || "",
      end_date: end_date || "",
      planned_qty: toNumber(planned_qty),
      executed_qty: toNumber(executed_qty),
      unit: String(unit || "und").trim().toLowerCase(),
      crew_name: crew_name || "",
      crew_size: toNumber(crew_size),
      crew_members: stringifyArray(crew_members),
      restrictions: restrictions || "",
      observations: observations || "",
      status: status || "pendiente",
      release_status: release_status || "no_liberado",
      zone_type,
    });

    const buildValues = (floorValue) => [
      project || "",
      tower || "",
      floorValue,
      scope_type || SCOPE_TYPES.PISO,
      departments || "",
      activity || "",
      start_date || "",
      end_date || "",
      toNumber(planned_qty),
      toNumber(executed_qty),
      String(unit || "und").trim().toLowerCase(),
      crew_name || "",
      toNumber(crew_size),
      stringifyArray(crew_members),
      restrictions || "",
      observations || "",
      status || "pendiente",
      release_status || "no_liberado",
      zone_type,
    ];

    const floorValues =
      scope_type === SCOPE_TYPES.PISO
        ? getFloorValues(floor)
        : [floor || ""];
    const createdItems = [];

    db.serialize(() => {
      const statement = db.prepare(sql);

      const insertNext = (index) => {
        if (index >= floorValues.length) {
          statement.finalize((err) => {
            if (err) return res.status(500).json({ error: err.message });

            const firstItem = createdItems[0] || buildItem(null, "");
            return res.status(201).json({
              ...firstItem,
              created_items: createdItems,
            });
          });
          return;
        }

        const floorValue = floorValues[index];

        statement.run(buildValues(floorValue), function (err) {
          if (err) {
            statement.finalize(() => {});
            return res.status(500).json({ error: err.message });
          }

          const newId = this.lastID;
          updateMasterItemStatus(newId, (err) => {
            if (err) console.error("Error updating status on POST:", err);

            db.get("SELECT * FROM master_items WHERE id = ?", [newId], (err, row) => {
              createdItems.push(row || buildItem(newId, floorValue));
              insertNext(index + 1);
            });
          });
        });
      };

      insertNext(0);
    });
  };

  if (isBlank(tower)) {
    runInsert();
    return;
  }

  validateProjectTower(project, tower, (err, towerValidationError, canonicalTower) => {
    if (err) return res.status(500).json({ error: err.message });
    if (towerValidationError)
      return res.status(400).json({ error: towerValidationError });

    if (canonicalTower) {
      scopeFields.tower = canonicalTower;
    }

    runInsert();
  });
});

router.put("/:id", (req, res) => {
  const { id } = req.params;

  const validationError = validateMasterItemPayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const scopeFields = normalizeScopePayload(req.body);
  const {
    project,
    activity,
    start_date,
    end_date,
    planned_qty,
    unit,
    crew_name,
    crew_size,
    crew_members,
    restrictions,
    observations,
    status,
    release_status,
  } = req.body;

  const { tower, floor, scope_type, departments } = scopeFields;
  const zone_type = req.body.zone_type || (
    tower === "Subterráneo" ? "subterraneo" :
    tower === "Exteriores" ? "exterior" :
    tower === "Áreas Comunes" ? "comun" :
    isVerticalScope(scope_type) ? "vertical" : "torre"
  );

  const runUpdate = () => {
    db.get(
      "SELECT executed_qty FROM master_items WHERE id = ?",
      [id],
      (err, current) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!current)
          return res.status(404).json({ error: "Item no encontrado" });

        const sql = `
        UPDATE master_items
        SET
          project = ?, tower = ?, floor = ?, scope_type = ?,
          departments = ?,
          activity = ?, start_date = ?, end_date = ?, planned_qty = ?,
          unit = ?, crew_name = ?, crew_size = ?, crew_members = ?,
          restrictions = ?, observations = ?, status = ?, release_status = ?,
          zone_type = ?
        WHERE id = ?
      `;

        const values = [
          project || "",
          tower || "",
          floor || "",
          scope_type || SCOPE_TYPES.PISO,
          departments || "",
          activity || "",
          start_date || "",
          end_date || "",
          toNumber(planned_qty),
          String(unit || "und").trim().toLowerCase(),
          crew_name || "",
          toNumber(crew_size),
          stringifyArray(crew_members),
          restrictions || "",
          observations || "",
          status || "pendiente",
          release_status || "no_liberado",
          zone_type,
          id,
        ];

        db.run(sql, values, function (err) {
          if (err) return res.status(500).json({ error: err.message });
          if (this.changes === 0)
            return res.status(404).json({ error: "Item no encontrado" });

          db.get("SELECT scope_type, parent_id FROM master_items WHERE id = ?", [id], (err, currentItem) => {
            if (currentItem && currentItem.scope_type === "multiples_pisos" && !currentItem.parent_id) {
              const propagateSql = `
                UPDATE master_items
                SET
                  project = ?, tower = ?, activity = ?, start_date = ?, end_date = ?,
                  unit = ?, crew_name = ?, crew_size = ?, crew_members = ?,
                  restrictions = ?, observations = ?, status = ?, release_status = ?,
                  zone_type = ?
                WHERE parent_id = ?
              `;
              db.run(propagateSql, [
                project || "", tower || "", activity || "", start_date || "", end_date || "",
                String(unit || "und").trim().toLowerCase(), crew_name || "", toNumber(crew_size),
                stringifyArray(crew_members), restrictions || "", observations || "",
                status || "pendiente", release_status || "no_liberado",
                zone_type,
                id
              ], (propErr) => {
                if (propErr) console.error("Error propagating updates to children:", propErr);
                
                db.all("SELECT id FROM master_items WHERE parent_id = ?", [id], (err, childRows) => {
                  if (childRows && childRows.length > 0) {
                    let doneCount = 0;
                    childRows.forEach(c => {
                      updateMasterItemStatus(c.id, () => {
                        doneCount++;
                        if (doneCount === childRows.length) {
                          updateMasterItemStatus(Number(id), (err) => {
                            if (err) console.error("Error updating status on PUT parent:", err);
                            db.get("SELECT * FROM master_items WHERE id = ?", [id], (err, row) => {
                              res.json(row);
                            });
                          });
                        }
                      });
                    });
                  } else {
                    updateMasterItemStatus(Number(id), (err) => {
                      if (err) console.error("Error updating status on PUT:", err);
                      db.get("SELECT * FROM master_items WHERE id = ?", [id], (err, row) => {
                        res.json(row);
                      });
                    });
                  }
                });
              });
            } else {
              updateMasterItemStatus(Number(id), (err) => {
                if (err) console.error("Error updating status on PUT:", err);
                db.get("SELECT * FROM master_items WHERE id = ?", [id], (err, row) => {
                  if (err || !row) {
                    res.json({
                      id: Number(id),
                      project: project || "",
                      tower: tower || "",
                      floor: floor || "",
                      scope_type: scope_type || SCOPE_TYPES.PISO,
                      departments: departments || "",
                      activity: activity || "",
                      start_date: start_date || "",
                      end_date: end_date || "",
                      planned_qty: toNumber(planned_qty),
                      executed_qty: current.executed_qty,
                      unit: String(unit || "und").trim().toLowerCase(),
                      crew_name: crew_name || "",
                      crew_size: toNumber(crew_size),
                      crew_members: stringifyArray(crew_members),
                      restrictions: restrictions || "",
                      observations: observations || "",
                      status: status || "pendiente",
                      release_status: release_status || "no_liberado",
                    });
                  } else {
                    res.json(row);
                  }
                });
              });
            }
          });
        });
      },
    );
  };

  if (isBlank(tower)) {
    runUpdate();
    return;
  }

  validateProjectTower(project, tower, (err, towerValidationError, canonicalTower) => {
    if (err) return res.status(500).json({ error: err.message });
    if (towerValidationError)
      return res.status(400).json({ error: towerValidationError });

    if (canonicalTower) {
      scopeFields.tower = canonicalTower;
    }

    runUpdate();
  });
});

router.delete("/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM master_items WHERE id = ?", [id], (err, item) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!item) {
      return res.status(404).json({ error: "Ítem no encontrado" });
    }

    db.serialize(() => {
      db.run("DELETE FROM site_photos WHERE master_item_id = ?", [id]);
      db.run("DELETE FROM daily_logs WHERE master_item_id = ?", [id]);

      db.all("SELECT id FROM master_items WHERE parent_id = ?", [id], (err, children) => {
        if (!err && children && children.length > 0) {
          children.forEach((c) => {
            db.run("DELETE FROM site_photos WHERE master_item_id = ?", [c.id]);
            db.run("DELETE FROM daily_logs WHERE master_item_id = ?", [c.id]);
            db.run("DELETE FROM master_items WHERE id = ?", [c.id]);
          });
        }
      });

      db.run("DELETE FROM master_items WHERE id = ?", [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Ítem eliminado correctamente" });
      });
    });
  });
});

router.get("/:id/daily-logs", (req, res) => {
  const { id } = req.params;

  db.all(
    "SELECT * FROM daily_logs WHERE master_item_id = ? ORDER BY date DESC, id DESC",
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      res.json(rows);
    },
  );
});

router.post("/:id/daily-logs", (req, res) => {
  const { id } = req.params;

  const {
    date,
    executed_today,
    supervisor,
    crew_name,
    crew_workers,
    hours_worked,
    has_restriction,
    restriction_detail,
    observations,
    capataz_name,
    capataz_signature,
    project,
    tower,
    floor,
    activity,
  } = req.body;

  const validationError = validateDailyLogPayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  db.get("SELECT * FROM master_items WHERE id = ?", [id], (err, item) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!item) {
      return res.status(404).json({ error: "Ítem no encontrado" });
    }

    const executedToday = toNumber(executed_today);

    const insertSql = `
      INSERT INTO daily_logs (
        master_item_id,
        project,
        tower,
        floor,
        activity,
        date,
        executed_today,
        supervisor,
        crew_name,
        crew_workers,
        hours_worked,
        has_restriction,
        restriction_detail,
        observations,
        capataz_name,
        capataz_signature
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      id,
      project || item.project || "",
      tower || item.tower || "",
      floor || item.floor || "",
      activity || item.activity || "",
      date || "",
      executedToday,
      supervisor || "",
      crew_name || item.crew_name || "",
      stringifyArray(crew_workers),
      toNumber(hours_worked),
      has_restriction ? 1 : 0,
      restriction_detail || "",
      observations || "",
      capataz_name || "",
      capataz_signature || "",
    ];

    db.run(insertSql, values, function (err) {
      if (err) return res.status(500).json({ error: err.message });

      const newExecutedQty = toNumber(item.executed_qty) + executedToday;

      db.run(
        `
          UPDATE master_items
          SET executed_qty = ?
          WHERE id = ?
        `,
        [newExecutedQty, id],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });

          res.status(201).json({
            id: this.lastID,
            master_item_id: Number(id),
            project: project || item.project || "",
            tower: tower || item.tower || "",
            floor: floor || item.floor || "",
            activity: activity || item.activity || "",
            date: date || "",
            executed_today: executedToday,
            supervisor: supervisor || "",
            crew_name: crew_name || item.crew_name || "",
            crew_workers: stringifyArray(crew_workers),
            hours_worked: toNumber(hours_worked),
            has_restriction: has_restriction ? 1 : 0,
            restriction_detail: restriction_detail || "",
            observations: observations || "",
            capataz_name: capataz_name || "",
            capataz_signature: capataz_signature || "",
          });
        },
      );
    });
  });
});

router.post("/bulk", (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "El cuerpo de la solicitud debe ser un array de ítems." });
  }

  if (items.length === 0) {
    return res.json({ message: "No se enviaron ítems para guardar.", count: 0 });
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION", (err) => {
      if (err) {
        return res.status(500).json({ error: "No se pudo iniciar la transacción: " + err.message });
      }

      const sql = `
        INSERT INTO master_items (
          project,
          tower,
          floor,
          scope_type,
          departments,
          activity,
          start_date,
          end_date,
          planned_qty,
          executed_qty,
          unit,
          crew_name,
          crew_size,
          crew_members,
          restrictions,
          observations,
          status,
          release_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const stmt = db.prepare(sql, (prepareErr) => {
        if (prepareErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: "Error al preparar la consulta SQL: " + prepareErr.message });
        }

        let errorOccurred = null;

        for (const item of items) {
          // Normalize inputs
          const projectVal = String(item.project || "").trim();
          const towerVal = String(item.tower || "").trim();
          const floorVal = String(item.floor || "").trim();
          const scopeTypeVal = String(item.scope_type || "piso").trim().toLowerCase();
          const departmentsVal = String(item.departments || "").trim();
          const activityVal = String(item.activity || "").trim();
          const startDateVal = String(item.start_date || "").trim();
          const endDateVal = String(item.end_date || "").trim();
          const plannedQtyVal = Number(item.planned_qty || 0);
          const executedQtyVal = Number(item.executed_qty || 0);
          const unitVal = String(item.unit || "und").trim();
          const crewNameVal = String(item.crew_name || "").trim();
          const crewSizeVal = Number(item.crew_size || 0);
          const crewMembersVal = String(item.crew_members || "[]");
          const restrictionsVal = String(item.restrictions || "").trim();
          const observationsVal = String(item.observations || "").trim();
          const statusVal = String(item.status || "pendiente").trim();
          const releaseStatusVal = String(item.release_status || "no_liberado").trim();

          stmt.run(
            [
              projectVal,
              towerVal,
              floorVal,
              scopeTypeVal,
              departmentsVal,
              activityVal,
              startDateVal,
              endDateVal,
              plannedQtyVal,
              executedQtyVal,
              unitVal,
              crewNameVal,
              crewSizeVal,
              crewMembersVal,
              restrictionsVal,
              observationsVal,
              statusVal,
              releaseStatusVal
            ],
            (runErr) => {
              if (runErr) {
                errorOccurred = runErr.message;
              }
            }
          );

          if (errorOccurred) {
            break;
          }
        }

        stmt.finalize((finalizeErr) => {
          if (errorOccurred || finalizeErr) {
            const finalErr = errorOccurred || finalizeErr.message;
            db.run("ROLLBACK", () => {
              res.status(500).json({ error: "Error durante la inserción masiva: " + finalErr });
            });
          } else {
            db.run("COMMIT", (commitErr) => {
              if (commitErr) {
                res.status(500).json({ error: "Error al confirmar la transacción: " + commitErr.message });
              } else {
                res.json({
                  message: "Inserción masiva completada con éxito.",
                  count: items.length
                });
              }
            });
          }
        });
      });
    });
  });
});

module.exports = router;
