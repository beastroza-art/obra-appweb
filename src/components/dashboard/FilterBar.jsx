import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Search,
  Plus,
  Download,
  FileSpreadsheet,
  Pencil,
  ChevronDown,
} from "lucide-react";
import { exportReportExcel } from "@/utils/exportExcel";
import { exportReportPDF } from "@/utils/exportPDF";
import { usePermissions } from "@/lib/PermissionsContext";
import { useProjectFilter } from "@/lib/ProjectFilterContext";
import { getFloorOptions, sortFloors, getFloorList } from "@/utils/floors";
import FilterPill from "@/components/common/FilterPill";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { RAW_DEFAULT_ACTIVITIES } from "@/constants/defaultActivities";

const TOWERS = ["Torre A", "Torre B", "Torre C"];
const TOWER_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

function safeParseJson(value, fallback) {
  try {
    if (!value) return fallback;
    if (typeof value === "string") return JSON.parse(value);
    return value;
  } catch {
    return fallback;
  }
}

function getTowersForProject(proj) {
  if (!proj) return [];
  const count = Number.isInteger(Number(proj.tower_count))
    ? Number(proj.tower_count)
    : 1;
  const list = TOWER_LETTERS.slice(
    0,
    Math.min(Math.max(count, 1), TOWER_LETTERS.length),
  ).map((l) => `Torre ${l}`);
  return [...list, "Exteriores"];
}
const ACTIVITIES = RAW_DEFAULT_ACTIVITIES;

const RELEASE_STATUSES = [
  { value: "liberado", label: "Liberado" },
  { value: "no_liberado", label: "No liberado" },
  { value: "parcial", label: "Parcial" },
  { value: "terminado", label: "Terminado" },
];

