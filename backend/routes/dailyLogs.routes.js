const express = require("express");
const db = require("../db/connection");
const fs = require("fs");
const path = require("path");

const router = express.Router();

function saveBase64Signature(imageBase64) {
  if (!imageBase64 || typeof imageBase64 !== "string" || !imageBase64.startsWith("data:image/")) {
    return imageBase64 || "";
  }
  try {
    const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+_-]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    if (!buffer.length) return "";
    
    const fileName = `firma-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
    const uploadsDir = path.join(__dirname, "..", "uploads");
    const signaturesDir = path.join(uploadsDir, "signatures");
    
    // Ensure directories exist
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    if (!fs.existsSync(signaturesDir)) fs.mkdirSync(signaturesDir, { recursive: true });
    
    const filePath = path.join(signaturesDir, fileName);
    fs.writeFileSync(filePath, buffer);
    return `/uploads/signatures/${fileName}`;
  } catch (error) {
    console.error("Error saving base64 signature in backend:", error);
    return imageBase64 || "";
  }
}

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

function parseDailyLog(row) {
  return {
    ...row,
    crew_workers: safeParseArray(row.crew_workers),
    has_restriction: Boolean(row.has_restriction),
    is_zero_progress: Boolean(
      row.is_zero_progress === 1 ||
      row.is_zero_progress === true ||
      row.is_zero_progress === "true" ||
      (Number(row.executed_today) === 0 && Number(row.hours_worked) === 0 && row.has_restriction)
    ),
  };
}

function updateWorkersCurrentActivity(db, crewWorkers, project, fullRuta) {
  const workers = safeParseArray(crewWorkers);
  if (workers.length === 0) return;

  db.serialize(() => {
    const stmt = db.prepare(
      "UPDATE project_workers SET current_activity = ? WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND project = ?"
    );

    workers.forEach((worker) => {
      if (worker && worker.name) {
        stmt.run([fullRuta, String(worker.name).trim(), project]);
      }
    });

    stmt.finalize();
  });
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

function isBlank(value) {
  return !String(value || "").trim();
}

function validateDailyLogPayload(payload) {
  const { floor_data } = payload;
  const hasFloorObservations = floor_data && Object.values(floor_data).some(fd => !isBlank(fd?.observations));

  const requiredFields = [
    [payload.date, "Debe ingresar la fecha del reporte"],
    [payload.supervisor, "Debe seleccionar un supervisor"],
    [payload.crew_name, "Debe ingresar la cuadrilla"],
    [payload.capataz_name, "Debe ingresar el nombre del capataz"],
    [hasFloorObservations ? "ok" : payload.observations, "Debe ingresar observaciones"],
  ];
  const missingField = requiredFields.find(([value]) => isBlank(value));
  if (missingField) return missingField[1];

  const isZeroProgress =
    (payload.has_restriction && (payload.is_zero_progress === true || payload.is_zero_progress === "true" || payload.is_zero_progress === 1 || payload.is_zero_progress === "1")) ||
    (toNumber(payload.executed_today) === 0 && toNumber(payload.hours_worked) === 0 && payload.has_restriction);

  if (floor_data) {
    const floors = Object.keys(floor_data);
    if (floors.length === 0) {
      return "Debe seleccionar al menos un piso";
    }

    for (const fl of floors) {
      const fd = floor_data[fl];
      const flZero =
        (fd.has_restriction && (fd.is_zero_progress === true || fd.is_zero_progress === "true" || fd.is_zero_progress === 1 || fd.is_zero_progress === "1")) ||
        (toNumber(fd.executed_today) === 0 && toNumber(fd.hours_worked !== undefined && fd.hours_worked !== "" ? fd.hours_worked : payload.hours_worked) === 0 && fd.has_restriction);
      const val = toNumber(fd.executed_today);
      const hoursVal = toNumber(fd.hours_worked !== undefined && fd.hours_worked !== "" ? fd.hours_worked : payload.hours_worked);

      if (flZero || val === 0) {
        if (val < 0) return `La cantidad ejecutada para el ${fl} no puede ser menor a 0.`;
        if (hoursVal < 0) return `Las horas trabajadas para el ${fl} no pueden ser menores a 0.`;
        if (!fd.has_restriction || isBlank(fd.restriction_detail)) {
          return `Para reportar avance 0 en ${fl} debe indicar la restricción o motivo que impidió el avance`;
        }
      } else {
        if (!fd.executed_today || val <= 0) return `Debe ingresar la cantidad ejecutada hoy para el ${fl}`;
        if (hoursVal <= 0) return `Debe ingresar las horas trabajadas para el ${fl}`;
      }

      if (fd.has_restriction && isBlank(fd.restriction_detail)) {
        return `Debe ingresar el detalle de la restricción para el ${fl}`;
      }

      const flWorkersRaw = Array.isArray(fd.crew_workers) && fd.crew_workers.length > 0
        ? fd.crew_workers
        : safeParseArray(payload.crew_workers);

      const flWorkers = flWorkersRaw.filter(
        (w) => !isBlank(w?.name) || !isBlank(w?.role) || !isBlank(w?.hours) || !isBlank(w?.executed)
      );

      if (!flZero && val > 0 && flWorkers.length === 0) {
        return `Debe agregar al menos una persona en personal presente para el ${fl}`;
      }

      if (
        flWorkers.some(
          (worker) =>
            isBlank(worker?.name) ||
            isBlank(worker?.role) ||
            (!flZero && (!worker?.hours || toNumber(worker.hours) <= 0)) ||
            toNumber(worker?.hours) < 0 ||
            toNumber(worker?.executed) < 0
        )
      ) {
        return flZero
          ? `Cada persona en ${fl} debe tener nombre y cargo válidos`
          : `Cada persona en ${fl} debe tener nombre, cargo, horas y ejecutado`;
      }

      const hasWorkerExceedingToday = flWorkers.some(
        (w) => toNumber(w.executed) > val
      );
      if (!flZero && hasWorkerExceedingToday) {
        return `En el ${fl}, el ejecutado de cada integrante no puede superar la cantidad ejecutada hoy (${val}).`;
      }

      const hasWorkerExceedingHours = flWorkers.some(
        (w) => toNumber(w.hours) > hoursVal
      );
      if (!flZero && hoursVal > 0 && hasWorkerExceedingHours) {
        return `En el ${fl}, las horas de cada integrante no pueden superar las horas trabajadas (${hoursVal}h).`;
      }
    }

    return "";
  }

  const execVal = toNumber(payload.executed_today);
  const hoursVal = toNumber(payload.hours_worked);
  if (isZeroProgress || execVal === 0) {
    if (execVal < 0) {
      return "La cantidad ejecutada hoy no puede ser menor a 0";
    }
    if (hoursVal < 0) {
      return "Las horas trabajadas no pueden ser menores a 0";
    }
    if (!payload.has_restriction || isBlank(payload.restriction_detail)) {
      return "Para reportar avance 0 debe indicar la restricción o motivo que impidió el avance";
    }
  } else {
    if (!payload.executed_today || execVal <= 0) {
      return "Debe ingresar la cantidad ejecutada hoy";
    }
    if (!payload.hours_worked || hoursVal <= 0) {
      return "Debe ingresar las horas trabajadas";
    }
  }

  if (payload.has_restriction && isBlank(payload.restriction_detail)) {
    return "Debe ingresar el detalle de la restriccion";
  }

  const crewWorkers = safeParseArray(payload.crew_workers).filter(
    (worker) =>
      !isBlank(worker?.name) ||
      !isBlank(worker?.role) ||
      !isBlank(worker?.hours) ||
      !isBlank(worker?.executed)
  );

  if (!isZeroProgress && execVal > 0 && crewWorkers.length === 0) {
    return "Debe agregar al menos una persona en personal presente";
  }

  if (
    crewWorkers.some(
      (worker) =>
        isBlank(worker?.name) ||
        isBlank(worker?.role) ||
        (!isZeroProgress && (!worker?.hours || toNumber(worker.hours) <= 0)) ||
        toNumber(worker?.hours) < 0 ||
        toNumber(worker?.executed) < 0
    )
  ) {
    return isZeroProgress
      ? "Cada persona presente debe tener nombre y cargo válidos"
      : "Cada persona presente debe tener nombre, cargo, horas y ejecutado";
  }

  const hasWorkerExceedingToday = crewWorkers.some(
    (w) => toNumber(w.executed) > execVal
  );
  if (!isZeroProgress && hasWorkerExceedingToday) {
    return `El ejecutado de cada integrante no puede superar la cantidad ejecutada hoy (${execVal}).`;
  }

  const hasWorkerExceedingHours = crewWorkers.some(
    (w) => toNumber(w.hours) > hoursVal
  );
  if (!isZeroProgress && hoursVal > 0 && hasWorkerExceedingHours) {
    return `Las horas de cada integrante no pueden superar las horas trabajadas (${hoursVal}h).`;
  }

  return "";
}

router.get("/", (req, res) => {
  db.all("SELECT * FROM daily_logs ORDER BY date DESC, id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json(rows.map(parseDailyLog));
  });
});

router.get("/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM daily_logs WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!row) {
      return res.status(404).json({ error: "Reporte no encontrado" });
    }

    res.json(parseDailyLog(row));
  });
});

router.post("/", (req, res) => {
  const {
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
    capataz_signature,
    photos,
    floor_data,
    is_zero_progress,
  } = req.body;

  if (!master_item_id) {
    return res.status(400).json({
      error: "Falta master_item_id",
    });
  }

  const validationError = validateDailyLogPayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const savedSignature = saveBase64Signature(capataz_signature);

  db.get(
    "SELECT * FROM master_items WHERE id = ?",
    [Number(master_item_id)],
    (err, item) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!item) {
        return res.status(404).json({ error: "Ítem no encontrado" });
      }

      db.all("SELECT * FROM master_items WHERE parent_id = ?", [item.id], (err, children) => {
        if (err) return res.status(500).json({ error: err.message });

        if (children && children.length > 0) {
          // Parent item: redirect logs to children
          const logFloors = String(floor || "").split(",").map(f => f.trim()).filter(Boolean);
          const targetChildren = logFloors.length > 0
            ? children.filter(c => logFloors.some(lf => lf.trim().toLowerCase() === String(c.floor).trim().toLowerCase()))
            : children;

          if (targetChildren.length === 0) {
            return res.status(400).json({ error: "No se encontraron pisos válidos asociados a esta actividad." });
          }

          let totalExecutedToday = 0;
          let totalHours = 0;
          if (floor_data) {
            Object.values(floor_data).forEach(fd => {
              totalExecutedToday += toNumber(fd.executed_today);
              totalHours += toNumber(fd.hours_worked);
            });
          } else {
            totalExecutedToday = toNumber(executed_today);
            totalHours = toNumber(hours_worked);
          }

          const qtyPerChild = totalExecutedToday / targetChildren.length;

          const childSql = `
            INSERT INTO daily_logs (
              master_item_id, project, tower, floor, activity, date, executed_today,
              supervisor, crew_name, crew_workers, hours_worked, has_restriction,
              restriction_detail, observations, capataz_name, capataz_signature, is_zero_progress
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          const statement = db.prepare(childSql);
          const createdLogs = [];

          const insertNextChildLog = (index) => {
            if (index >= targetChildren.length) {
              statement.finalize((err) => {
                if (err) return res.status(500).json({ error: err.message });

                // Collect workers across floors
                let allReportWorkers = [];
                if (floor_data) {
                  Object.values(floor_data).forEach((fd) => {
                    if (Array.isArray(fd.crew_workers)) {
                      allReportWorkers.push(...fd.crew_workers);
                    }
                  });
                }
                if (allReportWorkers.length === 0) {
                  allReportWorkers = Array.isArray(crew_workers) ? crew_workers : [];
                }

                const scopeType = item.scope_type || "";
                const floorText = scopeType.startsWith("vertical")
                  ? "Vertical Completa"
                  : (item.floor || "General");
                const fullRuta = `${item.tower} / ${floorText} / ${item.activity}`;
                updateWorkersCurrentActivity(db, allReportWorkers, project || item.project, fullRuta);

                updateMasterItemStatus(item.id, (err) => {
                  if (err) console.error("Error updating parent status:", err);

                  const firstLog = createdLogs[0] || {};
                  res.status(201).json({
                    id: firstLog.id,
                    master_item_id: item.id,
                    project: project || item.project || "",
                    tower: tower || item.tower || "",
                    floor: floor || item.floor || "",
                    activity: activity || item.activity || "",
                    date: date || "",
                    executed_today: totalExecutedToday,
                    supervisor: supervisor || "",
                    crew_name: crew_name || item.crew_name || "",
                    crew_workers: safeParseArray(stringifyArray(crew_workers)),
                    hours_worked: totalHours,
                    has_restriction: Boolean(has_restriction),
                    restriction_detail: restriction_detail || "",
                    observations: observations || "",
                    capataz_name: capataz_name || "",
                    capataz_signature: savedSignature,
                    created_logs: createdLogs,
                  });
                });
              });
              return;
            }

            const child = targetChildren[index];
            const childFloorKey = Object.keys(floor_data || {}).find(
              (k) => k.trim().toLowerCase() === String(child.floor).trim().toLowerCase()
            );
            const childFloorData = childFloorKey ? floor_data[childFloorKey] : (floor_data?.[child.floor] || {});
            const childExecutedToday = floor_data 
              ? toNumber(childFloorData.executed_today) 
              : qtyPerChild;
            const childHoursWorked = (floor_data && toNumber(childFloorData.hours_worked) > 0)
              ? toNumber(childFloorData.hours_worked) 
              : toNumber(hours_worked);

            const childHasRestriction = childFloorData.has_restriction !== undefined
              ? Boolean(childFloorData.has_restriction)
              : Boolean(has_restriction);
            const childRestrictionDetail = childFloorData.restriction_detail !== undefined
              ? (childFloorData.restriction_detail || "")
              : (restriction_detail || "");
            const childObservations = childFloorData.observations !== undefined
              ? (childFloorData.observations || "")
              : (observations || "");
            const childCapatazName = childFloorData.capataz_name || capataz_name || "";
            const childSignature = childFloorData.capataz_signature
              ? saveBase64Signature(childFloorData.capataz_signature)
              : (savedSignature || "");

            let childCrewWorkers = [];
            if (Array.isArray(childFloorData.crew_workers) && childFloorData.crew_workers.length > 0) {
              childCrewWorkers = childFloorData.crew_workers.map((w) => ({
                ...w,
                hours: toNumber(w.hours),
                executed: toNumber(w.executed),
              }));
            } else if (Array.isArray(crew_workers) && crew_workers.length > 0) {
              childCrewWorkers = crew_workers.map((w) => {
                const workerHours = (floor_data && toNumber(childFloorData.hours_worked) > 0)
                  ? toNumber(childFloorData.hours_worked)
                  : toNumber(w.hours);
                const wExec = totalExecutedToday > 0
                  ? Number(((toNumber(w.executed) * childExecutedToday) / totalExecutedToday).toFixed(2))
                  : 0;
                return {
                  ...w,
                  hours: workerHours,
                  executed: wExec,
                };
              });

              if (childCrewWorkers.length > 0 && childExecutedToday > 0) {
                const sumW = childCrewWorkers.reduce((acc, w) => acc + (Number(w.executed) || 0), 0);
                const diff = Number((childExecutedToday - sumW).toFixed(2));
                if (Math.abs(diff) > 0 && Math.abs(diff) < 0.1) {
                  childCrewWorkers[childCrewWorkers.length - 1].executed = Number(
                    (childCrewWorkers[childCrewWorkers.length - 1].executed + diff).toFixed(2)
                  );
                }
              }
            }

            const childIsZeroProgress = (
              childFloorData.is_zero_progress !== undefined
                ? Boolean(childFloorData.is_zero_progress)
                : (Boolean(is_zero_progress) || (childExecutedToday === 0 && childHoursWorked === 0 && childHasRestriction))
            ) ? 1 : 0;

            const childValues = [
              child.id,
              project || child.project || "",
              tower || child.tower || "",
              child.floor || "",
              activity || child.activity || "",
              date || "",
              childExecutedToday,
              supervisor || "",
              crew_name || child.crew_name || "",
              stringifyArray(childCrewWorkers),
              childHoursWorked,
              childHasRestriction ? 1 : 0,
              childRestrictionDetail,
              childObservations,
              childCapatazName,
              childSignature,
              childIsZeroProgress,
            ];

            statement.run(childValues, function (err) {
              if (err) {
                statement.finalize(() => {});
                return res.status(500).json({ error: err.message });
              }

              const logId = this.lastID;

              // Insert photos for child log
              const childPhotos = (Array.isArray(childFloorData.photos) && childFloorData.photos.length > 0)
                ? childFloorData.photos
                : (Array.isArray(photos) ? photos : []);

              if (childPhotos.length > 0) {
                const photoSql = `
                  INSERT INTO site_photos (daily_log_id, master_item_id, file_url, description, label, date)
                  VALUES (?, ?, ?, ?, ?, ?)
                `;
                const stmtPhoto = db.prepare(photoSql);
                childPhotos.forEach((p) => {
                  stmtPhoto.run(
                    logId,
                    child.id,
                    p.file_url || p.url || "",
                    p.description || "",
                    p.label || "reporte_diario",
                    p.date || date || new Date().toISOString().split("T")[0]
                  );
                });
                stmtPhoto.finalize();
              }

              const newExec = toNumber(child.executed_qty) + childExecutedToday;
              db.run("UPDATE master_items SET executed_qty = ? WHERE id = ?", [newExec, child.id], (err) => {
                updateMasterItemStatus(child.id, (err) => {
                  createdLogs.push({
                    id: logId,
                    master_item_id: child.id,
                    floor: child.floor,
                    executed_today: childExecutedToday,
                  });
                  insertNextChildLog(index + 1);
                });
              });
            });
          };

          insertNextChildLog(0);
        } else {
          // Normal single item log insertion
          const executedToday = toNumber(executed_today);
          const remainingQty = Math.max(toNumber(item.planned_qty) - toNumber(item.executed_qty), 0);

          const isZero = (
            Boolean(is_zero_progress) ||
            (executedToday === 0 && toNumber(hours_worked) === 0 && has_restriction)
          ) ? 1 : 0;

          if (!isZero && remainingQty <= 0) {
            return res.status(400).json({ error: "Este ítem ya alcanzó la cantidad planificada." });
          }

          if (!isZero && executedToday > remainingQty) {
            return res.status(400).json({
              error: `La cantidad ejecutada hoy no puede superar el pendiente (${remainingQty} ${
                item.unit || "und"
              }).`
            });
          }

          const sql = `
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
              capataz_signature,
              is_zero_progress
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          const values = [
            Number(master_item_id),
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
            savedSignature,
            isZero,
          ];

          db.run(sql, values, function (err) {
            if (err) return res.status(500).json({ error: err.message });

            const logId = this.lastID;

            // Insert photos for single log
            if (Array.isArray(photos) && photos.length > 0) {
              const photoSql = `
                INSERT INTO site_photos (daily_log_id, master_item_id, file_url, description, label, date)
                VALUES (?, ?, ?, ?, ?, ?)
              `;
              const stmtPhoto = db.prepare(photoSql);
              photos.forEach((p) => {
                stmtPhoto.run(
                  logId,
                  Number(master_item_id),
                  p.file_url || p.url || "",
                  p.description || "",
                  p.label || "reporte_diario",
                  p.date || date || new Date().toISOString().split("T")[0]
                );
              });
              stmtPhoto.finalize();
            }

            const scopeType = item.scope_type || "";
            const floorText = scopeType.startsWith("vertical")
              ? "Vertical Completa"
              : (item.floor || "General");
            const fullRuta = `${item.tower} / ${floorText} / ${item.activity}`;
            updateWorkersCurrentActivity(db, crew_workers, project || item.project, fullRuta);

            const newExecutedQty = toNumber(item.executed_qty) + executedToday;

            db.run(
              `
              UPDATE master_items
              SET executed_qty = ?
              WHERE id = ?
              `,
              [newExecutedQty, Number(master_item_id)],
              (err) => {
                if (err) return res.status(500).json({ error: err.message });

                updateMasterItemStatus(Number(master_item_id), (err) => {
                  if (err) console.error("Error updating status on POST:", err);

                  res.status(201).json({
                    id: logId,
                    master_item_id: Number(master_item_id),
                    project: project || item.project || "",
                    tower: tower || item.tower || "",
                    floor: floor || item.floor || "",
                    activity: activity || item.activity || "",
                    date: date || "",
                    executed_today: executedToday,
                    supervisor: supervisor || "",
                    crew_name: crew_name || item.crew_name || "",
                    crew_workers: safeParseArray(stringifyArray(crew_workers)),
                    hours_worked: toNumber(hours_worked),
                    has_restriction: Boolean(has_restriction),
                    restriction_detail: restriction_detail || "",
                    observations: observations || "",
                    capataz_name: capataz_name || "",
                    capataz_signature: savedSignature,
                  });
                });
              }
            );
          });
        }
      });
    }
  );
});

router.put("/:id", (req, res) => {
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
    floor,
    is_zero_progress,
  } = req.body;

  const validationError = validateDailyLogPayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  db.get("SELECT * FROM daily_logs WHERE id = ?", [id], (err, oldLog) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!oldLog) {
      return res.status(404).json({ error: "Reporte no encontrado" });
    }

    const oldExecuted = toNumber(oldLog.executed_today);
    const newExecuted = toNumber(executed_today);
    const difference = newExecuted - oldExecuted;

    const isZero = (
      Boolean(is_zero_progress) ||
      (newExecuted === 0 && toNumber(hours_worked) === 0 && has_restriction)
    ) ? 1 : 0;

    const sql = `
      UPDATE daily_logs
      SET
        date = ?,
        executed_today = ?,
        supervisor = ?,
        crew_name = ?,
        crew_workers = ?,
        hours_worked = ?,
        has_restriction = ?,
        restriction_detail = ?,
        observations = ?,
        capataz_name = ?,
        capataz_signature = ?,
        floor = ?,
        is_zero_progress = ?
      WHERE id = ?
    `;

    let savedSignature;
    if (capataz_signature) {
      savedSignature = saveBase64Signature(capataz_signature);
    } else {
      savedSignature = oldLog.capataz_signature || "";
    }

    const values = [
      date || "",
      newExecuted,
      supervisor || "",
      crew_name || "",
      stringifyArray(crew_workers),
      toNumber(hours_worked),
      has_restriction ? 1 : 0,
      restriction_detail || "",
      observations || "",
      capataz_name || "",
      savedSignature || "",
      floor || oldLog.floor || "",
      isZero,
      id,
    ];

    db.run(sql, values, function (err) {
      if (err) return res.status(500).json({ error: err.message });

      db.get(
        "SELECT tower, floor, activity, scope_type, project FROM master_items WHERE id = ?",
        [oldLog.master_item_id],
        (err, item) => {
          if (item) {
            const scopeType = item.scope_type || "";
            const floorText = scopeType.startsWith("vertical")
              ? "Vertical Completa"
              : (item.floor || "General");
            const fullRuta = `${item.tower} / ${floorText} / ${item.activity}`;
            updateWorkersCurrentActivity(db, crew_workers, item.project, fullRuta);
          }
        }
      );

      db.run(
        `
        UPDATE master_items
        SET executed_qty = executed_qty + ?
        WHERE id = ?
        `,
        [difference, oldLog.master_item_id],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });

          updateMasterItemStatus(oldLog.master_item_id, (err) => {
            if (err) console.error("Error updating status on PUT:", err);

            res.json({
              id: Number(id),
              master_item_id: oldLog.master_item_id,
              date: date || "",
              executed_today: newExecuted,
              supervisor: supervisor || "",
              crew_name: crew_name || "",
              crew_workers: safeParseArray(stringifyArray(crew_workers)),
              hours_worked: toNumber(hours_worked),
              has_restriction: Boolean(has_restriction),
              restriction_detail: restriction_detail || "",
              observations: observations || "",
              capataz_name: capataz_name || "",
              capataz_signature: savedSignature || "",
            });
          });
        }
      );
    });
  });
});

router.delete("/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM daily_logs WHERE id = ?", [id], (err, log) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!log) {
      return res.status(404).json({ error: "Reporte no encontrado" });
    }

    db.serialize(() => {
      db.run("DELETE FROM site_photos WHERE daily_log_id = ?", [id]);

      db.run("DELETE FROM daily_logs WHERE id = ?", [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });

        db.run(
          `UPDATE master_items SET executed_qty = MAX(0, executed_qty - ?) WHERE id = ?`,
          [toNumber(log.executed_today), log.master_item_id],
          (err) => {
            if (err) return res.status(500).json({ error: err.message });
            updateMasterItemStatus(log.master_item_id, (err) => {
              if (err) console.error("Error updating status on DELETE:", err);
              res.json({
                message: "Reporte diario eliminado correctamente",
                deleted_id: Number(id),
              });
            });
          }
        );
      });
    });
  });
});

module.exports = router;