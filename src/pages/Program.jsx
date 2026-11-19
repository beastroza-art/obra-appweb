import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionsContext";
import { useProjectFilter } from "@/lib/ProjectFilterContext";
import { api } from "@/lib/api";
import { getFloorList } from "@/utils/floors";
import {
  SCOPE_TYPES,
  normalizeScopeTypeValue,
  getScopeDisplayLabel,
} from "@/constants/activityScope";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  UserCheck,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import OperationalStatusBar from "@/components/common/OperationalStatusBar";

// Normalizar rol a formato corto M1, M2, AYUDANTE, TÉCNICO, etc.
function getShortRole(role) {
  if (!role) return "OPERARIO";
  const r = String(role).toUpperCase().trim();
  if (r.includes("PRIMERA") || r === "M1" || r.includes("MAESTRO 1")) return "M1";
  if (r.includes("SEGUNDA") || r === "M2" || r.includes("MAESTRO 2")) return "M2";
  if (r.includes("AYUDANTE") || r === "AY" || r.includes("AYUD.")) return "AYUDANTE";
  if (r.includes("TÉCNICO") || r.includes("TECNICO") || r === "TEC") return "TÉCNICO";
  if (r.includes("INGENIERO") || r.includes("ING")) return "INGENIERO";
  if (r.includes("CAPATAZ")) return "CAPATAZ";
  return role;
}

