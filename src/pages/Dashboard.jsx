import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionsContext";
import { useProjectFilter } from "@/lib/ProjectFilterContext";
import { api } from "@/lib/api";

import KPICards from "../components/dashboard/KPICards";
import EventCalendar from "../components/dashboard/EventCalendar";
import FloorProgress from "../components/dashboard/FloorProgress";
import FilterBar from "../components/dashboard/FilterBar";
import MasterPlanTable from "../components/master-plan/MasterPlanTable";
import ProjectForm from "../components/forms/ProjectForm";
import MasterItemForm from "../components/forms/MasterItemForm";
import DailyLogForm from "../components/forms/DailyLogForm";
import FloatingReportButton from "../components/common/FloatingReportButton";

import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { itemHasFloor } from "@/utils/floors";

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-32 rounded-md" />
          ))}
          <Skeleton className="h-9 min-w-[200px] flex-1 rounded-md" />
        </div>

        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-28 rounded-md" />
          ))}
        </div>
      </div>

      <Skeleton className="h-[420px] rounded-xl" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-[320px] rounded-xl" />
        <Skeleton className="h-[320px] rounded-xl" />
      </div>

      <Skeleton className="h-[360px] rounded-xl" />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { hasAccessToProject, userRole } = usePermissions();
  const { selectedProject } = useProjectFilter();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState(() => {
    try {
      const saved = sessionStorage.getItem("dashboard_filters");
      const base = saved ? JSON.parse(saved) : {
        project: "",
        tower: "",
        floor: "",
        activity: "",
        release: "",
        search: "",
      };
      base.project = selectedProject || "";
      if (saved && saved.project !== base.project) {
        base.tower = "";
        base.floor = "";
        base.activity = "";
      }
      return base;
    } catch (error) {
      console.warn("Error reading dashboard_filters from sessionStorage:", error);
      return {
        project: selectedProject || "",
        tower: "",
        floor: "",
        activity: "",
        release: "",
        search: "",
      };
    }
  });

  // Mantener sincronizado el filtro de obra del Dashboard con la selección global
  useEffect(() => {
    setFilters((prev) => {
      if (prev.project === selectedProject) return prev;
      return {
        ...prev,
        project: selectedProject,
        tower: "",
        floor: "",
        activity: "",
      };
    });
  }, [selectedProject]);

  useEffect(() => {
    try {
      sessionStorage.setItem("dashboard_filters", JSON.stringify(filters));
    } catch (error) {
      console.warn("Error writing dashboard_filters to sessionStorage:", error);
    }
  }, [filters]);

  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showDailyLog, setShowDailyLog] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [dailyLogItem, setDailyLogItem] = useState(null);
  const [editDailyLogData, setEditDailyLogData] = useState(null);

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

  const { data: dailyLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["dailyLogs"],
    queryFn: () => api.get("/daily-logs"),
    ...queryOptions,
  });

  const { data: sitePhotos = [] } = useQuery({
    queryKey: ["sitePhotos"],
    queryFn: () => api.get("/site-photos"),
    ...queryOptions,
  });

  const restoredSessionRef = useRef(false);

  useEffect(() => {
    if (restoredSessionRef.current) return;
    if (loadingItems || masterItems.length === 0) return;

    try {
      const saved = localStorage.getItem("active_modal_session");
      if (!saved) return;
      const session = JSON.parse(saved);

      // Verify draft is fresh (< 24 hours)
      if (session.timestamp && Date.now() - session.timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem("active_modal_session");
        return;
      }

      if (session.type === "daily_log" && session.itemId) {
        const item = masterItems.find((i) => Number(i.id) === Number(session.itemId));
        if (item) {
          restoredSessionRef.current = true;
          setDailyLogItem(item);
          if (session.editLogId && dailyLogs.length > 0) {
            const log = dailyLogs.find((l) => Number(l.id) === Number(session.editLogId));
            if (log) setEditDailyLogData(log);
          }
          setShowDailyLog(true);
        }
      } else if (session.type === "master_item") {
        restoredSessionRef.current = true;
        if (session.editItemId) {
          const item = masterItems.find((i) => Number(i.id) === Number(session.editItemId));
          if (item) {
            setEditItem(item);
            setShowItemForm(true);
          }
        } else {
          setShowItemForm(true);
        }
      }
    } catch (e) {
      console.warn("Error restoring active modal session in Dashboard:", e);
    }
  }, [loadingItems, masterItems, dailyLogs]);

  const filteredProjects =
    userRole === "admin"
      ? projects
      : projects.filter((project) => hasAccessToProject(project.name));

  const filteredMasterItems = React.useMemo(() => {
    const rawItems = userRole === "admin"
      ? masterItems
      : masterItems.filter((item) => hasAccessToProject(item.project));

    const hasFloorFilter = filters?.floor && filters.floor !== "all" && filters.floor !== "";

    if (hasFloorFilter) {
      const parentIdsWithChildren = new Set(
        rawItems.map((item) => item.parent_id).filter(Boolean)
      );
      return rawItems.filter((item) => !parentIdsWithChildren.has(item.id));
    } else {
      // Hide child items (which have parent_id set) to show only grouped parent items in lists
      return rawItems.filter((item) => !item.parent_id);
    }
  }, [masterItems, userRole, filters?.floor]);

  const createProject = useMutation({
    mutationFn: (data) => api.post("/projects", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const updateProject = useMutation({
    mutationFn: ({ id, data }) => api.put(`/projects/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["masterItems"] });
      queryClient.invalidateQueries({ queryKey: ["dailyLogs"] });
    },
  });

  const deleteProject = useMutation({
    mutationFn: (id) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["masterItems"] });
      queryClient.invalidateQueries({ queryKey: ["dailyLogs"] });
      queryClient.invalidateQueries({ queryKey: ["sitePhotos"] });
    },
  });

  const createItem = useMutation({
    mutationFn: (data) => api.post("/master-items", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["masterItems"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const updateItem = useMutation({
    mutationFn: ({ id, data }) => api.put(`/master-items/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["masterItems"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const deleteItem = useMutation({
    mutationFn: (id) => api.delete(`/master-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["masterItems"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const createLog = useMutation({
    mutationFn: (data) => {
      const masterItemId = data.master_item_id || dailyLogItem?.id;

      if (!masterItemId) {
        throw new Error("No se encontró el ítem asociado al reporte diario");
      }

      return api.post("/daily-logs", {
        ...data,
        master_item_id: masterItemId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dailyLogs"] });
      queryClient.invalidateQueries({ queryKey: ["masterItems"] });
      queryClient.invalidateQueries({ queryKey: ["photos"] });
      queryClient.invalidateQueries({ queryKey: ["sitePhotos"] });
    },
  });

  const filteredItems = filteredMasterItems.filter((item) => {
    if (filters.project && item.project !== filters.project) return false;
    if (filters.tower && item.tower !== filters.tower) return false;
    if (!itemHasFloor(item.floor, filters.floor, item.scope_type)) return false;
    if (filters.activity && item.activity !== filters.activity) return false;
    if (filters.release && item.release_status !== filters.release)
      return false;

    if (filters.search) {
      const search = filters.search.toLowerCase();

      const searchable = `
        ${item.project || ""}
        ${item.tower || ""}
        ${item.floor || ""}
        ${item.activity || ""}
        ${item.crew_name || ""}
        ${item.restrictions || ""}
      `.toLowerCase();

      if (!searchable.includes(search)) return false;
    }

    return true;
  });

  const filteredItemIds = new Set(filteredItems.map((i) => Number(i.id)));
  const filteredLogs = dailyLogs.filter((log) => {
    if (!filteredItemIds.has(Number(log.master_item_id))) return false;
    const logItem = masterItems.find((mi) => Number(mi.id) === Number(log.master_item_id));
    if (!itemHasFloor(log.floor, filters.floor, logItem?.scope_type)) return false;

    return true;
  });

  const pdfMasterItems = React.useMemo(() => {
    // 1. Parent items matching filters
    const matchedParents = filteredItems.filter(item => !item.parent_id);
    const matchedParentIds = new Set(matchedParents.map(item => String(item.id)));

    // 2. Child items belonging to the matched parents
    const matchedChildren = masterItems.filter(item => {
      if (!item.parent_id) return false;
      if (!matchedParentIds.has(String(item.parent_id))) return false;
      
      // Filter by floor if active
      if (filters.floor && filters.floor !== "all" && filters.floor !== "") {
        if (item.floor !== filters.floor) return false;
      }
      return true;
    });

    return [...matchedParents, ...matchedChildren];
  }, [filteredItems, masterItems, filters.floor]);

  const pdfDailyLogs = React.useMemo(() => {
    const exportedItemIds = new Set(pdfMasterItems.map(item => String(item.id)));
    return dailyLogs.filter(log => exportedItemIds.has(String(log.master_item_id)));
  }, [pdfMasterItems, dailyLogs]);

  const pdfSitePhotos = React.useMemo(() => {
    const exportedItemIds = new Set(pdfMasterItems.map(item => String(item.id)));
    return sitePhotos.filter(photo => exportedItemIds.has(String(photo.master_item_id)));
  }, [pdfMasterItems, sitePhotos]);

  const handleEdit = (item) => {
    setEditItem(item);
    setShowItemForm(true);
  };

  const logAudit = async (
    action,
    entityName,
    entityId,
    description,
    previousData = null,
  ) => {
    try {
      await api.post("/audit-logs", {
        action,
        entity_name: entityName,
        entity_id: entityId,
        user_name: user?.full_name || "",
        user_email: user?.email || "",
        description,
        previous_data: previousData ? JSON.stringify(previousData) : null,
      });
    } catch (error) {
      console.warn("No se pudo guardar auditoría:", error.message);
    }
  };

  const handleToggleBlock = async (item) => {
    try {
      const isCurrentlyBlocked = item.status === "bloqueado" || item.status === "piso bloqueado";
      const newStatus = isCurrentlyBlocked ? "en_ejecucion" : "bloqueado";

      let crewMembers = item.crew_members;
      if (typeof crewMembers === 'string') {
        try {
          crewMembers = JSON.parse(crewMembers);
        } catch (e) {
          crewMembers = [];
        }
      }

      const payload = {
        project: item.project,
        tower: item.tower,
        floor: item.floor,
        scope_type: item.scope_type,
        departments: item.departments,
        activity: item.activity,
        start_date: item.start_date,
        end_date: item.end_date,
        planned_qty: item.planned_qty,
        unit: item.unit,
        crew_name: item.crew_name,
        crew_size: item.crew_size,
        crew_members: crewMembers,
        restrictions: item.restrictions || "",
        observations: item.observations || "",
        status: newStatus,
        release_status: item.release_status,
      };

      await updateItem.mutateAsync({ id: item.id, data: payload });

      await logAudit(
        isCurrentlyBlocked ? "desbloquear" : "bloquear",
        "MasterItem",
        item.id,
        `${isCurrentlyBlocked ? "Desbloqueó" : "Bloqueó"} la actividad "${item.activity}" en obra "${item.project}"`,
        item,
      );
    } catch (error) {
      console.error("Error al cambiar bloqueo de actividad:", error);
    }
  };

  const handleSaveItem = async (data) => {
    try {
      if (editItem) {
        await updateItem.mutateAsync({ id: editItem.id, data });

        await logAudit(
          "editar",
          "MasterItem",
          editItem.id,
          `Editó ítem "${data.activity || editItem.activity}" (${
            data.project || editItem.project
          })`,
          editItem,
        );
      } else {
        const newItem = await createItem.mutateAsync(data);

        await logAudit(
          "crear",
          "MasterItem",
          newItem?.id || "nuevo",
          `Creó ítem "${data.activity}" (${data.project})`,
        );
      }

      setEditItem(null);
      setShowItemForm(false);
    } catch (error) {
      console.error("Error al guardar ítem:", error);
    }
  };

  const handleOpenNewProject = () => {
    setEditProject(null);
    setShowProjectForm(true);
  };

  const handleOpenEditProject = (selectedProject) => {
    const project =
      selectedProject || projects.find((p) => p.name === filters.project);
    if (!project) return;

    setEditProject(project);
    setShowProjectForm(true);
  };

  const handleSaveProject = async (data) => {
    if (editProject) {
      const previousName = editProject.name;
      await updateProject.mutateAsync({ id: editProject.id, data });

      if (filters.project === previousName) {
        setFilters((prev) => ({ ...prev, project: data.name }));
      }

      setEditProject(null);
      return;
    }

    await createProject.mutateAsync(data);
  };

  const handleDeleteProject = async (project) => {
    await deleteProject.mutateAsync(project.id);
    setFilters((prev) => ({
      ...prev,
      project: prev.project === project.name ? "" : prev.project,
    }));
    setEditProject(null);
  };

  const handleSaveItemAndLog = async (data) => {
    try {
      const newItem = await createItem.mutateAsync(data);

      setEditItem(null);
      setShowItemForm(false);
      setDailyLogItem(newItem);
      setShowDailyLog(true);
    } catch (error) {
      console.error("Error al guardar item y abrir log:", error);
    }
  };

  const deletePhotosByLogId = async (logId) => {
    const relatedPhotos = sitePhotos.filter(
      (photo) => photo.daily_log_id === logId,
    );

    for (const photo of relatedPhotos) {
      await api.delete(`/site-photos/${photo.id}`);
    }
  };

  const deleteDirectPhotosByItemId = async (itemId) => {
    const directPhotos = sitePhotos.filter(
      (photo) => photo.master_item_id === itemId && !photo.daily_log_id,
    );

    for (const photo of directPhotos) {
      await api.delete(`/site-photos/${photo.id}`);
    }
  };

  const handleDelete = async (item) => {
    const confirmed = window.confirm(
      `¿Eliminar ítem "${item.activity}" de ${item.project}?\nEsta acción también eliminará sus reportes diarios y fotos.`,
    );

    if (!confirmed) return;

    try {
      const relatedLogs = dailyLogs.filter(
        (log) => Number(log.master_item_id) === Number(item.id),
      );

      for (const log of relatedLogs) {
        await deletePhotosByLogId(log.id);
        await api.delete(`/daily-logs/${log.id}`);
      }

      await deleteDirectPhotosByItemId(item.id);
      await deleteItem.mutateAsync(item.id);

      await logAudit(
        "eliminar",
        "MasterItem",
        item.id,
        `Eliminó ítem "${item.activity}" (${item.project} ${item.tower || ""} ${
          item.floor || ""
        })`,
        item,
      );

      await queryClient.invalidateQueries({ queryKey: ["dailyLogs"] });
      await queryClient.invalidateQueries({ queryKey: ["sitePhotos"] });
    } catch (error) {
      console.error("Error al eliminar ítem:", error);
    }
  };

  const handleDeleteLog = async (log, item) => {
    const confirmed = window.confirm(`¿Eliminar el reporte del ${log.date}?`);
    if (!confirmed) return;

    try {
      if (item) {
        await api.put(`/master-items/${item.id}`, {
          ...item,
          executed_qty: Math.max(
            Number(item.executed_qty || 0) - Number(log.executed_today || 0),
            0,
          ),
        });
      }

      await deletePhotosByLogId(log.id);
      await api.delete(`/daily-logs/${log.id}`);

      await logAudit(
        "eliminar",
        "DailyLog",
        log.id,
        `Eliminó reporte del ${log.date} (${item?.activity || ""} - ${
          item?.project || ""
        })`,
        log,
      );

      await queryClient.invalidateQueries({ queryKey: ["dailyLogs"] });
      await queryClient.invalidateQueries({ queryKey: ["masterItems"] });
      await queryClient.invalidateQueries({ queryKey: ["sitePhotos"] });
    } catch (error) {
      console.error("Error al eliminar reporte:", error);
    }
  };

  const handleDailyLog = (item) => {
    setDailyLogItem(item);
    setShowDailyLog(true);
  };

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["masterItems"] }),
      queryClient.invalidateQueries({ queryKey: ["dailyLogs"] }),
      queryClient.invalidateQueries({ queryKey: ["sitePhotos"] }),
    ]);
  };

  // const pdfMasterItems = filteredMasterItems;
// const pdfMasterItemIds = new Set(pdfMasterItems.map((i) => Number(i.id)));
// const pdfDailyLogs = dailyLogs.filter((log) =>
//   pdfMasterItemIds.has(Number(log.master_item_id)),
// );
// const pdfSitePhotos = sitePhotos.filter((photo) =>
//   pdfMasterItemIds.has(Number(photo.master_item_id)),
// );

  if (loadingProjects || loadingItems || loadingLogs) {
    return <DashboardSkeleton />;
  }

  if (userRole !== "admin" && filteredProjects.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Sin Acceso a Obras
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              No tienes acceso a ninguna obra. Contacta al administrador para
              que te asigne permisos.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <KPICards masterItems={filteredItems} dailyLogs={filteredLogs} />

      <FilterBar
        filters={filters}
        setFilters={setFilters}
        projects={filteredProjects}
        masterItems={filteredItems}
        filterOptionItems={filteredMasterItems}
        dailyLogs={filteredLogs}
        sitePhotos={sitePhotos}
        pdfMasterItems={pdfMasterItems}
        pdfDailyLogs={pdfDailyLogs}
        pdfSitePhotos={pdfSitePhotos}
        userName={user?.full_name || ""}
        onNewProject={handleOpenNewProject}
        onEditProject={handleOpenEditProject}
        onNewItem={() => {
          setEditItem(null);
          setShowItemForm(true);
        }}
        onRefresh={refreshAll}
      />

      <MasterPlanTable
        items={filteredItems}
        projects={projects}
        dailyLogs={filteredLogs}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDailyLog={handleDailyLog}
        onEditDailyLog={(log, item) => {
          const effectiveItem =
            item ||
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
          setDailyLogItem(effectiveItem);
          setEditDailyLogData(log);
          setShowDailyLog(true);
        }}
        onDeleteLog={handleDeleteLog}
        onToggleBlock={handleToggleBlock}
      />

      <div className="grid grid-cols-1 gap-4 md:gap-6">
        <EventCalendar masterItems={filteredItems} dailyLogs={filteredLogs} />
      </div>

      <FloorProgress masterItems={masterItems} projects={filteredProjects} />

      <ProjectForm
        open={showProjectForm}
        onClose={() => {
          setShowProjectForm(false);
          setEditProject(null);
        }}
        onSave={handleSaveProject}
        onDelete={handleDeleteProject}
        editProject={editProject}
      />

      <MasterItemForm
        open={showItemForm}
        onClose={() => {
          setShowItemForm(false);
          setEditItem(null);
        }}
        onSave={handleSaveItem}
        onSaveAndLog={handleSaveItemAndLog}
        editItem={editItem}
        projects={projects}
      />

      <DailyLogForm
        open={showDailyLog}
        onClose={() => {
          setShowDailyLog(false);
          setDailyLogItem(null);
          setEditDailyLogData(null);
        }}
        onSave={async (data) => {
          const payload = { ...data };

          // Normalizar firma si viene con URL absoluta
          if (
            payload.capataz_signature &&
            typeof payload.capataz_signature === "string" &&
            payload.capataz_signature.includes("/uploads/signatures/")
          ) {
            const idx = payload.capataz_signature.indexOf("/uploads/signatures/");
            payload.capataz_signature = payload.capataz_signature.slice(idx);
          }

          // Si la firma viene como base64, se sube
          if (
            payload.capataz_signature &&
            typeof payload.capataz_signature === "string" &&
            payload.capataz_signature.startsWith("data:image/")
          ) {
            const uploadedSignature = await api.post("/upload/signature", {
              imageBase64: payload.capataz_signature,
            });
            payload.capataz_signature = uploadedSignature.file_url;
          }

          let log;
          if (editDailyLogData) {
            log = await api.put(`/daily-logs/${editDailyLogData.id}`, {
              ...payload,
              master_item_id: editDailyLogData.master_item_id,
            });

            // Guardar fotos en site-photos (solo las nuevas al editar)
            if (Array.isArray(payload.photos) && payload.photos.length > 0) {
              for (const photo of payload.photos) {
                if (!photo.id) {
                  await api.post("/site-photos", {
                    daily_log_id: log.id,
                    master_item_id: payload.master_item_id || editDailyLogData.master_item_id,
                    file_url: photo.file_url || photo.url || "",
                    description: photo.description || "",
                    label: photo.label || "reporte_diario",
                    date:
                      photo.date ||
                      payload.date ||
                      new Date().toISOString().split("T")[0],
                  });
                }
              }
            }
          } else {
            log = await createLog.mutateAsync({
              ...payload,
              master_item_id: dailyLogItem?.id,
            });
          }

          queryClient.invalidateQueries({ queryKey: ["dailyLogs"] });
          queryClient.invalidateQueries({ queryKey: ["masterItems"] });
          queryClient.invalidateQueries({ queryKey: ["sitePhotos"] });
          queryClient.invalidateQueries({ queryKey: ["photos"] });

          setEditDailyLogData(null);
          return log;
        }}
        masterItem={dailyLogItem}
        project={projects.find((p) => p.name === dailyLogItem?.project)}
        userName={user?.full_name}
        initialLogData={editDailyLogData}
      />

      <FloatingReportButton
        selectedProject={filters.project}
        projects={projects}
        onSelectItem={(item) => {
          setDailyLogItem(item);
          setShowDailyLog(true);
        }}
        onSelectDailyLog={(log, item) => {
          const effectiveItem =
            item ||
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
          setDailyLogItem(effectiveItem);
          setEditDailyLogData(log);
          setShowDailyLog(true);
        }}
      />
    </div>
  );
}
