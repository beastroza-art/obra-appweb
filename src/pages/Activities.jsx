import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import {
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Search,
  Zap,
  Radio,
  Wifi,
  ListChecks,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/lib/PermissionsContext";
import { Navigate } from "react-router-dom";
import { api } from "@/lib/api";
import { CATEGORY_META, DEFAULT_CATEGORIES } from "@/constants/defaultActivities";

export default function Activities() {
  const { isAdmin } = usePermissions();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("active");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [formCategory, setFormCategory] = useState("EL");
  const [formName, setFormName] = useState("");
  const [formError, setFormError] = useState("");

  const [activityToDelete, setActivityToDelete] = useState(null);

  if (!isAdmin) return <Navigate to="/" replace />;

  const {
    data: activities = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["activities", { all: true }],
    queryFn: () => api.get("/activities?all=true"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post("/activities", data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      setModalOpen(false);
      resetForm();
    },
    onError: (err) => {
      setFormError(err.message || "Error al registrar la actividad.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/activities/${id}`, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      if (res.cascadeUpdated) {
        queryClient.invalidateQueries({ queryKey: ["masterItems"] });
        queryClient.invalidateQueries({ queryKey: ["dailyLogs"] });
        queryClient.invalidateQueries({ queryKey: ["projectWorkers"] });
      }
      setModalOpen(false);
      resetForm();
    },
    onError: (err) => {
      setFormError(err.message || "Error al actualizar la actividad.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, permanent }) =>
      api.delete(`/activities/${id}${permanent ? "?permanent=true" : ""}`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      setActivityToDelete(null);
    },
    onError: (err) => {
      alert("Error al procesar: " + (err.message || "Error desconocido"));
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id) => api.post(`/activities/${id}/reactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
    onError: (err) => {
      alert("Error al reactivar: " + (err.message || "Error desconocido"));
    },
  });

  const resetForm = () => {
    setEditingActivity(null);
    setFormCategory("EL");
    setFormName("");
    setFormError("");
  };

  const openCreateModal = () => {
    resetForm();
    if (selectedCategory !== "all") {
      setFormCategory(selectedCategory);
    }
    setModalOpen(true);
  };

  const openEditModal = (activity) => {
    setEditingActivity(activity);
    setFormCategory(activity.category);
    // Remover prefijo de categoría si lo tiene para edición amigable
    let rawName = activity.name;
    const prefixRegex = new RegExp(`^${activity.category}[\\s:–-]+`, "i");
    if (prefixRegex.test(rawName)) {
      rawName = rawName.replace(prefixRegex, "").trim();
    }
    setFormName(rawName);
    setFormError("");
    setModalOpen(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError("El nombre de la actividad no puede estar vacío.");
      return;
    }

    if (editingActivity) {
      updateMutation.mutate({
        id: editingActivity.id,
        data: {
          category: formCategory,
          name: formName.trim(),
        },
      });
    } else {
      createMutation.mutate({
        category: formCategory,
        name: formName.trim(),
      });
    }
  };

  // Preview del nombre final
  const previewFullName = useMemo(() => {
    let clean = formName.trim();
    const cat = formCategory.toUpperCase();
    const prefixRegex = new RegExp(`^${cat}[\\s:–-]+`, "i");
    if (prefixRegex.test(clean)) {
      clean = clean.replace(prefixRegex, "").trim();
    }
    return clean ? `${cat} ${clean}` : `${cat} ...`;
  }, [formName, formCategory]);

  // Contadores
  const stats = useMemo(() => {
    const total = activities.length;
    const active = activities.filter((a) => a.active === 1).length;
    const inactive = activities.filter((a) => a.active === 0).length;
    const el = activities.filter((a) => a.category === "EL" && a.active === 1).length;
    const cd = activities.filter((a) => a.category === "CD" && a.active === 1).length;
    const tc = activities.filter((a) => a.category === "TC" && a.active === 1).length;
    return { total, active, inactive, el, cd, tc };
  }, [activities]);

  // Lista filtrada
  const filteredActivities = useMemo(() => {
    return activities.filter((a) => {
      if (selectedCategory !== "all" && a.category !== selectedCategory) {
        return false;
      }
      if (selectedStatus === "active" && a.active !== 1) {
        return false;
      }
      if (selectedStatus === "inactive" && a.active !== 0) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          a.name.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activities, selectedCategory, selectedStatus, search]);

  const getCategoryBadge = (cat) => {
    const meta = CATEGORY_META[cat] || {
      badgeClass: "bg-slate-100 text-slate-800 border-slate-300",
      name: cat,
    };
    return (
      <Badge
        variant="outline"
        className={`px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${meta.badgeClass}`}
      >
        {cat}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <ListChecks className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Catálogo de Actividades
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Administra las actividades disponibles para el Plan Maestro (EL, CD, TC).
          </p>
        </div>

        <Button
          onClick={openCreateModal}
          className="flex items-center gap-2 shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Nueva Actividad
        </Button>
      </div>

      {isError && (
        <Card className="p-4 bg-amber-50/90 border-amber-300 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-sm">
                El backend aún no tiene activa la ruta de actividades
              </p>
              <p>
                El servidor backend respondió:{" "}
                <span className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-800">
                  {error?.message || "Ruta no encontrada"}
                </span>
                . Esto ocurre si el servidor se inició antes de cargar los últimos cambios.
              </p>
              <p className="text-amber-950 font-medium">
                👉 <strong>Solución:</strong> Ve a la terminal/consola donde está corriendo el backend, presiona{" "}
                <kbd className="px-1.5 py-0.5 bg-white border border-amber-300 rounded shadow-xs font-mono">
                  Ctrl + C
                </kbd>{" "}
                para detenerlo y vuelve a iniciar con{" "}
                <kbd className="px-1.5 py-0.5 bg-white border border-amber-300 rounded shadow-xs font-mono">
                  node server.js
                </kbd>
                .
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="mt-2 h-7 text-xs bg-white border-amber-300 hover:bg-amber-100 text-amber-900"
              >
                Reintentar conexión
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4 bg-card border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Activas Total</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold mt-2 text-foreground">{stats.active}</p>
          <span className="text-[11px] text-muted-foreground">de {stats.total} registradas</span>
        </Card>

        <Card className="p-4 bg-amber-50/50 border-amber-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800">Eléctrica (EL)</span>
            <Zap className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold mt-2 text-amber-900">{stats.el}</p>
          <span className="text-[11px] text-amber-700/80">actividades activas</span>
        </Card>

        <Card className="p-4 bg-purple-50/50 border-purple-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-800">C. Débiles (CD)</span>
            <Radio className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-bold mt-2 text-purple-900">{stats.cd}</p>
          <span className="text-[11px] text-purple-700/80">actividades activas</span>
        </Card>

        <Card className="p-4 bg-blue-50/50 border-blue-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-800">Telecom (TC)</span>
            <Wifi className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold mt-2 text-blue-900">{stats.tc}</p>
          <span className="text-[11px] text-blue-700/80">actividades activas</span>
        </Card>

        <Card className="p-4 bg-slate-50 border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">Inactivas</span>
            <XCircle className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold mt-2 text-slate-700">{stats.inactive}</p>
          <span className="text-[11px] text-slate-500">ocultas en formularios</span>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant={selectedCategory === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory("all")}
              className="text-xs h-8"
            >
              Todas ({activities.length})
            </Button>
            <Button
              variant={selectedCategory === "EL" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory("EL")}
              className="text-xs h-8 gap-1.5"
            >
              <Zap className="w-3 h-3 text-amber-500" />
              EL - Eléctricas
            </Button>
            <Button
              variant={selectedCategory === "CD" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory("CD")}
              className="text-xs h-8 gap-1.5"
            >
              <Radio className="w-3 h-3 text-purple-500" />
              CD - Corrientes Débiles
            </Button>
            <Button
              variant={selectedCategory === "TC" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory("TC")}
              className="text-xs h-8 gap-1.5"
            >
              <Wifi className="w-3 h-3 text-blue-500" />
              TC - Telecomunicaciones
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {/* Status Select */}
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos ({activities.length})</SelectItem>
                <SelectItem value="active">Activas ({stats.active})</SelectItem>
                <SelectItem value="inactive">Inactivas ({stats.inactive})</SelectItem>
              </SelectContent>
            </Select>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar actividad..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Activities Table */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Listado de Actividades ({filteredActivities.length})
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Mostrando {filteredActivities.length} de {activities.length}
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <ListChecks className="w-10 h-10 mx-auto opacity-30" />
              <p className="font-medium text-sm">No se encontraron actividades</p>
              <p className="text-xs">Prueba cambiando los filtros o agregando una nueva.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[110px] text-xs">Categoría</TableHead>
                    <TableHead className="text-xs font-semibold">Nombre de Actividad</TableHead>
                    <TableHead className="w-[140px] text-xs">Uso / Historial</TableHead>
                    <TableHead className="w-[110px] text-xs">Estado</TableHead>
                    <TableHead className="w-[140px] text-right text-xs">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredActivities.map((act) => {
                    const isActive = act.active === 1;
                    const usage = Number(act.usage_count) || 0;

                    return (
                      <TableRow
                        key={act.id}
                        className={!isActive ? "opacity-60 bg-muted/20" : ""}
                      >
                        <TableCell className="py-2.5">
                          {getCategoryBadge(act.category)}
                        </TableCell>
                        <TableCell className="py-2.5 font-medium text-sm text-foreground">
                          {act.name}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {usage > 0 ? (
                            <Badge
                              variant="secondary"
                              className="text-[11px] font-normal bg-slate-100 text-slate-700 hover:bg-slate-100"
                            >
                              {usage} {usage === 1 ? "registro" : "registros"}
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/60 italic">
                              0 (sin uso)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {isActive ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[11px] gap-1 py-0.5"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Activa
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-slate-100 text-slate-600 border-slate-300 text-[11px] gap-1 py-0.5"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Inactiva
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="Editar actividad"
                              onClick={() => openEditModal(act)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>

                            {isActive ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                title={
                                  usage === 0
                                    ? "Eliminar actividad definitivamente (0 usos)"
                                    : "Desactivar actividad (resguarda historial)"
                                }
                                onClick={() => setActivityToDelete(act)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50"
                                  title="Reactivar actividad"
                                  onClick={() => reactivateMutation.mutate(act.id)}
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </Button>

                                {usage === 0 ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                                    title="Eliminar definitivamente de la base de datos (0 usos)"
                                    onClick={() => setActivityToDelete(act)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                ) : (
                                  <span
                                    className="inline-flex items-center justify-center h-8 w-8 text-muted-foreground/30 cursor-not-allowed"
                                    title="No se puede eliminar definitivamente porque tiene registros históricos vinculados"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: Crear / Editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingActivity ? "Editar Actividad" : "Nueva Actividad"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editingActivity
                ? "Modifica los datos de la actividad. El nuevo nombre se sincronizará automáticamente en las partidas y reportes históricos existentes."
                : "Agrega una nueva actividad para que los supervisores puedan asignarla en el Plan Maestro."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-2">
            {editingActivity && (
              <div className="p-2.5 rounded-lg bg-blue-50/80 border border-blue-200 text-blue-900 text-[11px] flex items-start gap-2">
                <span className="font-semibold text-blue-700 shrink-0">ℹ️ Nota:</span>
                <span>
                  Al guardar, todas las partidas y reportes anteriores que usaban este nombre se actualizarán en cascada para mantener la coherencia en filtros y estadísticas.
                </span>
              </div>
            )}

            {formError && (
              <div className="flex items-center gap-2 p-3 text-xs rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold">Especialidad / Categoría *</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EL">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      EL — Eléctrica
                    </span>
                  </SelectItem>
                  <SelectItem value="CD">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="w-2 h-2 rounded-full bg-purple-500" />
                      CD — Corrientes Débiles
                    </span>
                  </SelectItem>
                  <SelectItem value="TC">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      TC — Telecomunicaciones
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Nombre de la Actividad *</Label>
              <Input
                placeholder="ej: Montaje de transformador y pruebas"
                value={formName}
                onChange={(e) => {
                  setFormName(e.target.value);
                  if (formError) setFormError("");
                }}
                className="mt-1"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Vista previa:{" "}
                <span className="font-semibold text-foreground">
                  {previewFullName}
                </span>
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Guardando..."
                  : editingActivity
                  ? "Guardar Cambios"
                  : "Crear Actividad"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog: Eliminación Inteligente */}
      <Dialog
        open={Boolean(activityToDelete)}
        onOpenChange={(open) => !open && setActivityToDelete(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activityToDelete?.usage_count === 0 ? (
                <>
                  <Trash2 className="w-5 h-5 text-rose-600" />
                  <span>¿Eliminar actividad definitivamente?</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <span>¿Desactivar actividad?</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs pt-2 space-y-2">
              {activityToDelete?.usage_count === 0 ? (
                <>
                  <p>
                    La actividad{" "}
                    <strong className="text-foreground">
                      "{activityToDelete?.name}"
                    </strong>{" "}
                    no tiene registros asociados (0 partidas y 0 reportes diarios vinculados).
                  </p>
                  <p className="text-rose-600 font-medium bg-rose-50 p-2.5 rounded border border-rose-200">
                    Se eliminará permanentemente de la base de datos sin dejar residuos.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    La actividad{" "}
                    <strong className="text-foreground">
                      "{activityToDelete?.name}"
                    </strong>{" "}
                    está vinculada a{" "}
                    <strong>
                      {activityToDelete?.usage_count} registro(s) históricos
                    </strong>{" "}
                    (partidas del Plan Maestro o reportes diarios).
                  </p>
                  <p className="text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200">
                    Para proteger la consistencia de los reportes y estadísticas, la actividad no se borrará físicamente, sino que pasará a estado <strong>inactivo</strong>. Dejará de figurar en los selectores de nuevas partidas pero conservará su historial intacto.
                  </p>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActivityToDelete(null)}
            >
              Cancelar
            </Button>
            <Button
              variant={activityToDelete?.usage_count === 0 ? "destructive" : "default"}
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!activityToDelete) return;
                deleteMutation.mutate({
                  id: activityToDelete.id,
                  permanent: activityToDelete.usage_count === 0,
                });
              }}
            >
              {deleteMutation.isPending
                ? "Procesando..."
                : activityToDelete?.usage_count === 0
                ? "Eliminar Definitivamente"
                : "Desactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
