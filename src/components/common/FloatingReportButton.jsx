import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getScopeDisplayLabel } from "@/constants/activityScope";
import { ClipboardPlus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/lib/PermissionsContext";

export default function FloatingReportButton({
  selectedProject = "",
  projects = [],
  onSelectItem,
  onSelectDailyLog,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeProject, setActiveProject] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [signatureFilter, setSignatureFilter] = useState("all");
  const { hasAccessToProject } = usePermissions();

  const filteredProjects = React.useMemo(() => {
    return (projects || []).filter((p) => hasAccessToProject(p.name));
  }, [projects, hasAccessToProject]);

  useEffect(() => {
    if (selectedProject && hasAccessToProject(selectedProject)) {
      setActiveProject(selectedProject);
    } else if (filteredProjects.length > 0) {
      if (!activeProject || !hasAccessToProject(activeProject)) {
        setActiveProject(filteredProjects[0].name);
      }
    }
  }, [selectedProject, hasAccessToProject, filteredProjects, activeProject]);

  const { data: masterItems = [] } = useQuery({
    queryKey: ["masterItems"],
    queryFn: () => api.get("/master-items"),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    enabled: isOpen,
  });

  const { data: dailyLogs = [] } = useQuery({
    queryKey: ["dailyLogs"],
    queryFn: () => api.get("/daily-logs"),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    enabled: isOpen,
  });

  const filteredItems = React.useMemo(() => {
    if (!activeProject) return [];

    let list = masterItems.filter((item) => {
      if (item.project !== activeProject || item.parent_id) return false;
      if (item.status === "completado") return false;

      const planned = Number(item.planned_qty) || 0;
      const executed = Number(item.executed_qty) || 0;
      if (planned > 0 && executed >= planned) return false;

      // Si es un ítem de múltiples pisos, verificar si todos los pisos hijos ya alcanzaron el 100%
      if (item.scope_type === "multiples_pisos") {
        const children = masterItems.filter((c) => c.parent_id === item.id);
        if (children.length > 0) {
          const allChildrenDone = children.every(
            (c) =>
              c.status === "completado" ||
              (Number(c.planned_qty) > 0 && Number(c.executed_qty) >= Number(c.planned_qty))
          );
          if (allChildrenDone) return false;
        }
      }

      return item.status === "pendiente" || item.status === "en_ejecucion";
    });

    if (searchQuery.trim()) {
      const query = searchQuery
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      
      const terms = query.split(/\s+/).filter(Boolean);

      list = list.filter((item) => {
        const activity = String(item.activity || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const tower = String(item.tower || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const floor = String(item.floor || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const depts = String(item.departments || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        return terms.every(
          (term) =>
            activity.includes(term) ||
            tower.includes(term) ||
            floor.includes(term) ||
            depts.includes(term)
        );
      });
    }

    return list;
  }, [masterItems, activeProject, searchQuery]);

  const filteredLogs = React.useMemo(() => {
    if (!activeProject) return [];

    let list = dailyLogs.filter(
      (log) =>
        log.project === activeProject &&
        (!log.capataz_signature || log.capataz_signature.trim() === "")
    );

    if (searchQuery.trim()) {
      const query = searchQuery
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      
      const terms = query.split(/\s+/).filter(Boolean);

      list = list.filter((log) => {
        const activity = String(log.activity || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const tower = String(log.tower || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const floor = String(log.floor || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        return terms.every(
          (term) =>
            activity.includes(term) ||
            tower.includes(term) ||
            floor.includes(term)
        );
      });
    }

    return list;
  }, [dailyLogs, activeProject, searchQuery]);

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center gap-2 px-5 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl font-extrabold text-sm transition-all duration-300 hover:scale-105 hover:-translate-y-1 select-none"
        style={{ boxShadow: "0 10px 25px -5px rgba(37, 99, 235, 0.4)" }}
      >
        <ClipboardPlus className="h-5 w-5" />
        <span>Reporte</span>
      </button>

      {/* Activity Selector Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-6 rounded-2xl overflow-hidden bg-white">
          <DialogHeader className="shrink-0 border-b pb-4">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-800">
              <ClipboardPlus className="h-5 w-5 text-blue-600" />
              Nuevo Reporte Diario
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Selecciona la actividad de la obra para abrir el reporte diario.
            </p>
          </DialogHeader>

          <div className="space-y-3 py-3 shrink-0">
            <div>
              <Label className="text-xs font-bold text-slate-700">Obra/Proyecto</Label>
              <Select
                value={activeProject}
                onValueChange={(v) => {
                  setActiveProject(v);
                  setSearchQuery("");
                }}
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue placeholder="Seleccionar obra..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredProjects.map((p) => (
                    <SelectItem key={p.id} value={p.name} className="text-xs">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700">Filtrar por Firma</Label>
              <Select
                value={signatureFilter}
                onValueChange={(v) => {
                  setSignatureFilter(v);
                  setSearchQuery("");
                }}
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue placeholder="Filtrar por firma..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Todos / Crear Nuevo</SelectItem>
                  <SelectItem value="pending" className="text-xs">Sólo Pendientes de Firma</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700">Buscador de Actividad</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ej: Piso 2 alambrado, torre A, etc."
                  className="pl-9 h-9 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin py-2">
            {signatureFilter === "all" ? (
              filteredItems.length > 0 ? (
                filteredItems.map((item) => {
                  const scopeLabel = getScopeDisplayLabel(item, true); // Hide depts in selection list
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        onSelectItem(item);
                        setIsOpen(false);
                      }}
                      className="p-3 border rounded-xl hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer transition-all duration-200 flex flex-col gap-1 text-left"
                    >
                      <span className="text-xs font-extrabold text-slate-800 leading-tight">
                        {item.activity}
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground mt-0.5">
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-semibold">
                          {item.tower}
                        </span>
                        {scopeLabel && (
                          <span className="px-1.5 py-0.5 bg-blue-50 rounded text-blue-600 font-semibold">
                            {scopeLabel}
                          </span>
                        )}
                        <span className="ml-auto font-medium">
                          Plan: {item.planned_qty} {item.unit}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <Search className="h-8 w-8 text-slate-350" />
                  <p className="text-xs font-semibold">No se encontraron actividades</p>
                  <p className="text-[10px] max-w-[200px] leading-relaxed">
                    {activeProject 
                      ? "Intenta buscar con otros términos o especialidades."
                      : "Por favor, selecciona una obra para ver sus actividades."}
                  </p>
                </div>
              )
            ) : (
              filteredLogs.length > 0 ? (
                filteredLogs.map((log) => {
                  const item =
                    masterItems.find((i) => Number(i.id) === Number(log.master_item_id)) || {
                      id: log.master_item_id,
                      project: log.project,
                      tower: log.tower,
                      floor: log.floor,
                      activity: log.activity,
                      unit: "und",
                      planned_qty: Number(log.executed_today || 0),
                      executed_qty: Number(log.executed_today || 0),
                      crew_name: log.crew_name || "",
                    };
                  return (
                    <div
                      key={log.id}
                      onClick={() => {
                        if (onSelectDailyLog) {
                          onSelectDailyLog(log, item);
                        }
                        setIsOpen(false);
                      }}
                      className="p-3 border border-amber-200 bg-amber-50/10 hover:border-amber-400 hover:bg-amber-50/20 cursor-pointer transition-all duration-200 flex flex-col gap-1 text-left rounded-xl"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs font-extrabold text-slate-800 leading-tight">
                          {log.activity || item?.activity || "Sin actividad"}
                        </span>
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[9px] font-bold whitespace-nowrap">
                          Firma Pendiente
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground mt-0.5">
                        <span className="font-semibold text-slate-700">
                          {log.date}
                        </span>
                        <span>•</span>
                        <span>
                          Torre {log.tower || "—"}
                        </span>
                        <span>•</span>
                        <span>
                          Piso {log.floor || "—"}
                        </span>
                        <span className="ml-auto font-medium text-emerald-700">
                          Ejecutado: {log.executed_today} {item?.unit || "und"}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <Search className="h-8 w-8 text-slate-350" />
                  <p className="text-xs font-semibold">No hay reportes pendientes de firma</p>
                  <p className="text-[10px] max-w-[200px] leading-relaxed">
                    Todos los reportes diarios de esta obra cuentan con firma.
                  </p>
                </div>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}