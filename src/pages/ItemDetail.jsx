import React, { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { Link, useParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Camera, FileText, Users, Layers, ArrowUpDown, Lock, Unlock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { exportReportPDF } from "@/utils/exportPDF";

import ItemInfo from "../components/detail/ItemInfo";
import DailyLogTable from "../components/detail/DailyLogTable";
import WorkerProductivity from "../components/detail/WorkerProductivity";
import PhotoGallery from "../components/detail/PhotoGallery";
import DailyLogForm from "../components/forms/DailyLogForm";
import ItemScopeSummary from "../components/common/ItemScopeSummary";

function ItemDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export default function ItemDetail() {
  const { id: itemId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();

  const backPath = location.state?.from || "/";

  const [showLogForm, setShowLogForm] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [editDailyLogData, setEditDailyLogData] = useState(null);

  const queryOptions = {
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  };

  const { data: allItems = [], isLoading: loadingItem } = useQuery({
    queryKey: ["masterItems"],
    queryFn: () => api.get("/master-items"),
    ...queryOptions,
  });

  const item = allItems.find(
    (masterItem) => String(masterItem.id) === String(itemId),
  );

  const isMultiFloor = item ? item.scope_type === "multiples_pisos" : false;
  const parentItem = item && isMultiFloor && item.parent_id 
    ? allItems.find((x) => String(x.id) === String(item.parent_id)) 
    : null;
  const siblingItems = item && isMultiFloor && item.parent_id
    ? allItems.filter((x) => String(x.parent_id) === String(item.parent_id))
    : [];
  const childItems = item && isMultiFloor && !item.parent_id
    ? allItems.filter((x) => String(x.parent_id) === String(item.id))
    : [];

  const isParent = isMultiFloor && item && !item.parent_id;

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects"),
    ...queryOptions,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["dailyLogs", itemId],
    queryFn: () =>
      api.get(`/daily-logs?master_item_id=${encodeURIComponent(itemId)}`),
    enabled: !!itemId,
    ...queryOptions,
  });

  const { data: workers = [] } = useQuery({
    queryKey: ["workers", itemId],
    queryFn: () =>
      api.get(`/project-workers?master_item_id=${encodeURIComponent(itemId)}`),
    enabled: !!itemId,
    ...queryOptions,
  });

  const { data: photos = [] } = useQuery({
    queryKey: ["photos", itemId],
    queryFn: () => api.get("/site-photos"),
    enabled: !!itemId,
    ...queryOptions,
  });

  const handleSaveLog = async (data) => {
    try {
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

      // Se guarda el reporte con capataz_signature como ruta.
      let newLog;
      if (editDailyLogData) {
        newLog = await api.put(`/daily-logs/${editDailyLogData.id}`, {
          ...payload,
          master_item_id: editDailyLogData.master_item_id,
        });

        // Solo las fotos reales nuevas del reporte se guardan en site_photos al editar
        if (Array.isArray(payload.photos) && payload.photos.length > 0) {
          for (const photo of payload.photos) {
            if (!photo.id) {
              await api.post("/site-photos", {
                daily_log_id: newLog.id,
                master_item_id: payload.master_item_id || itemId,
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
        newLog = await api.post("/daily-logs", {
          ...payload,
          master_item_id: itemId,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["dailyLogs", itemId] });
      await queryClient.invalidateQueries({ queryKey: ["masterItems"] });
      await queryClient.invalidateQueries({ queryKey: ["photos", itemId] });

      setEditDailyLogData(null);
      return newLog;
    } catch (error) {
      console.error("Error al guardar reporte diario:", error);
      throw error;
    }
  };

  const handleCloseLogForm = () => {
    setShowLogForm(false);
    setEditDailyLogData(null);
    queryClient.invalidateQueries({ queryKey: ["photos", itemId] });
    queryClient.invalidateQueries({ queryKey: ["dailyLogs", itemId] });
  };

  const handleDeleteLog = async (log) => {
    const confirmed = window.confirm(`¿Eliminar el reporte del ${log.date}?`);
    if (!confirmed) return;

    try {
      const relatedPhotos = photos.filter(
        (photo) => photo.daily_log_id === log.id,
      );

      for (const photo of relatedPhotos) {
        await api.delete(`/site-photos/${photo.id}`);
      }

      await api.delete(`/daily-logs/${log.id}`);

      await api
        .post("/audit-logs", {
          action: "eliminar",
          entity_name: "DailyLog",
          entity_id: log.id,
          user_name: user?.full_name || "",
          user_email: user?.email || "",
          description: `Eliminó reporte del ${log.date} (${item?.activity || ""} - ${item?.project || ""})`,
          previous_data: JSON.stringify(log),
        })
        .catch((e) => console.warn(e));

      await queryClient.invalidateQueries({ queryKey: ["dailyLogs", itemId] });
      await queryClient.invalidateQueries({ queryKey: ["masterItems"] });
      await queryClient.invalidateQueries({ queryKey: ["photos", itemId] });
    } catch (error) {
      console.error("Error al eliminar reporte:", error);
    }
  };

  const updateItem = useMutation({
    mutationFn: ({ id, data }) => api.put(`/master-items/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["masterItems"] });
    },
  });

  const handleToggleChildBlock = async (cItem) => {
    const isCurrentlyBlocked = cItem.status === "bloqueado";
    const newStatus = isCurrentlyBlocked ? "en_ejecucion" : "bloqueado";

    let crewMembers = cItem.crew_members;
    if (typeof crewMembers === 'string') {
      try {
        crewMembers = JSON.parse(crewMembers);
      } catch (e) {
        crewMembers = [];
      }
    }

    const payload = {
      project: cItem.project,
      tower: cItem.tower,
      floor: cItem.floor,
      scope_type: cItem.scope_type,
      departments: cItem.departments,
      activity: cItem.activity,
      start_date: cItem.start_date,
      end_date: cItem.end_date,
      planned_qty: cItem.planned_qty,
      unit: cItem.unit,
      crew_name: cItem.crew_name,
      crew_size: cItem.crew_size,
      crew_members: crewMembers,
      restrictions: cItem.restrictions || "",
      observations: cItem.observations || "",
      status: newStatus,
      release_status: cItem.release_status,
    };

    await updateItem.mutateAsync({ id: cItem.id, data: payload });
  };

  const handleToggleAllChildrenBlock = async (block) => {
    const newStatus = block ? "bloqueado" : "en_ejecucion";
    
    const targetItems = item?.parent_id 
      ? siblingItems
      : childItems;

    for (const cItem of targetItems) {
      let crewMembers = cItem.crew_members;
      if (typeof crewMembers === 'string') {
        try {
          crewMembers = JSON.parse(crewMembers);
        } catch (e) {
          crewMembers = [];
        }
      }

      const payload = {
        project: cItem.project,
        tower: cItem.tower,
        floor: cItem.floor,
        scope_type: cItem.scope_type,
        departments: cItem.departments,
        activity: cItem.activity,
        start_date: cItem.start_date,
        end_date: cItem.end_date,
        planned_qty: cItem.planned_qty,
        unit: cItem.unit,
        crew_name: cItem.crew_name,
        crew_size: cItem.crew_size,
        crew_members: crewMembers,
        restrictions: cItem.restrictions || "",
        observations: cItem.observations || "",
        status: newStatus,
        release_status: cItem.release_status,
      };

      await updateItem.mutateAsync({ id: cItem.id, data: payload });
    }
  };

  if (loadingItem) {
    return <ItemDetailSkeleton />;
  }

  if (!item) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Ítem no encontrado</p>

        <Link to={backPath}>
          <Button variant="outline" className="mt-4">
            Volver
          </Button>
        </Link>
      </div>
    );
  }

  const floorBreakdown = item.parent_id 
    ? siblingItems 
    : childItems;

  const sortedBreakdown = [...floorBreakdown].sort((a, b) => {
    const numA = parseInt(a.floor?.replace(/\D/g, "") || "0", 10);
    const numB = parseInt(b.floor?.replace(/\D/g, "") || "0", 10);
    return numA - numB;
  });

  const childIds = childItems.map((c) => String(c.id));
  const targetIds = [String(itemId), ...childIds];

  const scopedLogs = logs.filter(
    (log) => targetIds.includes(String(log.master_item_id)),
  );

  const hasUnsignedLogs = scopedLogs.some(
    (log) => !log.capataz_signature || log.capataz_signature.trim() === "",
  );

  const scopedWorkers = workers.filter(
    (worker) => targetIds.includes(String(worker.master_item_id)),
  );

  const scopedPhotos = photos.filter((photo) => {
    if (targetIds.includes(String(photo.master_item_id))) return true;
    if (photo.daily_log_id && scopedLogs.some((log) => String(log.id) === String(photo.daily_log_id))) return true;
    return false;
  });

  const projectForItem =
    projects.find((project) => project.name === item.project) || null;

  const totalExecutedInLogs = scopedLogs.reduce(
    (sum, log) => sum + (Number(log.executed_today) || 0),
    0,
  );

  const productivityRows = scopedLogs.reduce(
    (sum, log) =>
      sum + (Array.isArray(log.crew_workers) ? log.crew_workers.length : 0),
    0,
  );

  const overviewCards = [
    {
      title: "Reportes diarios",
      value: scopedLogs.length,
      hint: `Ejecutado en bitácora: ${totalExecutedInLogs}`,
      icon: FileText,
    },
    {
      title: "Registro fotográfico",
      value: scopedPhotos.length,
      hint: "Fotos asociadas",
      icon: Camera,
    },
    {
      title: "Productividad",
      value: productivityRows,
      hint: "Registros individuales",
      icon: Users,
    },
  ];

  const handleExportPdf = async () => {
    if (isExportingPdf) return;

    setIsExportingPdf(true);

    try {
      await exportReportPDF(
        item.parent_id ? [item] : [item, ...childItems],
        scopedLogs,
        scopedPhotos,
        [],
        projectForItem ? [projectForItem] : [],
        user?.full_name || user?.email || "",
        {
          emailToUser: false,
          emailSubject: `Informe PDF Detalle Item - ${item.activity || item.project || "Control de Obras DGC"}`,
        },
      );
      // alert("PDF descargado y enviado al correo del usuario logeado.");
    } catch (error) {
      // alert(`El PDF se descargó, pero no se pudo enviar el correo: ${error.message}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={backPath}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>

        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="text-lg font-bold">Detalle del Ítem</h1>
          {isMultiFloor && (
            <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-extrabold select-none">
              Grupo Múltiple
            </Badge>
          )}
          <div className="w-full">
            <ItemScopeSummary item={item} />
          </div>
        </div>

        <Button
          variant="outline"
          onClick={handleExportPdf}
          disabled={isExportingPdf}
        >
          {isExportingPdf ? "Exportando..." : "Exportar PDF"}
        </Button>
      </div>

      <ItemInfo item={item} hasUnsignedLogs={hasUnsignedLogs} />

      {sortedBreakdown.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-2 border-b border-slate-105">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Layers className="h-4 w-4 text-orange-500" />
                Desglose de Avance por Piso
              </h3>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleAllChildrenBlock(true)}
                  className="h-7 text-xs font-semibold text-red-650 border-red-200 hover:bg-red-50 hover:text-red-750 flex items-center gap-1.5"
                >
                  <Lock className="h-3 w-3" />
                  Bloquear Todos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleAllChildrenBlock(false)}
                  className="h-7 text-xs font-semibold text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-1.5"
                >
                  <Unlock className="h-3 w-3" />
                  Desbloquear Todos
                </Button>
              </div>
            </div>
            
            {parentItem && (
              <div className="mb-4 p-3 bg-slate-50 rounded-xl flex items-center justify-between gap-3 text-xs border border-slate-100">
                <span className="text-slate-600 font-medium">
                  Actividad agrupada: <strong className="text-slate-800">{parentItem.activity}</strong> ({parentItem.floor})
                </span>
                <Link to={`/item/${parentItem.id}`} state={{ from: backPath }}>
                  <Button variant="outline" size="sm" className="h-7 text-xs font-bold text-primary border-primary/20 hover:bg-primary/5">
                    Ver Consolidado General
                  </Button>
                </Link>
              </div>
            )}

            {!item.parent_id && (
              <div className="mb-3 text-xs text-slate-500 leading-normal">
                Esta es la vista consolidada de la actividad. A continuación se detalla el avance individual de cada piso:
              </div>
            )}

            <div className="divide-y divide-slate-150">
              {sortedBreakdown.map((fItem) => {
                const isCurrent = Number(fItem.id) === Number(itemId);
                const rawPct = fItem.planned_qty > 0 ? Math.round((fItem.executed_qty || 0) / fItem.planned_qty * 100) : 0;
                const fPct = Math.min(rawPct, 100);
                
                const statusLabelMap = {
                  pendiente: 'Pendiente', en_ejecucion: 'En ejecución', completado: 'Completado', bloqueado: 'Bloqueado',
                  'piso bloqueado': 'Piso Bloqueado',
                };
                const statusColorMap = {
                  pendiente: 'bg-slate-100 text-slate-600', en_ejecucion: 'bg-blue-50 text-blue-700',
                  completado: 'bg-emerald-50 text-emerald-700', bloqueado: 'bg-red-50 text-red-700',
                  'piso bloqueado': 'bg-rose-50 text-rose-700',
                };

                const isChildBlocked = fItem.status === "bloqueado";

                return (
                  <div key={fItem.id} className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isCurrent ? 'bg-orange-50/30 -mx-5 px-5' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${isCurrent ? 'text-orange-600' : 'text-slate-700'}`}>
                        {fItem.floor} {isCurrent && "(Piso Actual)"}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border-0 ${statusColorMap[fItem.status] || 'bg-slate-150 text-slate-600'}`}>
                        {statusLabelMap[fItem.status] || fItem.status}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
                      <div className="w-24 bg-slate-100 h-1.5 rounded-full overflow-hidden shrink-0">
                        <div className="bg-primary h-full" style={{ width: `${fPct}%` }}></div>
                      </div>
                      <span className="w-8 text-right font-semibold">{fPct}%</span>
                      <span className="w-24 text-right">
                        {fItem.executed_qty || 0} / {fItem.planned_qty} {fItem.unit}
                      </span>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleChildBlock(fItem)}
                          title={isChildBlocked ? "Desbloquear Piso" : "Bloquear Piso"}
                          className={cn(
                            "h-7 w-7 rounded-lg",
                            isChildBlocked
                              ? "text-red-650 hover:text-red-750 hover:bg-red-50"
                              : "text-slate-405 hover:text-red-500 hover:bg-slate-50"
                          )}
                        >
                          {isChildBlocked ? (
                            <Lock className="h-3.5 w-3.5" />
                          ) : (
                            <Unlock className="h-3.5 w-3.5" />
                          )}
                        </Button>

                        {!isCurrent ? (
                          <Link to={`/item/${fItem.id}`} state={{ from: backPath }} className="shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 text-xs font-bold text-primary p-1">
                              Ver Detalle
                            </Button>
                          </Link>
                        ) : (
                          <span className="w-[70px] text-center text-[10px] text-orange-600 font-bold bg-orange-100/50 rounded py-0.5 px-1 shrink-0">
                            Actual
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!isParent && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {overviewCards.map((card) => (
              <Card key={card.title} className="border-0 shadow-sm">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{card.title}</p>
                    <p className="text-lg font-semibold leading-tight">
                      {card.value}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{card.hint}</p>
                  </div>
                  <card.icon className="h-4 w-4 text-accent" />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="w-full">
            <DailyLogTable
              logs={scopedLogs}
              onAddLog={() => setShowLogForm(true)}
              onEditLog={(log) => {
                setEditDailyLogData(log);
                setShowLogForm(true);
              }}
              onDeleteLog={handleDeleteLog}
            />
          </div>

          <WorkerProductivity logs={scopedLogs} workers={scopedWorkers} />

          <PhotoGallery
            photos={scopedPhotos}
            masterItemId={itemId}
            onPhotoAdded={() =>
              queryClient.invalidateQueries({ queryKey: ["photos", itemId] })
            }
          />
        </>
      )}

      <DailyLogForm
        open={showLogForm}
        onClose={handleCloseLogForm}
        onSave={handleSaveLog}
        masterItem={item}
        project={projectForItem}
        userName={user?.full_name}
        initialLogData={editDailyLogData}
      />
    </div>
  );
}