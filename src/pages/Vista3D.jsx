import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionsContext";
import { useProjectFilter } from "@/lib/ProjectFilterContext";
import Building3DCanvas from "@/components/dashboard/Building3DCanvas";
import SchematicCutawayView from "@/components/dashboard/SchematicCutawayView";
import { buildFloorSummaries, getVerticalItemsForFloor, getTorreItemsForTower, getItemProgressPct, computeFloorGlobalPct } from "@/utils/floorProgress";
import { getFloorNumber } from "@/utils/floors";
import { getScopeTypeLabel } from "@/constants/activityScope";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Building,
  Layers,
  Search,
  Eye,
  AlertTriangle,
  Zap,
  CheckCircle2,
  Clock,
  User,
  Calendar,
  Image as ImageIcon,
  FileText,
  SlidersHorizontal,
  X,
  ArrowUpDown,
  Sliders,
  Building2,
  AlertCircle,
  Box,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Status metadata matching the system design
const STATUS_META = {
  completado: {
    label: "Completado",
    colorClass: "bg-emerald-500 hover:bg-emerald-600 text-white",
    textClass: "text-emerald-600",
    icon: CheckCircle2,
  },
  en_ejecucion: {
    label: "En ejecución",
    colorClass: "bg-sky-500 hover:bg-sky-600 text-white",
    textClass: "text-blue-600",
    icon: Zap,
  },
  pendiente: {
    label: "Pendiente",
    colorClass: "bg-slate-400 hover:bg-slate-500 text-white",
    textClass: "text-slate-500",
    icon: Clock,
  },
  bloqueado: {
    label: "Bloqueado",
    colorClass: "bg-red-500 hover:bg-red-600 text-white",
    textClass: "text-red-600",
    icon: AlertTriangle,
  },
  "piso bloqueado": {
    label: "Piso Bloqueado",
    colorClass: "bg-rose-500 hover:bg-rose-600 text-white",
    textClass: "text-rose-600",
    icon: AlertTriangle,
  },
};

export function getFloorPriority(floorName) {
  const name = String(floorName || "").trim().toLowerCase();
  
  if (name.includes("subterraneo") || name.includes("subterráneo")) {
    const match = name.match(/\d+/);
    const num = match ? Number(match[0]) : 1;
    return -10 - num; // Sub 3 = -13, Sub 2 = -12, Sub 1 = -11
  }
  
  if (name.includes("exterior")) {
    return -5;
  }
  
  if (name.includes("comun") || name.includes("común")) {
    return -2;
  }
  
  if (name.includes("cubierta") || name.includes("techo") || name.includes("azotea")) {
    return 1000;
  }
  
  // Standard Pisos
  const match = name.match(/\d+/);
  if (match) {
    const num = Number(match[0]);
    return num;
  }
  
  return 0; // Default
}

export function isExteriorItem(item) {
  if (!item) return false;
  const normFloor = String(item.floor || "").toLowerCase();
  const normScope = String(item.scope_type || "").toLowerCase();
  const normTower = String(item.tower || "").toLowerCase();
  const normActivity = String(item.activity || "").toLowerCase();
  return (
    normFloor.includes("exterior") ||
    normScope.includes("exterior") ||
    normTower.includes("exterior") ||
    normActivity.includes("exterior")
  );
}

export function getActivityType(activityName) {
  const name = String(activityName || "").trim().toUpperCase();
  if (name.startsWith("EL")) return "EL";
  if (name.startsWith("TC") || name.startsWith("TL")) return "TC";
  if (name.startsWith("CD")) return "CD";

  if (name.includes("ELECTRICA") || name.includes("ELÉCTRICA") || name.includes("FUERZA")) return "EL";
  if (name.includes("TELECOM") || name.includes("FIBRA") || name.includes("DATOS")) return "TC";
  if (name.includes("CORRIENTES") || name.includes("CCTV") || name.includes("CITOFONIA") || name.includes("CCDD")) return "CD";
  return null;
}

export function getActivitySpecialty(item) {
  const scope = String(item?.scope_type || "").toLowerCase();
  if (scope.includes("vertical_el")) return "EL";
  if (scope.includes("vertical_tc")) return "TC";
  if (scope.includes("vertical_cd")) return "CD";
  return getActivityType(item?.activity);
}

