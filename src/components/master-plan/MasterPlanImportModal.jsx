import React, { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Building2,
  Calendar,
  Users,
  Download,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";

// Helper to normalize Excel dates
function parseExcelDate(val) {
  if (!val) return "";
  if (val instanceof Date && !isNaN(val)) {
    return val.toISOString().split("T")[0];
  }
  if (typeof val === "number") {
    // Excel date serial number (days since 1900-01-01)
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split("T")[0];
  }
  const str = String(val).trim();
  // Format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  // Format DD-MM-YYYY or DD/MM/YYYY
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    }
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }
  return str;
}

// Extract Name and Role from string like "Juan Perez (Maestro)"
function parseWorkerString(str) {
  if (!str) return null;
  const trimmed = String(str).trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(.+?)\s*\((.*?)\)$/);
  if (match) {
    return {
      name: match[1].trim(),
      role: match[2].trim() || "Jornal",
    };
  }
  return {
    name: trimmed,
    role: "Jornal",
  };
}

export default function MasterPlanImportModal({
  open,
  onClose,
  projectName = "",
  existingItems = [],
  workers = [],
  onSuccess,
  onDownloadTemplate,
}) {
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [filterTab, setFilterTab] = useState("all"); // 'all' | 'valid' | 'issues'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  // Worker role lookup map
  const workerRoleMap = useMemo(() => {
    const map = {};
    if (Array.isArray(workers)) {
      workers.forEach((w) => {
        if (w.name) {
          map[w.name.trim().toLowerCase()] = w.role || "Jornal";
        }
      });
    }
    return map;
  }, [workers]);

  const handleReset = () => {
    setFile(null);
    setParsedRows([]);
    setSelectedIndices(new Set());
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setError("");
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });

        // Find sheet: either "📋 Plan Maestro" or first sheet
        const sheetName =
          workbook.SheetNames.find((s) => s.includes("Plan Maestro")) ||
          workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Convert to array of arrays
        const rawRows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          blankrows: false,
        });

        // Find header row: Look for row that has "Torre" or "Actividad"
        let headerRowIndex = rawRows.findIndex(
          (r) =>
            Array.isArray(r) &&
            r.some((c) => /torre/i.test(String(c)) || /actividad/i.test(String(c)))
        );

        if (headerRowIndex === -1) {
          headerRowIndex = 0;
        }

        const headers = rawRows[headerRowIndex].map((h) => String(h || "").trim());
        const dataRows = rawRows.slice(headerRowIndex + 1);

        // Map column indices
        const colIndices = {
          tower: headers.findIndex((h) => /torre/i.test(h)),
          floor: headers.findIndex((h) => /piso|ubicaci[oó]n|sector/i.test(h)),
          activity: headers.findIndex((h) => /actividad/i.test(h)),
          startDate: headers.findIndex((h) => /f\.?\s*inicio|fecha\s*inicio/i.test(h)),
          endDate: headers.findIndex((h) => /f\.?\s*t[eé]rmino|fecha\s*t[eé]rmino/i.test(h)),
          crew: headers.findIndex((h) => /cuadrilla/i.test(h)),
          worker1: headers.findIndex((h) => /trabajador\s*1/i.test(h)),
          worker2: headers.findIndex((h) => /trabajador\s*2/i.test(h)),
          worker3: headers.findIndex((h) => /trabajador\s*3/i.test(h)),
          worker4: headers.findIndex((h) => /trabajador\s*4/i.test(h)),
        };

        const rowsParsed = [];

        dataRows.forEach((row, idx) => {
          if (!Array.isArray(row) || row.length === 0) return;

          const tower = colIndices.tower !== -1 ? String(row[colIndices.tower] || "").trim() : "";
          const floor = colIndices.floor !== -1 ? String(row[colIndices.floor] || "").trim() : "General";
          const activity = colIndices.activity !== -1 ? String(row[colIndices.activity] || "").trim() : "";
          const startDate = colIndices.startDate !== -1 ? parseExcelDate(row[colIndices.startDate]) : "";
          const endDate = colIndices.endDate !== -1 ? parseExcelDate(row[colIndices.endDate]) : "";
          const crewName = colIndices.crew !== -1 ? String(row[colIndices.crew] || "").trim() : "Cuadrilla General";

          // Skip completely empty placeholder rows
          if (!tower && !activity && !startDate) return;

          // Parse workers from columns 1..4
          const rawWorkers = [];
          [colIndices.worker1, colIndices.worker2, colIndices.worker3, colIndices.worker4].forEach(
            (colIdx) => {
              if (colIdx !== -1 && row[colIdx]) {
                const parsed = parseWorkerString(row[colIdx]);
                if (parsed?.name) {
                  const roleFromDb = workerRoleMap[parsed.name.toLowerCase()];
                  rawWorkers.push({
                    name: parsed.name,
                    role: roleFromDb || parsed.role || "Jornal",
                  });
                }
              }
            }
          );

          // Validation checks
          const issues = [];
          if (!tower) issues.push("Falta indicar Torre");
          if (!activity) issues.push("Falta indicar Actividad");
          if (!startDate) issues.push("Falta F. Inicio");
          if (!endDate) issues.push("Falta F. Término");
          if (startDate && endDate && startDate > endDate) {
            issues.push("F. Inicio es posterior a F. Término");
          }

          // Check if already exists in master items
          const alreadyExists = existingItems.some(
            (mi) =>
              (!projectName || mi.project === projectName) &&
              mi.tower?.trim().toLowerCase() === tower.toLowerCase() &&
              mi.floor?.trim().toLowerCase() === floor.toLowerCase() &&
              mi.activity?.trim().toLowerCase() === activity.toLowerCase()
          );

          if (alreadyExists) {
            issues.push("Ya existe en el Plan Maestro");
          }

          const isValid = issues.length === 0 || (issues.length === 1 && alreadyExists);

          rowsParsed.push({
            id: idx,
            tower,
            floor: floor || "General",
            activity,
            startDate,
            endDate,
            crewName: crewName || "Cuadrilla General",
            workers: rawWorkers,
            issues,
            alreadyExists,
            isValid: issues.filter((i) => i !== "Ya existe en el Plan Maestro").length === 0,
          });
        });

        if (rowsParsed.length === 0) {
          setError(
            "No se encontraron partidas válidas en el archivo. Asegúrate de usar la plantilla descargada."
          );
          setParsedRows([]);
        } else {
          setParsedRows(rowsParsed);
          // Pre-select all valid and non-duplicate rows
          const initialSelection = new Set();
          rowsParsed.forEach((r, i) => {
            if (r.isValid && !r.alreadyExists) {
              initialSelection.add(i);
            }
          });
          setSelectedIndices(initialSelection);
        }
      } catch (err) {
        console.error("Error al parsear Excel:", err);
        setError("Error al procesar el archivo Excel: " + err.message);
      }
    };

    reader.readAsArrayBuffer(selectedFile);
  };

  const handleToggleRow = (idx) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSelectAllFiltered = (filteredIndices) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      filteredIndices.forEach((i) => next.add(i));
      return next;
    });
  };

  const handleDeselectAllFiltered = (filteredIndices) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      filteredIndices.forEach((i) => next.delete(i));
      return next;
    });
  };

  // Filtered rows for preview
  const displayRows = useMemo(() => {
    if (filterTab === "valid") {
      return parsedRows
        .map((r, i) => ({ ...r, originalIdx: i }))
        .filter((r) => r.isValid && !r.alreadyExists);
    }
    if (filterTab === "issues") {
      return parsedRows
        .map((r, i) => ({ ...r, originalIdx: i }))
        .filter((r) => !r.isValid || r.alreadyExists);
    }
    return parsedRows.map((r, i) => ({ ...r, originalIdx: i }));
  }, [parsedRows, filterTab]);

  const validCount = parsedRows.filter((r) => r.isValid && !r.alreadyExists).length;
  const duplicateCount = parsedRows.filter((r) => r.alreadyExists).length;
  const invalidCount = parsedRows.filter((r) => !r.isValid).length;

  // Confirm Import
  const handleConfirmImport = async () => {
    const selectedRows = parsedRows.filter((_, idx) => selectedIndices.has(idx));
    if (selectedRows.length === 0) return;

    setIsSubmitting(true);
    setError("");

    try {
      const itemsToCreate = selectedRows.map((r) => ({
        project: projectName,
        tower: r.tower,
        floor: r.floor,
        scope_type: "piso",
        departments: "",
        activity: r.activity,
        start_date: r.startDate,
        end_date: r.endDate,
        planned_qty: 100,
        executed_qty: 0,
        unit: "%",
        crew_name: r.crewName,
        crew_size: r.workers.length,
        crew_members: JSON.stringify(r.workers),
        restrictions: "",
        observations: "Importado desde Excel",
        status: "pendiente",
        release_status: "no_liberado",
        zone_type: "torre",
      }));

      await api.post("/master-items/bulk", itemsToCreate);

      if (onSuccess) {
        onSuccess(itemsToCreate.length);
      }
      handleClose();
    } catch (err) {
      console.error("Error al importar partidas:", err);
      setError(err?.message || "Error al guardar las partidas en el servidor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0 rounded-2xl gap-0">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-5 border-b border-slate-800 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600/30 rounded-xl border border-blue-500/30 text-blue-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white leading-tight">
                  Importar Plan Maestro desde Excel
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-0.5">
                  Carga decenas de partidas y asigna a tu personal arrastrando celdas en Excel
                </DialogDescription>
              </div>
            </div>

            {onDownloadTemplate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDownloadTemplate}
                className="hidden sm:flex text-xs bg-slate-800/80 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-700 gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Descargar Plantilla
              </Button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Step 1: Upload Box if no file */}
          {!file ? (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-primary hover:bg-primary/5 transition-all rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="p-4 bg-slate-100 group-hover:bg-primary/10 rounded-2xl text-slate-600 group-hover:text-primary transition-colors">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 mt-4">
                  Selecciona o arrastra tu archivo Excel (.xlsx)
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Usa la plantilla descargada para que el sistema reconozca automáticamente las torres, actividades y personal de la obra.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 text-xs font-semibold gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Explorar Archivo
                </Button>
              </div>

              {onDownloadTemplate && (
                <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">💡</span>
                    <div className="text-xs text-blue-900">
                      <strong>¿Aún no tienes la plantilla?</strong> Descárgala con las torres y trabajadores de esta obra listos para arrastrar.
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={onDownloadTemplate}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" /> Descargar (.xlsx)
                  </Button>
                </div>
              )}
            </div>
          ) : (
            /* Step 2: Preview & Validation Table */
            <div className="space-y-4">
              {/* Summary KPI Pills */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                  <span className="font-bold text-slate-800 truncate max-w-[200px]">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-xs text-primary hover:underline ml-2 cursor-pointer font-medium"
                  >
                    Cambiar archivo
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> {validCount} listas
                  </Badge>
                  {duplicateCount > 0 && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      <AlertTriangle className="w-3 h-3 mr-1" /> {duplicateCount} ya existen
                    </Badge>
                  )}
                  {invalidCount > 0 && (
                    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                      <XCircle className="w-3 h-3 mr-1" /> {invalidCount} incompletas
                    </Badge>
                  )}
                </div>
              </div>

              {/* Filter Tabs & Selection controls */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterTab("all")}
                    className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      filterTab === "all"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Todas ({parsedRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab("valid")}
                    className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      filterTab === "valid"
                        ? "bg-emerald-700 text-white"
                        : "text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    Listas para importar ({validCount})
                  </button>
                  {(duplicateCount > 0 || invalidCount > 0) && (
                    <button
                      type="button"
                      onClick={() => setFilterTab("issues")}
                      className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                        filterTab === "issues"
                          ? "bg-amber-700 text-white"
                          : "text-amber-700 hover:bg-amber-50"
                      }`}
                    >
                      Con avisos ({duplicateCount + invalidCount})
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      handleSelectAllFiltered(displayRows.map((r) => r.originalIdx))
                    }
                    className="text-primary hover:underline font-semibold cursor-pointer"
                  >
                    Marcar visibles
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleDeselectAllFiltered(displayRows.map((r) => r.originalIdx))
                    }
                    className="text-muted-foreground hover:underline font-medium cursor-pointer"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              {/* Rows List */}
              <div className="max-h-[380px] overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                {displayRows.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    No hay partidas para este filtro.
                  </div>
                ) : (
                  displayRows.map((row) => {
                    const isSelected = selectedIndices.has(row.originalIdx);

                    return (
                      <div
                        key={row.originalIdx}
                        onClick={() => handleToggleRow(row.originalIdx)}
                        className={`p-3 rounded-xl border text-xs transition-all flex items-start gap-3 cursor-pointer ${
                          isSelected
                            ? "bg-white border-primary/40 shadow-xs ring-1 ring-primary/20"
                            : "bg-white/60 border-slate-200 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRow(row.originalIdx)}
                          className="mt-0.5 rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        />

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-bold text-slate-900 truncate">
                              {row.activity || "(Sin Actividad)"}
                            </h4>
                            <div className="shrink-0 flex items-center gap-1.5">
                              {row.alreadyExists ? (
                                <Badge variant="outline" className="bg-amber-50 text-amber-800 text-[10px]">
                                  Ya existe
                                </Badge>
                              ) : row.isValid ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-800 text-[10px]">
                                  Listo
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-rose-50 text-rose-800 text-[10px]">
                                  Incompleto
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600">
                            <span className="truncate flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-blue-600 shrink-0" />
                              <strong>{row.tower || "—"}</strong> • {row.floor}
                            </span>
                            <span className="truncate flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-purple-600 shrink-0" />
                              {row.startDate} al {row.endDate}
                            </span>
                            <span className="truncate flex items-center gap-1 sm:col-span-2">
                              <Users className="w-3 h-3 text-amber-600 shrink-0" />
                              <strong className="text-slate-800">{row.crewName}</strong>
                              {row.workers.length > 0 && (
                                <span className="text-slate-500">
                                  ({row.workers.map((w) => w.name).join(", ")})
                                </span>
                              )}
                            </span>
                          </div>

                          {row.issues.length > 0 && (
                            <p className="text-[10px] text-amber-700 font-medium pt-0.5">
                              ⚠️ {row.issues.join(" • ")}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 bg-slate-50 border-t border-slate-200/80 shrink-0 flex flex-row items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-xs"
          >
            Cancelar
          </Button>

          {parsedRows.length > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmImport}
              disabled={isSubmitting || selectedIndices.size === 0}
              className="text-xs bg-primary hover:bg-primary/90 text-white font-bold gap-2 px-5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Confirmar e Importar ({selectedIndices.size} partidas)
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