function getRoleBadgeClass(shortRole) {
  switch (shortRole) {
    case "M1":
      return "bg-blue-100 text-blue-800 border-blue-200 font-bold";
    case "M2":
      return "bg-sky-100 text-sky-800 border-sky-200 font-bold";
    case "AYUDANTE":
      return "bg-slate-100 text-slate-700 border-slate-300 font-semibold";
    case "TÉCNICO":
      return "bg-purple-100 text-purple-800 border-purple-200 font-bold";
    case "INGENIERO":
      return "bg-emerald-100 text-emerald-800 border-emerald-200 font-bold";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

// Detectar categoría macro de la actividad (EL, CD, TC)
function getCategoryInfo(activityName) {
  const clean = String(activityName || "").trim().toUpperCase();
  if (clean.startsWith("CD") || clean.includes("CORRIENTES DÉBILES") || clean.includes("DEBILES") || clean.includes("CCDD")) {
    return { code: "CD", label: "Corrientes Débiles", color: "bg-purple-100 text-purple-900 border-purple-300" };
  }
  if (clean.startsWith("TC") || clean.includes("TELECOM") || clean.includes("FUSIONES")) {
    return { code: "TC", label: "Telecomunicaciones", color: "bg-sky-100 text-sky-900 border-sky-300" };
  }
  return { code: "EL", label: "Eléctrica", color: "bg-amber-100 text-amber-900 border-amber-300" };
}

// Limpiar título de actividad para evitar duplicar el código (ej. "EL INSTALACIÓN..." -> "INSTALACIÓN...")
function formatCleanActivityTitle(activityName) {
  if (!activityName) return "";
  return activityName.replace(/^(EL|CD|TC|CCDD)\s*[-:]?\s*/i, "").trim();
}

// Formatear fecha para tabla e inputs (DD-MM-YYYY)
function formatDateDisplay(dateStr) {
  if (!dateStr) return "—";
  const parts = String(dateStr).split("-");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

const MONTH_NAMES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

// Formatear rango semanal compacto (ej: "14 al 19 Sep 2026")
function formatWeekRange(weekDays) {
  if (!weekDays || weekDays.length < 6) return "";
  const d1 = weekDays[0];
  const d2 = weekDays[5];
  const y1 = d1.dateObj.getFullYear();
  const y2 = d2.dateObj.getFullYear();
  const m1 = MONTH_NAMES[d1.monthNumber - 1];
  const m2 = MONTH_NAMES[d2.monthNumber - 1];

  if (m1 === m2 && y1 === y2) {
    return `${d1.dayNumber} al ${d2.dayNumber} ${m1} ${y1}`;
  }
  if (y1 === y2) {
    return `${d1.dayNumber} ${m1} al ${d2.dayNumber} ${m2} ${y1}`;
  }
  return `${d1.dayNumber} ${m1} ${y1} al ${d2.dayNumber} ${m2} ${y2}`;
}

// Calcular días de la semana (Lunes a Sábado)
function getWeekDays(baseDate) {
  const date = new Date(baseDate);
  const dayOfWeek = date.getDay(); // 0 domingo, 1 lunes...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);

  const days = [];
  const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    days.push({
      dateObj: d,
      iso,
      dayName: dayNames[i],
      dayNumber: d.getDate(),
      monthNumber: d.getMonth() + 1,
      isToday: new Date().toISOString().slice(0, 10) === iso,
    });
  }
  return days;
}

export default function Program() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isAdmin, hasAccessToProject, userRole } = usePermissions();
  const { selectedProject, setSelectedProject } = useProjectFilter();

  // Estados de navegación temporal y alcance del Lookahead
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewScope, setViewScope] = useState("week"); // 'week' (Esta semana) | 'active' (En ejecución) | 'all' (Todas)
  const [operationalStatus, setOperationalStatus] = useState("all");
  const [macroFilter, setMacroFilter] = useState("all"); // 'all' | 'EL' | 'CD' | 'TC'
  const [searchTerm, setSearchTerm] = useState("");
  const [towerFilter, setTowerFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");

  // Modal para ver personal sin actividad en la semana
  const [unassignedModalOpen, setUnassignedModalOpen] = useState(false);

  // Queries de datos
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects"),
  });

  const { data: masterItems = [], isLoading: isLoadingItems } = useQuery({
    queryKey: ["masterItems"],
    queryFn: () => api.get("/master-items"),
  });

  const { data: projectWorkers = [], isLoading: isLoadingWorkers } = useQuery({
    queryKey: ["projectWorkers"],
    queryFn: () => api.get("/project-workers"),
  });

  const { data: dailyLogs = [] } = useQuery({
    queryKey: ["dailyLogs"],
    queryFn: () => api.get("/daily-logs"),
  });

  // Obras a las que el usuario tiene acceso (Capataces y Supervisores ven estrictamente sus obras asignadas)
  const accessibleProjects = useMemo(() => {
    if (isAdmin) return projects;
    return projects.filter((p) => hasAccessToProject(p.name, p));
  }, [projects, isAdmin, hasAccessToProject]);

  // Actividades del plan maestro filtradas según las obras a las que el usuario tiene acceso
  const accessibleMasterItems = useMemo(() => {
    if (isAdmin) return masterItems;
    return masterItems.filter((i) => hasAccessToProject(i.project));
  }, [masterItems, isAdmin, hasAccessToProject]);

  // Identificar IDs de actividades que actúan como padre agrupador (ej. múltiples pisos que ya tienen hijos desglosados)
  const parentIdsWithChildren = useMemo(() => {
    return new Set(
      accessibleMasterItems
        .map((item) => item.parent_id)
        .filter((pid) => pid !== null && pid !== undefined && pid !== "")
        .map((pid) => String(pid))
    );
  }, [accessibleMasterItems]);

  // Conteo oficial de actividades del Plan Maestro por obra (idéntico al número oficial que muestra Plan Maestro)
  const projectItemCounts = useMemo(() => {
    const counts = {};
    accessibleMasterItems.forEach((item) => {
      if (item.project && !item.parent_id) {
        counts[item.project] = (counts[item.project] || 0) + 1;
      }
    });
    return counts;
  }, [accessibleMasterItems]);

  // Obra seleccionada: si no hay seleccionada o está vacía, priorizar la primera obra permitida con datos
  const activeProject = useMemo(() => {
    if (accessibleProjects.length === 0) return null;
    if (!selectedProject || selectedProject === "__ALL__") {
      const withItems = accessibleProjects.find((p) => (projectItemCounts[p.name] || 0) > 0);
      return withItems || accessibleProjects[0] || null;
    }
    const match = accessibleProjects.find((p) => p.name === selectedProject);
    return match || accessibleProjects[0] || null;
  }, [accessibleProjects, selectedProject, projectItemCounts]);

  // Actividades / partidas operativas de la obra activa (excluyendo al padre agrupador cuando ya están los hijos)
  const rawFronts = useMemo(() => {
    if (!activeProject?.name) return [];
    return accessibleMasterItems.filter(
      (i) => i.project === activeProject.name && !parentIdsWithChildren.has(String(i.id))
    );
  }, [accessibleMasterItems, activeProject, parentIdsWithChildren]);

  // Detectar la fecha más representativa con actividades para la obra activa
  const latestProjectActivityDate = useMemo(() => {
    if (!rawFronts || rawFronts.length === 0) return null;
    let latest = null;
    rawFronts.forEach((f) => {
      if (f.end_date && (!latest || f.end_date > latest)) {
        latest = f.end_date;
      }
    });
    return latest;
  }, [rawFronts]);

  // Auto-posicionar la vista en la semana más representativa si hoy no tiene actividades programadas
  useEffect(() => {
    if (!rawFronts || rawFronts.length === 0) return;

    const today = new Date();
    const todayWeek = getWeekDays(today);
    const todayStart = todayWeek[0]?.iso;
    const todayEnd = todayWeek[5]?.iso;

    const hasItemsInTodayWeek = rawFronts.some(
      (f) => f.start_date && f.end_date && f.start_date <= todayEnd && f.end_date >= todayStart
    );

    // Si la semana de hoy no tiene actividades para esta obra, pero la obra tiene fechas registradas, navegar a la semana activa
    if (!hasItemsInTodayWeek && latestProjectActivityDate) {
      const parts = latestProjectActivityDate.split("-");
      if (parts.length === 3) {
        const targetDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        setCurrentDate(targetDate);
      }
    }
  }, [activeProject?.name, rawFronts, latestProjectActivityDate]);

  // Lista de días para el mini-Gantt semanal
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  // Trabajadores reales registrados en la obra activa
  const workersForActiveProject = useMemo(() => {
    if (!activeProject?.name) return [];
    return projectWorkers.filter(
      (w) => w.project === activeProject.name && w.active !== 0
    );
  }, [projectWorkers, activeProject]);

  // Estadísticas del personal real de la obra (sin duplicaciones)
  const projectWorkersStats = useMemo(() => {
    const total = workersForActiveProject.length;
    let m1 = 0;
    let m2 = 0;
    let ay = 0;
    let tec = 0;

    workersForActiveProject.forEach((w) => {
      const short = getShortRole(w.role);
      if (short === "M1") m1++;
      else if (short === "M2") m2++;
      else if (short === "AYUDANTE") ay++;
      else if (short === "TÉCNICO") tec++;
    });

    const breakdownParts = [];
    const rolesList = [];
    if (m1 > 0) {
      breakdownParts.push(`${m1} M1`);
      rolesList.push({ label: "M1", count: m1, badgeClass: "bg-blue-100 text-blue-800 border-blue-200" });
    }
    if (m2 > 0) {
      breakdownParts.push(`${m2} M2`);
      rolesList.push({ label: "M2", count: m2, badgeClass: "bg-sky-100 text-sky-800 border-sky-200" });
    }
    if (ay > 0) {
      breakdownParts.push(`${ay} Ay.`);
      rolesList.push({ label: "Ay.", count: ay, badgeClass: "bg-slate-100 text-slate-700 border-slate-300" });
    }
    if (tec > 0) {
      breakdownParts.push(`${tec} Téc.`);
      rolesList.push({ label: "Téc.", count: tec, badgeClass: "bg-purple-100 text-purple-800 border-purple-200" });
    }

    return {
      total,
      breakdown: breakdownParts.join(" · "),
      rolesList,
    };
  }, [workersForActiveProject]);

  // Opciones dinámicas de Torre y Piso
  const towerOptions = useMemo(() => {
    const set = new Set();
    rawFronts.forEach((f) => f.tower && set.add(f.tower));
    return Array.from(set).sort();
  }, [rawFronts]);

  const floorOptions = useMemo(() => {
    const set = new Set();
    rawFronts.forEach((f) => {
      if (f.floor) {
        getFloorList(f.floor).forEach((fl) => set.add(fl));
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [rawFronts]);

  // Set de IDs de master_items que tienen reportes diarios sin firma
  const unsignedLogsByItemId = useMemo(() => {
    const set = new Set();
    if (!Array.isArray(dailyLogs)) return set;
    dailyLogs.forEach((log) => {
      const hasSig = log.capataz_signature && String(log.capataz_signature).trim() !== "";
      if (!hasSig && log.master_item_id) {
        set.add(Number(log.master_item_id));
      }
    });
    return set;
  }, [dailyLogs]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Parsear y enriquecer las actividades con sus trabajadores asignados y alcance de Plan Maestro
  const enrichedFronts = useMemo(() => {
    return rawFronts.map((item) => {
      const planned = Number(item.planned_qty || 0);
      const executed = Number(item.executed_qty || 0);
      const pct = planned > 0 ? Math.min(Math.round((executed / planned) * 100), 100) : 0;
      const scopeDisplay = getScopeDisplayLabel(item, true);

      // Obtener trabajadores asignados (crew_members)
      let crew = [];
      if (item.crew_members) {
        try {
          crew = typeof item.crew_members === "string" ? JSON.parse(item.crew_members) : item.crew_members;
          if (!Array.isArray(crew)) crew = [];
        } catch {
          crew = [];
        }
      }

      // Si no tiene trabajadores explícitos en crew_members, buscar en project_workers asignados a esta actividad
      if (crew.length === 0) {
        const matchingWorkers = workersForActiveProject.filter((w) => {
          if (!w.current_activity) return false;
          const actClean = w.current_activity.toLowerCase();
          return (
            actClean.includes((item.activity || "").toLowerCase()) ||
            (item.tower && actClean.includes(item.tower.toLowerCase()) && item.floor && actClean.includes(item.floor.toLowerCase()))
          );
        });

        crew = matchingWorkers.map((w) => ({
          name: w.name,
          role: w.role,
          task: scopeDisplay || item.floor || item.activity,
        }));
      }

      const isOverdue = pct < 100 && item.end_date && item.end_date < todayStr;
      const isCompleted = pct >= 100 || item.status === "completado";

      return {
        ...item,
        pct,
        crew,
        scopeDisplay,
        isOverdue,
        isCompleted,
        frontTitle: `${item.activity} ${scopeDisplay || item.floor || ""} ${item.tower || ""}`.trim(),
      };
    });
  }, [rawFronts, workersForActiveProject, todayStr]);

  const weekStart = weekDays[0]?.iso;
  const weekEnd = weekDays[5]?.iso;

  // Conteo de actividades estrictamente programadas para la semana actual
  const weekTasksCount = useMemo(() => {
    return enrichedFronts.filter((f) => {
      return Boolean(f.start_date && f.end_date && f.start_date <= weekEnd && f.end_date >= weekStart);
    }).length;
  }, [enrichedFronts, weekStart, weekEnd]);

  const activeTasksCount = useMemo(() => {
    return enrichedFronts.filter((f) => !f.isCompleted && f.pct < 100).length;
  }, [enrichedFronts]);

  // Personal sin actividad durante la semana seleccionada
  const unassignedWorkersInWeek = useMemo(() => {
    const assignedNames = new Set();
    enrichedFronts.forEach((front) => {
      const isSchedInWeek = Boolean(
        front.start_date && front.end_date &&
        front.start_date <= weekEnd && front.end_date >= weekStart
      );
      if (isSchedInWeek && Array.isArray(front.crew)) {
        front.crew.forEach((m) => {
          if (m?.name) assignedNames.add(m.name.trim().toLowerCase());
        });
      }
    });

    return workersForActiveProject.filter((w) => {
      if (!w.name) return false;
      return !assignedNames.has(w.name.trim().toLowerCase());
    });
  }, [enrichedFronts, workersForActiveProject, weekStart, weekEnd]);

  // Estadísticas del personal sin actividad en la semana
  const unassignedWorkersStats = useMemo(() => {
    const total = unassignedWorkersInWeek.length;
    let m1 = 0;
    let m2 = 0;
    let ay = 0;
    let tec = 0;

    unassignedWorkersInWeek.forEach((w) => {
      const short = getShortRole(w.role);
      if (short === "M1") m1++;
      else if (short === "M2") m2++;
      else if (short === "AYUDANTE") ay++;
      else if (short === "TÉCNICO") tec++;
    });

    const breakdownParts = [];
    const rolesList = [];
    if (m1 > 0) {
      breakdownParts.push(`${m1} M1`);
      rolesList.push({ label: "M1", count: m1, badgeClass: "bg-blue-100 text-blue-800 border-blue-200" });
    }
    if (m2 > 0) {
      breakdownParts.push(`${m2} M2`);
      rolesList.push({ label: "M2", count: m2, badgeClass: "bg-sky-100 text-sky-800 border-sky-200" });
    }
    if (ay > 0) {
      breakdownParts.push(`${ay} Ay.`);
      rolesList.push({ label: "Ay.", count: ay, badgeClass: "bg-slate-100 text-slate-700 border-slate-300" });
    }
    if (tec > 0) {
      breakdownParts.push(`${tec} Téc.`);
      rolesList.push({ label: "Téc.", count: tec, badgeClass: "bg-purple-100 text-purple-800 border-purple-200" });
    }

    return {
      total,
      breakdown: breakdownParts.join(" · "),
      rolesList,
    };
  }, [unassignedWorkersInWeek]);

  // Filtrar actividades según alcance (semana vs activas vs todas), situación operativa, macro especialidad, torre, piso y búsqueda
  const filteredFronts = useMemo(() => {
    return enrichedFronts.filter((front) => {
      // 1. Filtro de Alcance de la Semana: Solo mostrar actividades que operan dentro de esta semana
      if (viewScope === "week") {
        const isSchedInWeek = Boolean(
          front.start_date && front.end_date &&
          front.start_date <= weekEnd && front.end_date >= weekStart
        );
        if (!isSchedInWeek) return false;
      } else if (viewScope === "active") {
        if (front.isCompleted || front.pct >= 100) return false;
      }

      // 2. Filtro de Situación Operativa (Chips: Todos, En Ejecución, Atrasados, Bloqueados, Por Firmar, Terminados, etc.)
      if (operationalStatus && operationalStatus !== "all") {
        const isCompleted = front.isCompleted || front.pct >= 100;
        const hasActiveRestriction = Boolean(
          front.restrictions &&
          String(front.restrictions).trim() &&
          !["—", "-", "sin restriccion", "sin restricción", "ninguna", "no"].includes(
            String(front.restrictions).trim().toLowerCase()
          )
        );
        const isBlocked =
          !isCompleted && (
            front.status === "bloqueado" ||
            front.status === "piso bloqueado" ||
            (hasActiveRestriction && front.status !== "en_ejecucion")
          );
        const isOverdue = !isCompleted && front.end_date && front.end_date < todayStr;
        const hasUnsigned = unsignedLogsByItemId.has(Number(front.id));

        switch (operationalStatus) {
          case "completed":
            if (!isCompleted) return false;
            break;
          case "overdue":
            if (!isOverdue) return false;
            break;
          case "blocked":
            if (!isBlocked) return false;
            break;
          case "pending_signature":
            if (!hasUnsigned) return false;
            break;
          case "in_progress":
            if (
              isCompleted ||
              isOverdue ||
              isBlocked ||
              !(
                front.pct > 0 ||
                (front.start_date && front.start_date <= todayStr) ||
                front.status === "en_ejecucion" ||
                front.release_status === "liberado"
              )
            ) {
              return false;
            }
            break;
          case "pending":
            if (
              isCompleted ||
              isOverdue ||
              isBlocked ||
              front.pct > 0 ||
              (front.start_date && front.start_date <= todayStr) ||
              front.status === "en_ejecucion" ||
              front.release_status === "liberado"
            ) {
              return false;
            }
            break;
          default:
            break;
        }
      }

      // 3. Filtro Macro-Especialidad
      if (macroFilter === "EL" && !front.activity?.toUpperCase().startsWith("EL")) return false;
      if (macroFilter === "CD" && !(front.activity?.toUpperCase().startsWith("CD") || front.activity?.toUpperCase().includes("DÉBILES") || front.activity?.toUpperCase().includes("DEBILES") || front.activity?.toUpperCase().includes("CCDD"))) return false;
      if (macroFilter === "TC" && !(front.activity?.toUpperCase().startsWith("TC") || front.activity?.toUpperCase().includes("TELECOM"))) return false;

      // 4. Filtro Torre y Piso
      if (towerFilter && front.tower !== towerFilter) return false;
      if (floorFilter && !getFloorList(front.floor).includes(floorFilter) && front.floor !== floorFilter) return false;

      // 5. Búsqueda de texto libre (busca en actividad, operarios o ubicación)
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase();
        const matchesTitle = front.frontTitle.toLowerCase().includes(s);
        const matchesActivity = (front.activity || "").toLowerCase().includes(s);
        const matchesCrew = front.crew.some(
          (m) => (m.name || "").toLowerCase().includes(s) || (m.role || "").toLowerCase().includes(s)
        );
        if (!matchesTitle && !matchesActivity && !matchesCrew) return false;
      }

      return true;
    });
  }, [enrichedFronts, viewScope, weekStart, weekEnd, operationalStatus, todayStr, unsignedLogsByItemId, macroFilter, towerFilter, floorFilter, searchTerm]);

  // Métricas generales
  const stats = useMemo(() => {
    const totalActivities = filteredFronts.length;
    let overdueCount = 0;
    let avgProgress = 0;

    filteredFronts.forEach((f) => {
      if (f.isOverdue) overdueCount++;
      avgProgress += f.pct;
    });

    return {
      totalActivities,
      overdueCount,
      avgProgress: totalActivities > 0 ? Math.round(avgProgress / totalActivities) : 0,
    };
  }, [filteredFronts]);

  // Navegar semana Gantt
  const handlePrevWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };

  const handleNextWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const handleCurrentWeek = () => {
    setCurrentDate(new Date());
  };

  if (isLoadingProjects || isLoadingItems) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-12 w-3/4 rounded-lg" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  // Si el usuario (capataz o supervisor) no tiene obras asignadas
  if (!isAdmin && accessibleProjects.length === 0) {
    return (
      <div className="space-y-4 p-6 max-w-xl mx-auto my-12">
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center space-y-3">
          <div className="w-12 h-12 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-800">Sin Obras Asignadas</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Tu usuario no tiene obras asignadas en este momento. Por favor contacta al administrador del sistema para que configure tu acceso a tus obras.
          </p>
        </div>
      </div>
    );
  }

  let rowCounter = 1;

  return (
    <div className="space-y-4 pb-32">
      {/* 1. CABECERA (MEMBRETE OFICIAL) */}
      <div className="bg-white rounded-2xl border shadow-sm p-4 md:p-5 space-y-3.5">
        <div className="flex items-center justify-between border-b pb-3">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
            Programación Semanal de Actividades
          </h1>
        </div>

        {/* Datos Principales de la Obra (Membrete del Excel) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-0.5">
          {/* Obra */}
          <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Obra Activa
              </span>
              {Boolean(activeProject?.name && projectItemCounts[activeProject.name]) && (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-full">
                  {projectItemCounts[activeProject.name]} actividades
                </span>
              )}
            </div>
            <Select
              value={selectedProject || activeProject?.name || ""}
              onValueChange={(val) => {
                setSelectedProject(val);
                setTowerFilter("");
                setFloorFilter("");
              }}
            >
              <SelectTrigger className="h-7 w-full text-xs font-bold text-slate-900 bg-white border-slate-300 shadow-2xs">
                <span>{activeProject?.name || "Seleccionar obra..."}</span>
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {accessibleProjects.map((p) => {
                  const count = projectItemCounts[p.name] || 0;
                  return (
                    <SelectItem key={p.id} value={p.name} className="text-xs font-medium">
                      {p.name} {count > 0 ? `(${count} actividades)` : "(0 actividades)"}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Mandante */}
          <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Mandante / Inmobiliaria
            </span>
            <span className="text-xs font-bold text-slate-800 truncate block">
              {activeProject?.client || "Inmobiliaria Mandante"}
            </span>
          </div>

          {/* Supervisor */}
          <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Supervisor de Obra
            </span>
            <span className="text-xs font-bold text-blue-900 truncate block">
              {activeProject?.supervisor || "Por designar"}
            </span>
          </div>

          {/* Capataz */}
          <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Capataz General
            </span>
            <span className="text-xs font-bold text-emerald-900 truncate block">
              {activeProject?.capataz || "Por designar"}
            </span>
          </div>
        </div>

        {/* Tarjetas resumen de personal y actividades */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-3 border-t">
          {/* Tarjeta 1: Personal Total de la Obra */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                    Personal de la Obra
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-black text-slate-900 leading-none">
                      {projectWorkersStats.total}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">trabajadores</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap pt-2 mt-2 border-t border-slate-200/70">
              {projectWorkersStats.rolesList.map((r) => (
                <span
                  key={r.label}
                  className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border shadow-3xs", r.badgeClass)}
                >
                  {r.count} {r.label}
                </span>
              ))}
            </div>
          </div>

          {/* Tarjeta 2: Personal Sin Actividad esta Semana */}
          <button
            type="button"
            onClick={() => setUnassignedModalOpen(true)}
            className={cn(
              "p-3 rounded-xl border flex flex-col justify-between transition-all text-left shadow-2xs group cursor-pointer",
              unassignedWorkersStats.total > 0
                ? "bg-amber-50/70 border-amber-200/90 hover:bg-amber-100/70 hover:border-amber-300"
                : "bg-emerald-50/50 border-emerald-200/90 hover:bg-emerald-100/50"
            )}
            title="Haz clic para ver la lista de operarios disponibles"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                    unassignedWorkersStats.total > 0
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                  )}
                >
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block truncate">
                    Sin Actividad Semanal
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "text-base font-black leading-none",
                        unassignedWorkersStats.total > 0 ? "text-amber-900" : "text-emerald-800"
                      )}
                    >
                      {unassignedWorkersStats.total}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">disponibles</span>
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full group-hover:bg-amber-200/80 transition-colors shrink-0">
                Ver lista →
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap pt-2 mt-2 border-t border-amber-200/60 w-full">
              {unassignedWorkersStats.rolesList.length > 0 ? (
                unassignedWorkersStats.rolesList.map((r) => (
                  <span
                    key={r.label}
                    className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border shadow-3xs", r.badgeClass)}
                  >
                    {r.count} {r.label}
                  </span>
                ))
              ) : (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  100% del personal asignado
                </span>
              )}
            </div>
          </button>

          {/* Tarjeta 3: Actividades en Pantalla */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                    Actividades
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-black text-slate-900 leading-none">
                      {stats.totalActivities}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">en pantalla</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-200/70 text-xs">
              <span className="text-[10px] font-semibold text-slate-500">Avance promedio:</span>
              <span className="text-xs font-black text-blue-900 font-mono">{stats.avgProgress}%</span>
            </div>
          </div>

          {/* Tarjeta 4: Cumplimiento de Plazo */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    stats.overdueCount > 0 ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
                  )}
                >
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                    Cumplimiento de Plazo
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "text-base font-black leading-none",
                        stats.overdueCount > 0 ? "text-red-700" : "text-emerald-700"
                      )}
                    >
                      {stats.overdueCount}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {stats.overdueCount === 1 ? "atrasada" : "atrasadas"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-200/70 text-xs">
              <span className="text-[10px] font-semibold text-slate-500">Estado semanal:</span>
              {stats.overdueCount === 0 ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Al día
                </span>
              ) : (
                <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                  Requiere atención
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. PESTAÑAS Y CONTROLES DE FILTRADO */}
      <div className="space-y-2">
        {/* Fila 1: Alcance de Vista + Navegador Semanal */}
        <div className="flex items-center justify-between flex-wrap gap-2 bg-slate-100/90 p-1.5 rounded-xl border border-slate-200 shadow-2xs">
          {/* Selector de Alcance Principal */}
          <div className="flex items-center gap-1 p-0.5 bg-white rounded-lg shadow-2xs border border-slate-200">
            <button
              type="button"
              onClick={() => setViewScope("week")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-bold transition-all",
                viewScope === "week"
                  ? "bg-blue-900 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              Esta Semana ({weekTasksCount})
            </button>
            <button
              type="button"
              onClick={() => setViewScope("active")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-bold transition-all",
                viewScope === "active"
                  ? "bg-amber-500 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              En Ejecución ({activeTasksCount})
            </button>
          </div>

          {/* Navegador del Calendario Semanal */}
          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5 shadow-2xs">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-600 hover:text-slate-900" onClick={handlePrevWeek} title="Semana anterior">
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-[11px] font-bold text-slate-800 px-1.5 min-w-[140px] text-center">
              Semana {formatWeekRange(weekDays)}
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-600 hover:text-slate-900" onClick={handleNextWeek} title="Semana siguiente">
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={weekDays.some((d) => d.isToday) ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-6 text-[10px] px-2 font-bold ml-0.5",
                weekDays.some((d) => d.isToday) ? "bg-blue-900 text-white" : "border-slate-300 text-slate-700"
              )}
              onClick={handleCurrentWeek}
            >
              Hoy
            </Button>
          </div>
        </div>

        {/* Fila 2: Barra de Chips de Situación Operativa (En Ejecución, Por Firmar, Terminados, etc.) */}
        <OperationalStatusBar
          items={rawFronts}
          dailyLogs={dailyLogs}
          selectedStatus={operationalStatus}
          onSelectStatus={setOperationalStatus}
        />

        {/* Fila 3: Filtros Compactos (Buscador + Torre + Piso) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Buscador inteligente */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar actividad, trabajador o ubicación..."
              className="h-7 pl-8 text-xs bg-white"
            />
          </div>

          {/* Filtro Torre */}
          {towerOptions.length > 0 && (
            <div className="w-28 shrink-0">
              <Select value={towerFilter} onValueChange={(v) => setTowerFilter(v === "ALL" ? "" : v)}>
                <SelectTrigger className="h-7 text-xs bg-white">
                  <SelectValue placeholder="Sector: Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">Todos los sectores</SelectItem>
                  {towerOptions.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Filtro Piso */}
          {floorOptions.length > 0 && (
            <div className="w-28 shrink-0">
              <Select value={floorFilter} onValueChange={(v) => setFloorFilter(v === "ALL" ? "" : v)}>
                <SelectTrigger className="h-7 text-xs bg-white">
                  <SelectValue placeholder="Piso: Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">Todos los pisos</SelectItem>
                  {floorOptions.map((f) => (
                    <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(towerFilter || floorFilter || searchTerm || macroFilter !== "all" || operationalStatus !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTowerFilter("");
                setFloorFilter("");
                setSearchTerm("");
                setMacroFilter("all");
                setOperationalStatus("all");
              }}
              className="h-7 text-xs text-slate-500 hover:text-slate-900 shrink-0"
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      {/* 3. TABLA PRINCIPAL DE PROGRAMACIÓN (7 COLUMNAS ESTILO EXCEL) */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden touch-pan-y">
        <div
          className="overflow-x-auto touch-pan-y overscroll-x-contain"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
          <table
            className="w-full border-collapse text-left text-xs"
            style={{ touchAction: "pan-y" }}
          >
            <thead>
              <tr className="bg-slate-100 text-slate-800 border-b border-slate-200 divide-x divide-slate-200 text-xs font-bold">
                <th className="py-2.5 px-2 w-10 text-center">N°</th>
                <th className="py-2.5 px-3 min-w-[200px]">Trabajadores</th>
                <th className="py-2.5 px-2 w-28 text-center">Cargo</th>
                <th className="py-2.5 px-3 min-w-[170px]">Detalle / Ubicación</th>
                <th className="py-2.5 px-2 w-28 text-center">Fecha inicio</th>
                <th className="py-2.5 px-2 w-28 text-center">Fecha término</th>
                <th className="py-2.5 px-2 w-32 text-center">Avance actual</th>
              </tr>
            </thead>

            <tbody>
              {filteredFronts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                      {viewScope === "week" ? (
                        <div className="space-y-2 py-2">
                          <p className="text-sm font-bold text-slate-800">
                            No hay actividades programadas para la semana del {formatWeekRange(weekDays)}
                          </p>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            Puedes navegar a otras semanas con las flechas o saltar a la semana más reciente con actividades registradas:
                          </p>
                          <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
                            {latestProjectActivityDate && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  const parts = latestProjectActivityDate.split("-");
                                  if (parts.length === 3) {
                                    setCurrentDate(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
                                  }
                                }}
                                className="text-xs font-bold bg-blue-900 hover:bg-blue-800 text-white shadow-2xs"
                              >
                                Ver semana activa ({formatDateDisplay(latestProjectActivityDate)})
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setViewScope("active")}
                              className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                            >
                              Ver en ejecución ({activeTasksCount})
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-700">
                            No se encontraron actividades con los filtros aplicados
                          </p>
                          <p className="text-xs text-slate-400">
                            Prueba cambiando de filtro o limpiando el texto de búsqueda.
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMacroFilter("all");
                              setTowerFilter("");
                              setFloorFilter("");
                              setSearchTerm("");
                              setOperationalStatus("all");
                            }}
                            className="text-xs text-blue-700 font-semibold mt-2 hover:bg-blue-50"
                          >
                            Mostrar todas las actividades ({rawFronts.length})
                          </Button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFronts.map((front) => {
                  const catInfo = getCategoryInfo(front.activity);
                  const cleanTitle = formatCleanActivityTitle(front.activity);
                  const hasCrew = front.crew.length > 0;
                  const crewRows = hasCrew
                    ? front.crew
                    : [{ isPlaceholder: true, name: "Sin personas asignadas aún", role: "", task: front.scopeDisplay || front.floor || cleanTitle }];

                  return (
                    <React.Fragment key={front.id}>
                      {/* FILA DE ENCABEZADO DE ACTIVIDAD */}
                      <tr className="bg-slate-100/95 hover:bg-slate-200/80 border-t-2 border-b border-slate-300 font-bold text-slate-900 divide-x divide-slate-300 transition-colors">
                        <td colSpan={4} className="py-2.5 px-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-black h-4 px-1.5 py-0 uppercase tracking-wider shrink-0",
                                catInfo.color
                              )}
                            >
                              {catInfo.code}
                            </Badge>
                            <Link
                              to={`/item/${front.id}`}
                              state={{ from: "/programa" }}
                              className="font-extrabold uppercase tracking-tight text-slate-950 text-xs hover:text-blue-900 hover:underline transition-colors"
                              title={`Ver detalle de ${cleanTitle}`}
                            >
                              {cleanTitle}
                            </Link>
                            {front.tower && (
                              <Badge variant="outline" className="bg-white text-slate-700 text-[10px] h-4 py-0 font-bold shrink-0">
                                {front.tower}
                              </Badge>
                            )}
                            {front.scopeDisplay ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-900 border-blue-200 text-[10px] h-4 py-0 font-bold shrink-0">
                                {front.scopeDisplay}
                              </Badge>
                            ) : front.floor ? (
                              <Badge variant="outline" className="bg-white text-slate-700 text-[10px] h-4 py-0 font-bold shrink-0">
                                {front.floor}
                              </Badge>
                            ) : null}
                          </div>
                        </td>

                        {/* Fecha inicio */}
                        <td className="py-2 px-2 text-center">
                          {front.start_date ? (
                            <span className="inline-flex items-center font-mono text-[11px] font-bold text-slate-700 bg-white border border-slate-300 px-2 py-0.5 rounded shadow-3xs">
                              {formatDateDisplay(front.start_date)}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>

                        {/* Fecha término */}
                        <td className="py-2 px-2 text-center">
                          {front.end_date ? (
                            <span
                              className={cn(
                                "inline-flex items-center font-mono text-[11px] font-bold px-2 py-0.5 rounded border shadow-3xs",
                                front.isOverdue
                                  ? "bg-red-50 text-red-700 border-red-300"
                                  : "bg-white text-slate-700 border-slate-300"
                              )}
                            >
                              {formatDateDisplay(front.end_date)}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>

                        {/* Avance actual */}
                        <td className="py-2 px-2.5 text-center">
                          <div className="flex flex-col items-center justify-center gap-1 w-full max-w-[110px] mx-auto">
                            <div className="flex items-center justify-between w-full text-[11px] font-black tabular-nums">
                              <span
                                className={cn(
                                  front.pct >= 100
                                    ? "text-emerald-700"
                                    : front.isOverdue
                                    ? "text-red-700"
                                    : "text-blue-900"
                                )}
                              >
                                {front.pct}%
                              </span>
                              <span
                                className={cn(
                                  "text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider",
                                  front.pct >= 100
                                    ? "bg-emerald-100 text-emerald-800"
                                    : front.isOverdue
                                    ? "bg-red-100 text-red-800"
                                    : front.pct > 0
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-slate-200/70 text-slate-600"
                                )}
                              >
                                {front.pct >= 100 ? "Listo" : front.isOverdue ? "Atrasada" : front.pct > 0 ? "En curso" : "Por iniciar"}
                              </span>
                            </div>
                            <div className="w-full bg-slate-300 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-300",
                                  front.pct >= 100
                                    ? "bg-emerald-600"
                                    : front.isOverdue
                                    ? "bg-red-500"
                                    : "bg-blue-600"
                                )}
                                style={{ width: `${Math.max(front.pct, front.pct > 0 ? 5 : 0)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* FILAS DE TRABAJADORES ASIGNADOS */}
                      {crewRows.map((worker, idx) => {
                        if (worker.isPlaceholder) {
                          return (
                            <tr
                              key={`worker-${front.id}-empty`}
                              className="bg-amber-50/20 border-b border-slate-200 divide-x divide-slate-100"
                            >
                              <td className="py-1.5 px-2 text-center text-slate-300 font-mono text-[11px]">—</td>
                              <td colSpan={3} className="py-1.5 px-3 text-slate-400 text-xs italic">
                                Sin personas registradas en esta actividad
                              </td>
                              <td className="py-1.5 px-2 text-center text-slate-300 text-xs">—</td>
                              <td className="py-1.5 px-2 text-center text-slate-300 text-xs">—</td>
                              <td className="py-1.5 px-2 text-center text-slate-300 text-xs">—</td>
                            </tr>
                          );
                        }

                        const currentNumber = rowCounter++;
                        const shortRole = getShortRole(worker.role);

                        return (
                          <tr
                            key={`worker-${front.id}-${idx}-${worker.name}`}
                            className="hover:bg-slate-50/90 border-b border-slate-200 divide-x divide-slate-100 transition-colors"
                          >
                            <td className="py-1.5 px-2 text-center text-slate-400 font-mono text-[11px]">
                              {currentNumber}
                            </td>

                            <td className="py-1.5 px-3 font-medium text-slate-900">
                              <span className="font-semibold text-slate-800 text-xs">
                                {worker.name}
                              </span>
                            </td>

                            <td className="py-1.5 px-2 text-center">
                              {worker.role && worker.role !== "—" ? (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] px-1.5 py-0.2 rounded uppercase tracking-wide",
                                    getRoleBadgeClass(shortRole)
                                  )}
                                >
                                  {shortRole}
                                </Badge>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>

                            <td className="py-1.5 px-3 text-slate-600">
                              <span className="font-mono text-[11px]">
                                {worker.task || front.scopeDisplay || front.floor || cleanTitle}
                              </span>
                            </td>

                            <td className="py-1.5 px-2 text-center text-slate-300 text-xs">
                              —
                            </td>

                            <td className="py-1.5 px-2 text-center text-slate-300 text-xs">
                              —
                            </td>

                            <td className="py-1.5 px-2 text-center text-slate-300 text-xs">
                              —
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detalle de Personal Sin Actividad en la Semana */}
      <Dialog open={unassignedModalOpen} onOpenChange={setUnassignedModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center justify-between pr-4">
              <span>Personal sin Actividad en la Semana</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {unassignedWorkersInWeek.length} disponibles
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            <p className="text-xs text-slate-500">
              Semana del <strong className="text-slate-700">{formatWeekRange(weekDays)}</strong> ({activeProject?.name}). Los siguientes operarios no tienen actividades asignadas para esta semana:
            </p>

            <div className="max-h-72 overflow-y-auto divide-y border rounded-xl bg-slate-50/50">
              {unassignedWorkersInWeek.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  Todo el personal de la obra tiene actividades asignadas para esta semana.
                </div>
              ) : (
                unassignedWorkersInWeek.map((w) => (
                  <div key={w.id} className="p-2.5 flex items-center justify-between bg-white text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{w.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {w.current_activity ? `Última act.: ${w.current_activity}` : "Sin actividad previa registrada"}
                      </p>
                    </div>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", getRoleBadgeClass(getShortRole(w.role)))}>
                      {getShortRole(w.role)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUnassignedModalOpen(false)}
              className="text-xs"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