export default function Vista3D() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasAccessToProject, userRole, isAdmin } = usePermissions();

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const isFirstRender = React.useRef(true);

  // Helper to read from sessionStorage
  const getSessionValue = (key, fallback) => {
    try {
      const val = sessionStorage.getItem(key);
      if (val === null) return fallback;
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    } catch {
      return fallback;
    }
  };

  // State
  const { selectedProject: globalProject, setSelectedProject: setGlobalProject } = useProjectFilter();
  const [selectedProject, setSelectedProject] = useState(() => {
    return globalProject || getSessionValue("v3d_project", "");
  });

  useEffect(() => {
    if (globalProject && globalProject !== selectedProject) {
      setSelectedProject(globalProject);
    }
  }, [globalProject]);

  const [selectedTower, setSelectedTower] = useState(() => {
    const val = getSessionValue("v3d_tower", "");
    return val === "__all__" ? "" : val;
  });
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  const [isDetailCollapsed, setIsDetailCollapsed] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState(() => getSessionValue("v3d_floor", null));
  const [visualMode, setVisualMode] = useState(() => getSessionValue("v3d_visualMode", "progress"));
  const [renderMode, setRenderMode] = useState(() => getSessionValue("v3d_renderMode", "3d"));
  const [selectedScope, setSelectedScope] = useState(() => getSessionValue("v3d_scope", "__all__"));
  const [searchQuery, setSearchQuery] = useState(() => getSessionValue("v3d_searchQuery", ""));
  const [selectedVerticalSpecialty, setSelectedVerticalSpecialty] = useState(() => getSessionValue("v3d_verticalSpecialty", "EL"));

  // Category Filter States
  const [showEL, setShowEL] = useState(() => getSessionValue("v3d_showEL", true));
  const [showTC, setShowTC] = useState(() => getSessionValue("v3d_showTC", true));
  const [showCD, setShowCD] = useState(() => getSessionValue("v3d_showCD", true));

  // Sync to sessionStorage on state changes
  useEffect(() => { sessionStorage.setItem("v3d_project", JSON.stringify(selectedProject)); }, [selectedProject]);
  useEffect(() => { sessionStorage.setItem("v3d_tower", JSON.stringify(selectedTower)); }, [selectedTower]);
  useEffect(() => { sessionStorage.setItem("v3d_floor", JSON.stringify(selectedFloor)); }, [selectedFloor]);
  useEffect(() => { sessionStorage.setItem("v3d_visualMode", JSON.stringify(visualMode)); }, [visualMode]);
  useEffect(() => { sessionStorage.setItem("v3d_renderMode", JSON.stringify(renderMode)); }, [renderMode]);
  useEffect(() => { sessionStorage.setItem("v3d_scope", JSON.stringify(selectedScope)); }, [selectedScope]);
  useEffect(() => { sessionStorage.setItem("v3d_searchQuery", JSON.stringify(searchQuery)); }, [searchQuery]);
  useEffect(() => { sessionStorage.setItem("v3d_verticalSpecialty", JSON.stringify(selectedVerticalSpecialty)); }, [selectedVerticalSpecialty]);
  useEffect(() => { sessionStorage.setItem("v3d_showEL", JSON.stringify(showEL)); }, [showEL]);
  useEffect(() => { sessionStorage.setItem("v3d_showTC", JSON.stringify(showTC)); }, [showTC]);
  useEffect(() => { sessionStorage.setItem("v3d_showCD", JSON.stringify(showCD)); }, [showCD]);

  // Modal Detail State
  const [detailActivity, setDetailActivity] = useState(null);
  const [activeDetailTab, setActiveDetailTab] = useState("logs");

  // API Queries
  const queryOptions = {
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  };

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects"),
    ...queryOptions,
  });

  const { data: masterItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ["masterItems"],
    queryFn: () => api.get("/master-items"),
    ...queryOptions,
  });

  // Filter projects by user access
  const filteredProjects = useMemo(() => {
    return userRole === "admin"
      ? projects
      : projects.filter((project) => hasAccessToProject(project.name));
  }, [projects, userRole, hasAccessToProject]);

  // Select first project by default
  useEffect(() => {
    if (!selectedProject && filteredProjects.length > 0) {
      setSelectedProject(filteredProjects[0].name);
    }
  }, [filteredProjects, selectedProject]);

  // Reset selected floor if project changes (skipping first render to preserve session values)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setSelectedFloor(null);
  }, [selectedProject]);

  // Automatically switch to schematic view when selectedScope is "verticales", otherwise switch to "3d"
  useEffect(() => {
    if (selectedScope === "verticales") {
      setRenderMode("schematic");
    } else {
      setRenderMode("3d");
    }
  }, [selectedScope]);

  // Automatically select "Exteriores" floor when selectedTower is "Exteriores"
  useEffect(() => {
    if (selectedTower === "Exteriores") {
      setSelectedFloor("Exteriores");
    }
  }, [selectedTower]);

  // Reset selectedTower if scope is "verticales" and tower was "Exteriores"
  useEffect(() => {
    if (selectedScope === "verticales" && selectedTower === "Exteriores") {
      setSelectedTower("");
    }
  }, [selectedScope, selectedTower]);

  // All master items for currently selected project (unfiltered by scope)
  const allProjectItems = useMemo(() => {
    if (!selectedProject) return [];
    const rawItems = masterItems.filter((item) => item.project === selectedProject);
    const parentIdsWithChildren = new Set(
      rawItems.map((item) => item.parent_id).filter(Boolean)
    );
    return rawItems.filter((item) => !parentIdsWithChildren.has(item.id));
  }, [masterItems, selectedProject]);

  // Master Items for currently selected project (filtered by category toggles and scope)
  const itemsForProject = useMemo(() => {
    if (!selectedProject) return [];
    const parentIdsWithChildren = new Set(
      masterItems.map((item) => item.parent_id).filter(Boolean)
    );
    const filteredRawItems = masterItems.filter((item) => !parentIdsWithChildren.has(item.id));

    return filteredRawItems.filter((item) => {
      if (item.project !== selectedProject) return false;
      
      if (selectedTower === "Exteriores") {
        if (!isExteriorItem(item)) return false;
      } else if (selectedTower !== "__all__") {
        if (item.tower !== selectedTower) return false;
      }

      const type = getActivitySpecialty(item);
      if (type === "EL" && !showEL) return false;
      if (type === "TC" && !showTC) return false;
      if (type === "CD" && !showCD) return false;

      if (selectedScope !== "__all__" && selectedTower !== "Exteriores") {
        const normScope = String(item.scope_type || "").toLowerCase();
        const normFloor = String(item.floor || "").toLowerCase();

        if (selectedScope === "verticales") {
          if (!normScope.includes("vertical") && !normFloor.includes("vertical")) return false;
        } else if (selectedScope === "pisos") {
          if (normScope.includes("vertical") || normScope.includes("departamento")) return false;
        } else if (selectedScope === "departamentos") {
          if (!normScope.includes("departamento")) return false;
        } else if (selectedScope === "comunes") {
          if (!normScope.includes("pasillo") && !normScope.includes("comun") && !normScope.includes("sala") && !normScope.includes("bodega")) return false;
        }
      }

      return true;
    });
  }, [masterItems, selectedProject, selectedTower, showEL, showTC, showCD, selectedScope]);

  // Active project object
  const activeProjectObj = useMemo(() => {
    return projects.find((p) => p.name === selectedProject);
  }, [projects, selectedProject]);

  // Available towers for current project (Exteriores excluded to prevent duplicates)
  const towers = useMemo(() => {
    const set = new Set(
      allProjectItems
        .map((item) => item.tower)
        .filter((t) => t && String(t).trim().toLowerCase() !== "exteriores")
    );
    return [...set].sort();
  }, [allProjectItems]);

  // Build floor summaries keeping full building floor stack intact
  const floorSummaries = useMemo(() => {
    if (selectedTower === "Exteriores") {
      return [{
        floor: "Exteriores",
        floorNum: 0,
        pct: computeFloorGlobalPct(itemsForProject),
        pisoItems: itemsForProject,
        itemCount: itemsForProject.length,
      }];
    }

    const configFloors = activeProjectObj?.floors || [];
    const rawSummaries = buildFloorSummaries(allProjectItems, selectedTower, configFloors);
    const projectItemIds = new Set((itemsForProject || []).map((i) => i.id));
    const summaries = (rawSummaries || []).map((f) => {
      const filteredPisoItems = (f.pisoItems || []).filter((item) => projectItemIds.has(item.id));
      const pct = computeFloorGlobalPct(filteredPisoItems);
      return {
        ...f,
        pct,
        pisoItems: filteredPisoItems,
        itemCount: filteredPisoItems.length,
      };
    });

    let finalSummaries = summaries;
    if (selectedScope !== "verticales") {
      finalSummaries = summaries.filter((f) => {
        const name = String(f.floor || "").toLowerCase();
        return !name.includes("cubierta") && !name.includes("techo") && !name.includes("azotea");
      });
    }

    return [...finalSummaries].sort((a, b) => getFloorPriority(b.floor) - getFloorPriority(a.floor));
  }, [allProjectItems, itemsForProject, selectedTower, activeProjectObj, selectedScope]);

  // Search/Filter floors based on floor search query
  const filteredFloorSummaries = useMemo(() => {
    if (!searchQuery) return floorSummaries;
    const query = searchQuery.toLowerCase();
    return floorSummaries.filter(
      (f) =>
        f.floor.toLowerCase().includes(query) ||
        String(f.floorNum).includes(query)
    );
  }, [floorSummaries, searchQuery]);

  // Floors ordered bottom-up for ThreeJS stacking (lowest priority first)
  const floors3D = useMemo(() => {
    return [...floorSummaries].reverse();
  }, [floorSummaries]);

  // Selected floor details object
  const selectedFloorData = useMemo(() => {
    if (!selectedFloor) return null;
    return floorSummaries.find((f) => f.floor === selectedFloor) || null;
  }, [floorSummaries, selectedFloor]);

  // Vertical items passing through the selected floor
  const verticalItems = useMemo(() => {
    if (!selectedFloor) return [];
    return getVerticalItemsForFloor(itemsForProject, selectedFloor, selectedTower);
  }, [itemsForProject, selectedFloor, selectedTower]);

  // Combined items to display in Áreas del Piso panel (Direct floor items + Vertical items passing through floor)
  const displayFloorItems = useMemo(() => {
    if (!selectedFloor) return [];
    const directItems = selectedFloorData?.pisoItems || [];
    const map = new Map();
    [...directItems, ...verticalItems].forEach((item) => {
      map.set(item.id, item);
    });
    return Array.from(map.values());
  }, [selectedFloor, selectedFloorData, verticalItems]);

  // Vertical items for selected vertical specialty column
  const selectedSpecialtyItems = useMemo(() => {
    if (selectedScope !== "verticales") return [];
    return itemsForProject.filter((item) => {
      const type = getActivitySpecialty(item);
      return type === selectedVerticalSpecialty && (String(item.scope_type || "").includes("vertical") || String(item.floor || "").toLowerCase().includes("vertical"));
    });
  }, [itemsForProject, selectedScope, selectedVerticalSpecialty]);

  const specialtyPct = useMemo(() => {
    return computeFloorGlobalPct(selectedSpecialtyItems);
  }, [selectedSpecialtyItems]);

  // Tower scoped items (that don't belong to a specific floor)
  const towerItems = useMemo(() => {
    return getTorreItemsForTower(itemsForProject, selectedTower);
  }, [itemsForProject, selectedTower]);

  // FETCH SPECIFIC DAILY LOGS & PHOTOS FOR MODAL (Only when modal is open)
  const detailItemId = detailActivity?.id;

  const { data: detailLogs = [], isLoading: loadingDetailLogs } = useQuery({
    queryKey: ["dailyLogs", detailItemId],
    queryFn: () => api.get(`/daily-logs?master_item_id=${encodeURIComponent(detailItemId)}`),
    enabled: !!detailItemId,
    ...queryOptions,
  });

  const { data: detailPhotos = [], isLoading: loadingDetailPhotos } = useQuery({
    queryKey: ["photos", detailItemId],
    queryFn: () => api.get(`/site-photos?master_item_id=${encodeURIComponent(detailItemId)}`),
    enabled: !!detailItemId,
    ...queryOptions,
  });

  const [showHud, setShowHud] = useState(true);

  const handleOpenDetailModal = (item) => {
    setDetailActivity(item);
    setActiveDetailTab("logs");
  };

  const handleCloseDetailModal = () => {
    setDetailActivity(null);
  };

  return (
    <div className="-m-4 md:-m-6 h-[calc(100vh-56px)] md:h-[calc(100vh-92px)] flex flex-col lg:block bg-slate-950 overflow-y-auto lg:overflow-hidden p-4 lg:p-0 gap-4 lg:gap-0 relative scrollbar-thin scrollbar-thumb-slate-800">
      {/* RENDER CANVAS OR SCHEMATIC CUTAWAY VIEW OR SELECT TOWER PROMPT (order-2 on tablet/mobile) */}
      <div className="w-full h-auto lg:h-full lg:absolute lg:inset-0 order-2 lg:order-none shrink-0 relative">
      {!selectedTower ? (
        <div className="w-full min-h-[380px] md:min-h-[480px] lg:absolute lg:inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-white z-20 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="text-center space-y-4 max-w-sm p-8 rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-xl shadow-2xl"
          >
            <div className="inline-flex p-3.5 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/25 mb-1">
              <Building className="h-8 w-8 animate-pulse" />
            </div>
            <h2 className="text-lg font-bold tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
              Visualización de Obra
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Por favor, seleccione una torre en el panel de filtros para cargar el modelo 3D y el esquema técnico de la obra.
            </p>
          </motion.div>
        </div>
      ) : renderMode === "3d" ? (
        <Building3DCanvas
          floors={floors3D}
          selectedFloor={selectedFloor}
          onSelectFloor={setSelectedFloor}
          visualMode={visualMode}
        />
      ) : (
        <SchematicCutawayView
          floors={floorSummaries}
          items={itemsForProject}
          selectedFloor={selectedFloor}
          onSelectFloor={setSelectedFloor}
          showEL={showEL}
          showTC={showTC}
          showCD={showCD}
          visualMode={visualMode}
          onOpenDetailModal={handleOpenDetailModal}
          selectedVerticalSpecialty={selectedVerticalSpecialty}
          onSelectVerticalSpecialty={setSelectedVerticalSpecialty}
          showHud={showHud}
        />
      )}
      </div>
      {/* 2. FILTERS CARD (order-1 on mobile/tablet) */}
      <div className="w-full order-1 lg:order-none lg:absolute lg:top-4 lg:left-4 lg:z-30 lg:w-[340px] pointer-events-auto">
        
        {/* Unified Filters & Specialties Card */}
        <Card className="pointer-events-auto bg-slate-900/90 border-slate-800/80 backdrop-blur-md text-white shadow-xl rounded-xl p-3.5 space-y-3 shrink-0">
          <div
            className="flex items-center justify-between border-b border-slate-850 pb-2 cursor-pointer select-none"
            onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
          >
            <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-orange-500" />
              Filtros y Especialidades
            </span>
            <span className="text-[10px] text-slate-500 font-bold hover:text-slate-300">
              {isFiltersCollapsed ? "▼ Mostrar" : "▲ Ocultar"}
            </span>
          </div>

          {!isFiltersCollapsed && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {/* Obra Select */}
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Obra</span>
                  <Select value={selectedProject} onValueChange={(val) => {
                    setSelectedProject(val);
                    setGlobalProject(val);
                  }}>
                    <SelectTrigger className="h-8.5 w-full text-xs font-semibold bg-slate-950 border-slate-850 text-white rounded-lg">
                      <SelectValue placeholder="Obra" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white z-[70]">
                      {filteredProjects.map((proj) => (
                        <SelectItem key={proj.id} value={proj.name} className="hover:bg-slate-800 focus:bg-slate-800 text-xs">
                          {proj.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Torre Select */}
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Torre</span>
                  <Select value={selectedTower || undefined} onValueChange={setSelectedTower}>
                    <SelectTrigger className="h-8.5 w-full text-xs font-semibold bg-slate-950 border-slate-850 text-white rounded-lg">
                      <SelectValue placeholder="Seleccione Torre" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white z-[70]">
                      <SelectItem value="Exteriores" disabled={selectedScope === "verticales"} className="hover:bg-slate-800 focus:bg-slate-800 text-xs">Exteriores</SelectItem>
                      {towers.map((tower) => (
                        <SelectItem key={tower} value={tower} className="hover:bg-slate-800 focus:bg-slate-800 text-xs">
                          {tower}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Alcance Select (Hidden when Torre is Exteriores) */}
              {selectedTower !== "Exteriores" && (
                <div className="space-y-1 pt-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Alcance de Tareas</span>
                  <Select value={selectedScope} onValueChange={setSelectedScope}>
                    <SelectTrigger className="h-8.5 w-full text-xs font-semibold bg-slate-950 border-slate-850 text-white rounded-lg">
                      <SelectValue placeholder="Alcance" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white z-[70]">
                      <SelectItem value="__all__" className="hover:bg-slate-800 focus:bg-slate-800 text-xs">Todos los alcances</SelectItem>
                      <SelectItem value="verticales" className="hover:bg-slate-800 focus:bg-slate-800 text-xs">Verticales</SelectItem>
                      <SelectItem value="pisos" className="hover:bg-slate-800 focus:bg-slate-800 text-xs">Por Piso / Múltiples</SelectItem>
                      <SelectItem value="departamentos" className="hover:bg-slate-800 focus:bg-slate-800 text-xs">Departamentos</SelectItem>
                      <SelectItem value="comunes" className="hover:bg-slate-800 focus:bg-slate-800 text-xs">Espacios Comunes / Pasillos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Visual Mode selector inline inside card */}
              <div className="flex items-center justify-between gap-2 border-t border-slate-850 pt-2.5">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-orange-500" />
                  Modo 3D
                </span>
                <div className="flex bg-slate-950/60 p-0.5 rounded-lg border border-slate-800 shrink-0">
                  <button
                    onClick={() => setVisualMode("progress")}
                    className={cn(
                      "px-2.5 py-1 text-[10px] font-bold rounded-md transition-all",
                      visualMode === "progress" ? "bg-primary text-primary-foreground" : "text-slate-400 hover:text-white"
                    )}
                  >
                    Avance
                  </button>
                  <button
                    onClick={() => setVisualMode("blocked")}
                    className={cn(
                      "px-2.5 py-1 text-[10px] font-bold rounded-md transition-all",
                      visualMode === "blocked" ? "bg-red-500 text-white" : "text-slate-400 hover:text-white"
                    )}
                  >
                    Críticos
                  </button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      <div className={cn(
        "w-full order-3 lg:order-none lg:absolute lg:left-4 lg:z-30 lg:w-[340px] pointer-events-auto transition-all duration-300",
        isFiltersCollapsed
          ? "lg:top-[72px] lg:max-h-[calc(100%-92px)]"
          : "lg:top-[260px] lg:max-h-[calc(100%-280px)]"
      )}>
        {/* Selected Floor detail card */}
        <Card className={cn(
          "bg-slate-900/90 border-slate-800/80 backdrop-blur-md text-white shadow-xl rounded-xl flex flex-col overflow-hidden transition-all duration-300 h-full lg:h-auto",
          isDetailCollapsed
            ? "min-h-[44px] max-h-[44px]"
            : isFiltersCollapsed
              ? "min-h-[160px] max-h-[450px] lg:max-h-[calc(100vh-200px)]"
              : "min-h-[160px] max-h-[450px] lg:max-h-[calc(100vh-390px)]"
        )}>
            <div 
              className="p-3.5 border-b border-slate-800 flex items-center justify-between shrink-0 cursor-pointer select-none"
              onClick={() => setIsDetailCollapsed(!isDetailCollapsed)}
            >
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-orange-500" />
                <span className="text-xs font-bold">
                  {selectedScope === "verticales" ? "Detalle de Verticales" : "Detalle del Piso"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedScope === "verticales" ? (
                  <Badge variant="outline" className={cn(
                    "text-[10px] font-bold border-slate-700 text-white",
                    selectedVerticalSpecialty === "EL" && "bg-emerald-500/20 text-emerald-450 border-emerald-500/40",
                    selectedVerticalSpecialty === "TC" && "bg-blue-500/20 text-blue-400 border-blue-500/40",
                    selectedVerticalSpecialty === "CD" && "bg-orange-500/20 text-orange-400 border-orange-500/40"
                  )}>
                    Columna {selectedVerticalSpecialty}
                  </Badge>
                ) : selectedFloor ? (
                  <Badge variant="outline" className="text-[10px] tabular-nums font-bold border-slate-700 bg-slate-800 text-white">
                    {selectedFloor}
                  </Badge>
                ) : null}
                <span className="text-[10px] text-slate-500 font-bold hover:text-slate-350">
                  {isDetailCollapsed ? "▼" : "▲"}
                </span>
              </div>
            </div>

            {!isDetailCollapsed && (
              <div className="flex-1 overflow-y-auto p-3.5 scrollbar-thin scrollbar-thumb-slate-800 pr-2">
              <AnimatePresence mode="wait">
                {selectedScope === "verticales" ? (
                  <motion.div
                    key="verticals-specialty"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4"
                  >
                    {/* Specialty General Progress */}
                    <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex justify-between items-center text-[11px] font-bold">
                        <span className="text-slate-400">Avance Columna {selectedVerticalSpecialty}</span>
                        <span className="text-emerald-400">{specialtyPct}%</span>
                      </div>
                      <Progress value={specialtyPct} className="h-1.5 bg-slate-800" />
                      <div className="text-[9px] text-slate-500 flex justify-between font-semibold pt-0.5">
                        <span>{selectedSpecialtyItems.length} actividades</span>
                      </div>
                    </div>

                    {/* Specialty Activities List */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-slate-450 flex items-center gap-1.5 uppercase tracking-wider">
                        <Building2 className="h-3 w-3 text-orange-500" />
                        Tareas de la Columna
                      </h4>

                      {selectedSpecialtyItems.length === 0 ? (
                        <p className="text-[10px] text-slate-500 py-3 text-center border border-dashed border-slate-800 rounded-lg bg-slate-950/20">
                          Sin actividades en esta columna vertical.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {selectedSpecialtyItems.map((item, idx) => {
                            const Meta = STATUS_META[item.status] || STATUS_META.pendiente;
                            const progress = getItemProgressPct(item);

                            return (
                              <motion.div
                                key={item.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.03 }}
                                className="border border-slate-800/60 rounded-xl p-2.5 bg-slate-950/30 hover:bg-slate-950/50 hover:border-slate-700 transition-all space-y-2 cursor-pointer"
                                onClick={() => navigate(`/item/${item.id}`, { state: { from: "/vista-3d" } })}
                              >
                                <div className="flex items-start justify-between gap-2.5">
                                  <div className="space-y-0.5 min-w-0 flex-1">
                                    <h5 className="text-[11px] font-bold text-slate-100 hover:text-white transition-colors truncate">
                                      {item.activity}
                                    </h5>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-[7.5px] font-bold text-slate-450 uppercase">
                                        {item.tower || "General"}
                                      </span>
                                      <span className="text-[7.5px] font-medium text-slate-550 truncate">
                                        {item.floor || "Vertical Completa"}
                                      </span>
                                    </div>
                                  </div>
                                  <Badge className={cn("text-[8px] px-1.5 py-0 font-extrabold border-0 shrink-0", Meta.colorClass)}>
                                    {Meta.label}
                                  </Badge>
                                </div>

                                <div className="space-y-1">
                                  <div className="flex justify-between items-center text-[9px] text-slate-400 font-semibold">
                                    <span>Ejec: {item.executed_qty || 0} / {item.planned_qty || 0}</span>
                                    <span>{progress}%</span>
                                  </div>
                                  <Progress value={progress} className="h-1 bg-slate-900" />
                                </div>

                                <div className="flex items-center justify-between border-t border-slate-850 pt-1.5 text-[9px] text-slate-400 font-medium">
                                  <span className="flex items-center gap-1">
                                    <User className="h-2.5 w-2.5 text-slate-500" />
                                    <span className="truncate max-w-[140px]">{item.crew_name || "Sin Cuadrilla"}</span>
                                  </span>
                                </div>

                                {item.restrictions && (
                                  <div className="bg-red-950/30 border border-red-900/40 rounded-lg p-1.5 flex items-start gap-1 text-[9px] text-red-400 font-semibold leading-normal">
                                    <AlertCircle className="h-2.5 w-2.5 text-red-500 shrink-0 mt-0.5" />
                                    <span>R: {item.restrictions}</span>
                                  </div>
                                )}
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : !selectedFloor ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex flex-col items-center justify-center text-center p-2 text-slate-450 gap-2 min-h-[120px] py-6"
                  >
                    <div className="h-8 w-8 rounded-full bg-slate-800/60 border border-slate-700 flex items-center justify-center">
                      <Layers className="h-4 w-4 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-200">Selecciona un nivel</p>
                      <p className="text-[10px] text-slate-450 mt-0.5 max-w-[200px] leading-relaxed">
                        Haz clic en cualquier piso en el 3D para ver su avance y actividades.
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="floor-details"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4"
                  >
                    {/* Floor General Progress */}
                    {selectedFloorData && (
                      <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 space-y-2">
                        <div className="flex justify-between items-center text-[11px] font-bold">
                          <span className="text-slate-400">Avance Global</span>
                          <span className="text-emerald-400">{selectedFloorData.pct}%</span>
                        </div>
                        <Progress value={selectedFloorData.pct} className="h-1.5 bg-slate-800" />
                        <div className="text-[9px] text-slate-500 flex justify-between font-semibold pt-0.5">
                          <span>{selectedFloorData.itemCount} actividades</span>
                          {selectedFloorData.startDate && <span>Inició {selectedFloorData.startDate}</span>}
                        </div>
                      </div>
                    )}

                    {/* Floor Area Activities */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-slate-450 flex items-center gap-1.5 uppercase tracking-wider">
                        <Building2 className="h-3 w-3 text-orange-500" />
                        Áreas del Piso
                      </h4>

                      {displayFloorItems.length === 0 ? (
                        <p className="text-[10px] text-slate-500 py-3 text-center border border-dashed border-slate-800 rounded-lg bg-slate-950/20">
                          Sin actividades en este piso.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {displayFloorItems.map((item, idx) => {
                            const Meta = STATUS_META[item.status] || STATUS_META.pendiente;
                            const progress = getItemProgressPct(item);
                            const type = getActivitySpecialty(item);
                            // Color mapping for activity badge border
                            const typeColorMap = {
                              EL: "border-emerald-500/35 text-emerald-450 bg-emerald-500/10",
                              TC: "border-blue-500/35 text-blue-400 bg-blue-500/10",
                              CD: "border-orange-500/35 text-orange-450 bg-orange-500/10"
                            };
                            const typeBadgeStyle = typeColorMap[type] || "border-slate-700 text-slate-350 bg-slate-800/30";

                            return (
                              <motion.div
                                key={item.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.03 }}
                                className="border border-slate-800/60 rounded-xl p-2.5 bg-slate-950/30 hover:bg-slate-950/50 hover:border-slate-700 transition-all space-y-2 cursor-pointer"
                                onClick={() => navigate(`/item/${item.id}`, { state: { from: "/vista-3d" } })}
                              >
                                <div className="flex items-start justify-between gap-2.5">
                                  <div className="space-y-0.5 min-w-0 flex-1">
                                    <h5 className="text-[11px] font-bold text-slate-100 hover:text-white transition-colors truncate">
                                      {item.activity}
                                    </h5>
                                    <div className="flex items-center gap-1.5">
                                      <span className={cn("text-[7.5px] font-extrabold uppercase px-0.5 border rounded", typeBadgeStyle)}>
                                        {type}
                                      </span>
                                      <span className="text-[8.5px] text-slate-500 font-medium">
                                        {item.tower || "General"}
                                      </span>
                                    </div>
                                  </div>
                                  <Badge className={cn("text-[8px] px-1.5 py-0 font-extrabold border-0 shrink-0", Meta.colorClass)}>
                                    {Meta.label}
                                  </Badge>
                                </div>

                                <div className="space-y-1">
                                  <div className="flex justify-between items-center text-[9px] text-slate-400 font-semibold">
                                    <span>Ejec: {item.executed_qty || 0} / {item.planned_qty || 0}</span>
                                    <span>{progress}%</span>
                                  </div>
                                  <Progress value={progress} className="h-1 bg-slate-900" />
                                </div>

                                <div className="flex items-center justify-between border-t border-slate-850 pt-1.5 text-[9px] text-slate-400 font-medium">
                                  <span className="flex items-center gap-1">
                                    <User className="h-2.5 w-2.5 text-slate-500" />
                                    <span className="truncate max-w-[140px]">{item.crew_name || "Sin Cuadrilla"}</span>
                                  </span>
                                </div>

                                {item.restrictions && (
                                  <div className="bg-red-950/30 border border-red-900/40 rounded-lg p-1.5 flex items-start gap-1 text-[9px] text-red-400 font-semibold leading-normal">
                                    <AlertCircle className="h-2.5 w-2.5 text-red-500 shrink-0 mt-0.5" />
                                    <span>R: {item.restrictions}</span>
                                  </div>
                                )}
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Vertical Items Passing Through */}
                    {verticalItems.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-slate-800">
                        <h4 className="text-[10px] font-bold text-slate-450 flex items-center gap-1.5 uppercase tracking-wider">
                          <ArrowUpDown className="h-3 w-3 text-orange-500" />
                          Verticales
                        </h4>
                        <div className="space-y-2">
                          {verticalItems.map((item, idx) => {
                            const Meta = STATUS_META[item.status] || STATUS_META.pendiente;
                            const type = getActivitySpecialty(item);
                            const typeColorMap = {
                              EL: "border-emerald-500/35 text-emerald-450 bg-emerald-500/10",
                              TC: "border-blue-500/35 text-blue-440 bg-blue-500/10",
                              CD: "border-orange-500/35 text-orange-450 bg-orange-500/10"
                            };
                            const typeBadgeStyle = typeColorMap[type] || "border-slate-700 text-slate-350 bg-slate-800/30";

                            return (
                              <div
                                key={item.id}
                                onClick={() => navigate(`/item/${item.id}`, { state: { from: "/vista-3d" } })}
                                className="border border-slate-800/60 rounded-xl p-2 bg-slate-950/20 flex items-center justify-between gap-2.5 text-[10px] cursor-pointer hover:bg-slate-950/40 transition-all"
                              >
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <p className="font-bold text-slate-200 truncate">{item.activity}</p>
                                  <div className="flex items-center gap-1.5">
                                    <span className={cn("text-[7.5px] font-extrabold uppercase px-0.5 border rounded", typeBadgeStyle)}>
                                      {type}
                                    </span>
                                    <p className="text-[8.5px] text-slate-500 font-medium">
                                      Vertical Completa (Subterráneo &rarr; Cubierta)
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                                  <Badge className={cn("text-[8px] px-1 py-0 font-bold border-0", Meta.colorClass)}>
                                    {Meta.label}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </motion.div>
                )}
              </AnimatePresence>
              </div>
            )}
          </Card>
        </div>

      {/* ACTIVITY DETAIL DIALOG (Daily report history & photos) */}
      <Dialog open={!!detailActivity} onOpenChange={handleCloseDetailModal}>
        <DialogContent className="max-w-2xl w-[95vw] rounded-2xl overflow-hidden p-0 max-h-[85vh] flex flex-col">
          {detailActivity && (
            <>
              {/* Header */}
              <DialogHeader className="p-5 border-b bg-slate-50 flex flex-row justify-between items-start">
                <div className="space-y-1">
                  <DialogTitle className="text-base font-bold text-slate-800 leading-tight">
                    {detailActivity.activity}
                  </DialogTitle>
                  <DialogDescription className="text-xs font-semibold text-slate-500">
                    {detailActivity.project} · {detailActivity.tower || "General"} · {detailActivity.floor || "General"}
                  </DialogDescription>
                </div>
              </DialogHeader>

              {/* Tabs Control */}
              <div className="flex border-b text-xs font-bold text-slate-600 bg-white">
                <button
                  onClick={() => setActiveDetailTab("logs")}
                  className={cn(
                    "flex-1 py-3 text-center border-b-2 border-transparent transition-all flex items-center justify-center gap-1.5",
                    activeDetailTab === "logs" && "border-primary text-primary bg-primary/5"
                  )}
                >
                  <FileText className="h-4 w-4" />
                  Historial de Reportes ({detailLogs.length})
                </button>
                <button
                  onClick={() => setActiveDetailTab("photos")}
                  className={cn(
                    "flex-1 py-3 text-center border-b-2 border-transparent transition-all flex items-center justify-center gap-1.5",
                    activeDetailTab === "photos" && "border-primary text-primary bg-primary/5"
                  )}
                >
                  <ImageIcon className="h-4 w-4" />
                  Galería de Fotos ({detailPhotos.length})
                </button>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto p-5 min-h-[250px]">
                {activeDetailTab === "logs" && (
                  <div className="space-y-4">
                    {loadingDetailLogs ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-3">
                        <div className="w-6 h-6 border-2 border-slate-350 border-t-primary rounded-full animate-spin" />
                        <span className="text-xs text-slate-400 font-medium">Cargando reportes diarios...</span>
                      </div>
                    ) : detailLogs.length === 0 ? (
                      <div className="text-center py-12 text-slate-400 text-xs space-y-2">
                        <FileText className="h-8 w-8 text-slate-300 mx-auto" />
                        <p>No se registran reportes diarios cargados para esta actividad.</p>
                      </div>
                    ) : (
                      <div className="relative border-l border-slate-200 ml-3 pl-5 space-y-6 py-2">
                        {detailLogs.map((log) => (
                          <div key={log.id} className="relative space-y-1.5">
                            {/* Dot icon on timeline */}
                            <span className="absolute -left-[26.5px] top-0.5 flex h-3 w-3 rounded-full bg-primary border-2 border-white ring-2 ring-primary/20" />
                            
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b pb-1">
                              <span className="font-bold text-slate-800 flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                {log.date}
                              </span>
                              <Badge variant="secondary" className="font-bold text-[10px] tabular-nums">
                                +{log.executed_today || 0} {detailActivity.unit || "und"}
                              </Badge>
                            </div>

                            <p className="text-xs text-slate-600 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              {log.description || "Reporte sin comentarios."}
                            </p>

                            <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-400 pt-0.5">
                              {log.crew_size && (
                                <span>Operarios: <span className="font-bold text-slate-600">{log.crew_size}</span></span>
                              )}
                              {log.capataz_name && (
                                <span>Capataz: <span className="font-bold text-slate-600">{log.capataz_name}</span></span>
                              )}
                              {log.capataz_signature && (
                                <span className="text-emerald-600 font-bold border border-emerald-100 bg-emerald-50 px-1.5 py-0.2 rounded">Firmado</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeDetailTab === "photos" && (
                  <div className="space-y-4">
                    {loadingDetailPhotos ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-3">
                        <div className="w-6 h-6 border-2 border-slate-350 border-t-primary rounded-full animate-spin" />
                        <span className="text-xs text-slate-400 font-medium">Cargando galería...</span>
                      </div>
                    ) : detailPhotos.length === 0 ? (
                      <div className="text-center py-12 text-slate-400 text-xs space-y-2">
                        <ImageIcon className="h-8 w-8 text-slate-300 mx-auto" />
                        <p>No hay fotografías registradas de esta actividad.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {detailPhotos.map((photo) => (
                          <div key={photo.id} className="group border rounded-xl overflow-hidden bg-slate-50 flex flex-col hover:shadow-md transition-all">
                            {/* Image Box */}
                            <div className="aspect-square w-full relative overflow-hidden bg-slate-200">
                              <img
                                src={photo.file_url}
                                alt={photo.description || "Foto de obra"}
                                className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                              />
                            </div>
                            {/* Description text */}
                            <div className="p-2.5 space-y-1">
                              <span className="text-[9px] text-slate-400 font-bold">{photo.date}</span>
                              <p className="text-[10px] text-slate-600 font-medium leading-tight line-clamp-2" title={photo.description}>
                                {photo.description || "Sin descripción"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t bg-slate-50 flex justify-end">
                <Button onClick={handleCloseDetailModal} size="sm">
                  Cerrar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