export default function FilterBar({
  filters,
  setFilters,
  projects,
  masterItems = [],
  filterOptionItems = masterItems,
  dailyLogs = [],
  sitePhotos = [],
  pdfMasterItems = masterItems,
  pdfDailyLogs = dailyLogs,
  pdfSitePhotos = sitePhotos,
  onNewProject,
  onEditProject,
  onNewItem,
  onRefresh,
  userName = "",
  showPdfExport = true,
}) {
  const { canCreateProjects, isAdmin } = usePermissions();
  const { setSelectedProject } = useProjectFilter();

  // Use the provided `filterOptionItems` (unfiltered source) to build dropdown options
  const sourceItems =
    filterOptionItems && filterOptionItems.length
      ? filterOptionItems
      : masterItems;

  const [showExportModal, setShowExportModal] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfFilters, setPdfFilters] = useState({
    project: "",
    activity: "",
    restriction: "all",
  });

  const availableActivities = React.useMemo(() => {
    const list = filterOptionItems
      .filter(
        (item) => !pdfFilters.project || item.project === pdfFilters.project,
      )
      .map((item) => item.activity);
    return [...new Set(list)].filter(Boolean).sort();
  }, [filterOptionItems, pdfFilters.project]);

  const [showProjectPopover, setShowProjectPopover] = useState(false);
  const [showActivityPopover, setShowActivityPopover] = useState(false);
  const [showRestrictionPopover, setShowRestrictionPopover] = useState(false);
  const [activitySearch, setActivitySearch] = useState("");

  const normalizeText = (text) =>
    String(text || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();

  const filteredActivitiesInModal = React.useMemo(() => {
    const term = normalizeText(activitySearch);
    if (!term) return availableActivities;
    return availableActivities.filter((act) =>
      normalizeText(act).includes(term),
    );
  }, [availableActivities, activitySearch]);

  const normalizeKey = (v) =>
    String(v || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const uniqueList = (arr) => {
    const seen = new Set();
    const out = [];
    for (const v of arr) {
      const key = normalizeKey(v);
      if (!key) continue;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(String(v || "").trim());
      }
    }
    return out;
  };

  const selectedProj = projects.find((p) => p.name === filters.project);

  const towerOptions = uniqueList(
    selectedProj
      ? getTowersForProject(selectedProj)
      : [...TOWERS, ...sourceItems.map((item) => item.tower)],
  );

  const floorOptions = React.useMemo(() => {
    let baseFloors = [];
    if (!selectedProj) {
      baseFloors = getFloorOptions(filterOptionItems);
    } else {
      const configFloors = safeParseJson(selectedProj.floors, []);
      const projectItems = sourceItems.filter(
        (item) => item.project === selectedProj.name,
      );
      const itemFloors = projectItems.flatMap((item) => getFloorList(item.floor));
      baseFloors = [...new Set([...configFloors, ...itemFloors])].sort(sortFloors);
    }
    return [...baseFloors, "Vertical EL", "Vertical TC", "Vertical CD"];
  }, [selectedProj, sourceItems, filterOptionItems]);

  const { data: dbActivities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => api.get("/activities"),
  });

  const dynamicActivities = React.useMemo(() => {
    if (Array.isArray(dbActivities) && dbActivities.length > 0) {
      return dbActivities.map((a) => (typeof a === "string" ? a : a.name));
    }
    return ACTIVITIES;
  }, [dbActivities]);

  const activityOptions = dynamicActivities;

  const updateFilter = (key, value) => {
    const normalizedValue = value === "all" ? "" : value;
    if (key === "project") {
      setSelectedProject(normalizedValue);
    }
    setFilters((prev) => {
      const next = {
        ...prev,
        [key]: normalizedValue,
      };
      if (key === "project") {
        next.tower = "";
        next.floor = "";
        next.activity = "";
      }
      return next;
    });
  };

  const updateSearch = (event) => {
    setFilters((prev) => ({
      ...prev,
      search: event.target.value,
    }));
  };

  const handleExportExcel = async () => {
    try {
      await exportReportExcel(pdfMasterItems, pdfDailyLogs, {
        emailToUser: false, // ← cambiado
      });
      // alert("Excel descargado y enviado al correo del usuario logeado.");
    } catch (error) {
      // alert(`El Excel se descargó, pero no se pudo enviar el correo: ${error.message}`);
    }
  };

  const handleExportPdf = () => {
    setPdfFilters({
      project: filters.project || "",
      activity: filters.activity || "",
      restriction: "all",
    });
    setActivitySearch("");
    setShowExportModal(true);
  };

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    try {
      let itemsToExport = pdfMasterItems || [];

      if (pdfFilters.project) {
        itemsToExport = itemsToExport.filter(
          (item) => item.project === pdfFilters.project,
        );
      }

      if (pdfFilters.activity) {
        itemsToExport = itemsToExport.filter(
          (item) => item.activity === pdfFilters.activity,
        );
      }

      if (pdfFilters.restriction === "bloqueado") {
        itemsToExport = itemsToExport.filter(
          (item) =>
            item.status === "bloqueado" ||
            String(item.restrictions || "").trim() !== "",
        );
      } else if (pdfFilters.restriction === "sin_restricciones") {
        itemsToExport = itemsToExport.filter(
          (item) =>
            item.status !== "bloqueado" &&
            String(item.restrictions || "").trim() === "",
        );
      }

      const exportedItemIds = new Set(itemsToExport.map((item) => String(item.id)));
      const logsToExport = (pdfDailyLogs || []).filter((log) =>
        exportedItemIds.has(String(log.master_item_id)),
      );
      const photosToExport = (pdfSitePhotos || []).filter((p) =>
        exportedItemIds.has(String(p.master_item_id)),
      );

      await exportReportPDF(
        itemsToExport,
        logsToExport,
        photosToExport,
        [],
        projects,
        userName,
        {
          showIncludedProjects: true,
          includeDailyReports: true,
          includePhotos: true,
          emailToUser: false,
        },
      );
      setShowExportModal(false);
    } catch (error) {
      console.error("Error al generar PDF:", error);
      alert("No se pudo generar el PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-3">
      {isGeneratingPdf && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 touch-none">
          <div className="mx-4 rounded-2xl bg-white px-6 py-5 text-center shadow-lg">
            <p className="text-sm font-semibold text-slate-800">
              Generando PDF...
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Esto puede tardar unos segundos. No cierres ni toques la pantalla.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <FilterPill
          label="Obra"
          value={filters.project}
          options={projects.map((project) => project.name)}
          onChange={(value) => updateFilter("project", value)}
        />

        <FilterPill
          label="Torre"
          value={filters.tower}
          options={towerOptions}
          onChange={(value) => updateFilter("tower", value)}
        />

        <FilterPill
          label="Piso"
          value={filters.floor}
          placeholder="Todos"
          options={floorOptions}
          onChange={(value) => updateFilter("floor", value)}
        />

        <FilterPill
          label="Actividad"
          value={filters.activity}
          options={activityOptions}
          onChange={(value) => updateFilter("activity", value)}
        />

        <FilterPill
          label="Liberacion"
          value={filters.release}
          options={RELEASE_STATUSES}
          onChange={(value) => updateFilter("release", value)}
        />
      </div>

      <div className="relative w-full">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar sector, responsable, restriccion..."
          className="h-9 pl-8 text-xs"
          value={filters.search || ""}
          onChange={updateSearch}
        />
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex min-w-max gap-2 pb-1">
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-primary text-xs"
            onClick={onNewProject}
            disabled={!canCreateProjects}
          >
            <Plus className="h-3 w-3" />
            Nueva Obra
          </Button>

          {isAdmin && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={projects.length === 0}
                >
                  <Pencil className="h-3 w-3" />
                  Editar Obra
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(92vw,360px)] p-3">
                <div className="mb-3">
                  <p className="text-xs font-semibold text-foreground">
                    Editar obra
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Elige la obra que quieres modificar
                  </p>
                </div>
                <div className="grid max-h-64 gap-1.5 overflow-y-auto pr-1">
                  {projects.map((project) => (
                    <Button
                      key={project.id}
                      type="button"
                      variant={
                        filters.project === project.name ? "default" : "outline"
                      }
                      size="sm"
                      className="h-8 justify-start rounded-md px-2 text-xs"
                      title={project.name}
                      onClick={() => onEditProject(project)}
                    >
                      <span className="truncate">{project.name}</span>
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          <Button
            size="sm"
            className="h-8 gap-1.5 bg-primary text-xs"
            onClick={onNewItem}
          >
            <Plus className="h-3 w-3" />
            Nuevo Item
          </Button>

          {showPdfExport && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleExportPdf}
            >
              <Download className="h-3 w-3" />
              Exportar PDF
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleExportExcel}
          >
            <FileSpreadsheet className="h-3 w-3" />
            Exportar Excel
          </Button>
        </div>
      </div>

      <Dialog
        open={showExportModal}
        onOpenChange={(value) => {
          if (!isGeneratingPdf) setShowExportModal(value);
        }}
      >
        <DialogContent className="max-w-md p-6 rounded-2xl bg-white">
          <DialogHeader className="border-b pb-4">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-800">
              <Download className="h-5 w-5 text-blue-600" />
              Exportar PDF Personalizado
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Personaliza los filtros del informe antes de generar el documento
              PDF.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Obra / Proyecto */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Obra / Proyecto
              </Label>
              <Popover
                open={showProjectPopover}
                onOpenChange={setShowProjectPopover}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 w-full justify-between gap-3 rounded-lg border-slate-200 bg-white px-3 text-left text-xs shadow-sm font-normal",
                      pdfFilters.project
                        ? "border-primary/30 bg-primary/5 text-primary font-semibold"
                        : "text-slate-700",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                        Obra:
                      </span>
                      <span className="max-w-[240px] truncate font-semibold">
                        {pdfFilters.project || "Todas las obras"}
                      </span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  portalled={false}
                  className="w-[340px] p-3 z-[100] bg-white shadow-lg border rounded-xl"
                  align="start"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground px-2 py-1">
                      Seleccionar Obra
                    </p>
                    <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                      <Button
                        variant={!pdfFilters.project ? "default" : "ghost"}
                        className="w-full justify-start text-left text-xs h-8 rounded-md"
                        onClick={() => {
                          setPdfFilters((prev) => ({
                            ...prev,
                            project: "",
                            activity: "",
                          }));
                          setActivitySearch("");
                          setShowProjectPopover(false);
                        }}
                      >
                        Todas las obras
                      </Button>
                      {projects.map((proj) => (
                        <Button
                          key={proj.id}
                          variant={
                            pdfFilters.project === proj.name
                              ? "default"
                              : "ghost"
                          }
                          className="w-full justify-start text-left text-xs h-8 rounded-md truncate"
                          onClick={() => {
                            setPdfFilters((prev) => ({
                              ...prev,
                              project: proj.name,
                              activity: "",
                            }));
                            setActivitySearch("");
                            setShowProjectPopover(false);
                          }}
                          title={proj.name}
                        >
                          {proj.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Actividad */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Actividad
              </Label>
              <Popover
                open={showActivityPopover}
                onOpenChange={setShowActivityPopover}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 w-full justify-between gap-3 rounded-lg border-slate-200 bg-white px-3 text-left text-xs shadow-sm font-normal",
                      pdfFilters.activity
                        ? "border-primary/30 bg-primary/5 text-primary font-semibold"
                        : "text-slate-700",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                        Actividad:
                      </span>
                      <span className="max-w-[240px] truncate font-semibold">
                        {pdfFilters.activity || "Todas las actividades"}
                      </span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  portalled={false}
                  className="w-[360px] p-3 z-[100] bg-white shadow-lg border rounded-xl"
                  align="start"
                >
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground px-2">
                      Seleccionar Actividad
                    </p>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Buscar actividad..."
                        value={activitySearch}
                        onChange={(e) => setActivitySearch(e.target.value)}
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                      <Button
                        variant={!pdfFilters.activity ? "default" : "ghost"}
                        className="w-full justify-start text-left text-xs h-8 rounded-md"
                        onClick={() => {
                          setPdfFilters((prev) => ({ ...prev, activity: "" }));
                          setShowActivityPopover(false);
                        }}
                      >
                        Todas las actividades
                      </Button>
                      {filteredActivitiesInModal.map((act) => (
                        <Button
                          key={act}
                          variant={
                            pdfFilters.activity === act ? "default" : "ghost"
                          }
                          className="w-full justify-start text-left text-xs h-8 rounded-md truncate"
                          onClick={() => {
                            setPdfFilters((prev) => ({
                              ...prev,
                              activity: act,
                            }));
                            setShowActivityPopover(false);
                          }}
                          title={act}
                        >
                          {act}
                        </Button>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Restricciones (Bloqueado) */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Estado de Restricción / Bloqueo
              </Label>
              <Popover
                open={showRestrictionPopover}
                onOpenChange={setShowRestrictionPopover}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 w-full justify-between gap-3 rounded-lg border-slate-200 bg-white px-3 text-left text-xs shadow-sm font-normal",
                      pdfFilters.restriction !== "all"
                        ? "border-primary/30 bg-primary/5 text-primary font-semibold"
                        : "text-slate-700",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                        Estado:
                      </span>
                      <span className="max-w-[240px] truncate font-semibold">
                        {pdfFilters.restriction === "bloqueado"
                          ? "Solo bloqueados / con restricciones"
                          : pdfFilters.restriction === "sin_restricciones"
                            ? "Solo sin restricciones"
                            : "Cualquier estado"}
                      </span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  portalled={false}
                  className="w-[340px] p-3 z-[100] bg-white shadow-lg border rounded-xl"
                  align="start"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground px-2 py-1">
                      Seleccionar Estado
                    </p>
                    <div className="space-y-1">
                      <Button
                        variant={
                          pdfFilters.restriction === "all" ? "default" : "ghost"
                        }
                        className="w-full justify-start text-left text-xs h-8 rounded-md"
                        onClick={() => {
                          setPdfFilters((prev) => ({
                            ...prev,
                            restriction: "all",
                          }));
                          setShowRestrictionPopover(false);
                        }}
                      >
                        Cualquier estado
                      </Button>
                      <Button
                        variant={
                          pdfFilters.restriction === "bloqueado"
                            ? "default"
                            : "ghost"
                        }
                        className="w-full justify-start text-left text-xs h-8 rounded-md"
                        onClick={() => {
                          setPdfFilters((prev) => ({
                            ...prev,
                            restriction: "bloqueado",
                          }));
                          setShowRestrictionPopover(false);
                        }}
                      >
                        Solo bloqueados / con restricciones
                      </Button>
                      <Button
                        variant={
                          pdfFilters.restriction === "sin_restricciones"
                            ? "default"
                            : "ghost"
                        }
                        className="w-full justify-start text-left text-xs h-8 rounded-md"
                        onClick={() => {
                          setPdfFilters((prev) => ({
                            ...prev,
                            restriction: "sin_restricciones",
                          }));
                          setShowRestrictionPopover(false);
                        }}
                      >
                        Solo sin restricciones
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter className="border-t pt-4 flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExportModal(false)}
              className="text-xs h-8"
              disabled={isGeneratingPdf}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleGeneratePdf}
              className="text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isGeneratingPdf}
            >
              {isGeneratingPdf ? "Generando..." : "Generar PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
