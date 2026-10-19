import React, { useState } from "react";
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
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Shield,
  Plus,
  Trash2,
  Pencil,
  AlertCircle,
  Eye,
  EyeOff,
  AlertTriangle,
  Users as UsersIcon,
  Radio,
  Wifi,
  FileText,
  Mail,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/lib/PermissionsContext";
import { useProjectFilter } from "@/lib/ProjectFilterContext";
import { Navigate } from "react-router-dom";
import { api } from "@/lib/api";
import FilterPill from "@/components/common/FilterPill";
import { useMemo } from "react";
import { exportUsersPDF } from "@/utils/exportUsersPDF";
import ReminderEmailModal from "@/components/users/ReminderEmailModal";

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "supervisor", label: "Supervisor" },
  { value: "viewer", label: "Capataz" },
];

const CONNECTION_OPTIONS = [
  { value: "all", label: "Todas las conexiones" },
  { value: "online", label: "🟢 En línea" },
  { value: "offline", label: "⚪ Desconectados" },
];

const roleBadgeClass = {
  admin: "bg-emerald-100 text-emerald-700 border-emerald-200",
  supervisor: "bg-amber-100 text-amber-700 border-amber-200",
  viewer: "bg-blue-100 text-blue-700 border-blue-200",
};

const ONLINE_THRESHOLD_MS = 2.5 * 60 * 1000; // 2.5 minutos

function isUserOnline(lastSeen) {
  if (!lastSeen) return false;
  const time = new Date(lastSeen).getTime();
  if (isNaN(time)) return false;
  return Math.abs(Date.now() - time) < ONLINE_THRESHOLD_MS;
}

function formatLastSeen(lastSeen) {
  if (!lastSeen) return "Sin registro";
  const date = new Date(lastSeen);
  if (isNaN(date.getTime())) return "Sin registro";

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 2) return "En línea ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHours < 24) return `Hace ${diffHours} h`;
  if (diffDays === 1) return `Ayer a las ${date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

const emptyForm = {
  email: "",
  password: "",
  full_name: "",
  role: "viewer",
  allowed_projects: [],
};

function parseAllowedProjects(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

export default function Users() {
  const { isAdmin } = usePermissions();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showRemindersModal, setShowRemindersModal] = useState(false);

  const { selectedProject, setSelectedProject } = useProjectFilter();
  const [selectedRole, setSelectedRole] = useState("all");
  const [selectedConnection, setSelectedConnection] = useState("all");
  const [selectedActivity, setSelectedActivity] = useState("all");

  if (!isAdmin) return <Navigate to="/" replace />;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/users"),
    refetchInterval: 15000,
  });

  const onlineUsersCount = useMemo(() => {
    return users.filter((u) => isUserOnline(u.last_seen)).length;
  }, [users]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects"),
  });

  const { data: masterItems = [] } = useQuery({
    queryKey: ["masterItems"],
    queryFn: () => api.get("/master-items"),
  });

  const uniqueActivities = useMemo(() => {
    return [
      ...new Set(masterItems.map((item) => item.activity).filter(Boolean)),
    ];
  }, [masterItems]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Role filter
      if (selectedRole !== "all" && u.role !== selectedRole) return false;

      // Connection filter
      if (selectedConnection === "online" && !isUserOnline(u.last_seen))
        return false;
      if (selectedConnection === "offline" && isUserOnline(u.last_seen))
        return false;

      const allowed = parseAllowedProjects(u.allowed_projects);

      // Project filter
      if (selectedProject && selectedProject !== "all") {
        if (u.role !== "admin" && !allowed.includes(selectedProject))
          return false;
      }

      // Activity filter
      if (selectedActivity !== "all") {
        const projectsWithActivity = new Set(
          masterItems
            .filter((item) => item.activity === selectedActivity)
            .map((item) => item.project),
        );
        if (u.role === "admin") {
          if (!projectsWithActivity.size) return false;
        } else {
          const hasProjectWithActivity = allowed.some((proj) =>
            projectsWithActivity.has(proj),
          );
          if (!hasProjectWithActivity) return false;
        }
      }

      return true;
    });
  }, [users, selectedRole, selectedConnection, selectedProject, selectedActivity, masterItems]);

  const createUser = useMutation({
    mutationFn: (data) => api.post("/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowForm(false);
      setForm(emptyForm);
      setFormError("");
    },
    onError: (err) => setFormError(err.message || "Error al crear usuario."),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }) => api.put(`/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowForm(false);
      setEditUser(null);
      setForm(emptyForm);
      setFormError("");
    },
    onError: (err) =>
      setFormError(err.message || "Error al actualizar usuario."),
  });

  const deleteUser = useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
    onError: (err) => alert(err.message || "Error al eliminar usuario."),
  });

  const handleOpenCreate = () => {
    setEditUser(null);
    setForm(emptyForm);
    setFormError("");
    setShowPassword(false);
    setShowForm(true);
  };

  const handleOpenEdit = (u) => {
    setEditUser(u);
    setForm({
      email: u.email || "",
      password: "",
      full_name: u.full_name || "",
      role: u.role || "viewer",
      allowed_projects: parseAllowedProjects(u.allowed_projects),
    });
    setFormError("");
    setShowPassword(false);
    setShowForm(true);
  };

  const handleSave = () => {
    const payload = {
      email: form.email,
      full_name: form.full_name,
      role: form.role,
      allowed_projects:
        form.role === "admin"
          ? []
          : Array.isArray(form.allowed_projects)
            ? form.allowed_projects
            : [],
      ...(form.password ? { password: form.password } : {}),
    };

    if (editUser) {
      updateUser.mutate({ id: editUser.id, data: payload });
    } else {
      createUser.mutate(payload);
    }
  };

  const isPending = createUser.isPending || updateUser.isPending;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Shield className="w-5 h-5 text-accent" />
          Gestión de Usuarios
        </h1>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 border-slate-200 hover:bg-slate-50 shadow-sm"
            onClick={() => exportUsersPDF(filteredUsers)}
            title="Descargar listado de usuarios con estado de conexión y última actividad en PDF"
          >
            <FileText className="w-3.5 h-3.5 text-red-500" />
            Exportar PDF
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 border-amber-300 bg-amber-50/70 hover:bg-amber-100 text-amber-950 shadow-sm font-medium"
            onClick={() => setShowRemindersModal(true)}
            title="Configurar y probar recordatorios automáticos por correo a supervisores y capataces"
          >
            <Mail className="w-3.5 h-3.5 text-amber-600" />
            Recordatorios por Correo
          </Button>

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleOpenCreate}
          >
            <Plus className="w-3 h-3" />
            Agregar Usuario
          </Button>
        </div>
      </div>

      {/* Resumen de Presencia y Usuarios */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border rounded-xl p-3.5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Registrados</p>
            <p className="text-2xl font-bold mt-0.5">{users.length}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <UsersIcon className="w-5 h-5" />
          </div>
        </div>

        <div
          onClick={() =>
            setSelectedConnection((prev) => (prev === "online" ? "all" : "online"))
          }
          className={`border rounded-xl p-3.5 flex items-center justify-between shadow-sm cursor-pointer transition-all ${
            selectedConnection === "online"
              ? "bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20"
              : "bg-card hover:bg-emerald-50/40 hover:border-emerald-300"
          }`}
          title="Haz clic para alternar filtro de usuarios en línea"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <p className="text-xs font-semibold text-emerald-800">Conectados Ahora</p>
            </div>
            <p className="text-2xl font-bold text-emerald-700 mt-0.5">
              {onlineUsersCount}
              <span className="text-xs font-normal text-muted-foreground ml-1.5">
                ({users.length > 0 ? Math.round((onlineUsersCount / users.length) * 100) : 0}%)
              </span>
            </p>
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] ${
              selectedConnection === "online"
                ? "bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold"
                : "text-muted-foreground"
            }`}
          >
            {selectedConnection === "online" ? "Filtro activo" : "Filtrar"}
          </Badge>
        </div>

        <div
          onClick={() =>
            setSelectedConnection((prev) => (prev === "offline" ? "all" : "offline"))
          }
          className={`border rounded-xl p-3.5 flex items-center justify-between shadow-sm cursor-pointer transition-all ${
            selectedConnection === "offline"
              ? "bg-slate-100 border-slate-400 ring-2 ring-slate-500/20"
              : "bg-card hover:bg-muted/30"
          }`}
          title="Haz clic para alternar filtro de usuarios desconectados"
        >
          <div>
            <p className="text-xs text-muted-foreground font-medium">Desconectados</p>
            <p className="text-2xl font-bold text-muted-foreground mt-0.5">
              {Math.max(0, users.length - onlineUsersCount)}
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <Radio className="w-5 h-5 opacity-60" />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <FilterPill
          label="Obra"
          value={selectedProject || "all"}
          options={projects.map((p) => p.name)}
          onChange={(val) => setSelectedProject(val === "all" ? "" : val)}
        />

        <FilterPill
          label="Rol"
          value={selectedRole}
          options={ROLES}
          onChange={setSelectedRole}
        />

        <FilterPill
          label="Conexión"
          value={selectedConnection}
          options={CONNECTION_OPTIONS}
          onChange={setSelectedConnection}
        />
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Usuarios del Sistema
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({filteredUsers.length} de {users.length})
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Nombre</TableHead>
                  <TableHead className="text-xs">Correo</TableHead>
                  <TableHead className="text-xs">Rol</TableHead>
                  <TableHead className="text-xs">Conexión</TableHead>
                  <TableHead className="text-xs">Obras Permitidas</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                  <TableHead className="text-xs text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-sm text-muted-foreground py-12"
                    >
                      Sin usuarios registrados que coincidan con el filtro.
                    </TableCell>
                  </TableRow>
                )}

                {filteredUsers.map((u) => {
                  const allowed = parseAllowedProjects(u.allowed_projects);
                  const online = isUserOnline(u.last_seen);
                  return (
                    <TableRow key={u.id} className="hover:bg-muted/30 text-xs">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{u.full_name || "—"}</span>
                          {online && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              En línea
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.email}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-[10px] border ${roleBadgeClass[u.role] || roleBadgeClass.viewer}`}
                        >
                          {ROLES.find((r) => r.value === u.role)?.label ||
                            u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {online ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            En línea ahora
                          </div>
                        ) : (
                          <div
                            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                            title={
                              u.last_seen
                                ? `Última conexión: ${new Date(u.last_seen).toLocaleString("es-CL")}`
                                : "Sin registro de conexión previa"
                            }
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                            {formatLastSeen(u.last_seen)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-xs">
                        {u.role === "admin" ? (
                          <Badge variant="outline" className="text-xs">
                            Todas las obras
                          </Badge>
                        ) : allowed.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {allowed.slice(0, 3).map((p, i) => (
                              <Badge
                                key={`${p}-${i}`}
                                variant="outline"
                                className="text-xs"
                              >
                                {p}
                              </Badge>
                            ))}
                            {allowed.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{allowed.length - 3}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500 border-slate-200">
                            Sin acceso
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${u.active ? "text-green-600 border-green-200" : "text-gray-400"}`}
                        >
                          {u.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => handleOpenEdit(u)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-600"
                            onClick={() =>
                              window.confirm(`¿Eliminar a ${u.full_name}?`) &&
                              deleteUser.mutate(u.id)
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal crear / editar */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editUser ? "Editar Usuario" : "Agregar Usuario"}
            </DialogTitle>
            <DialogDescription>
              {editUser
                ? "Actualiza los datos, rol y permisos del usuario."
                : "Crea un usuario directamente en la base de datos local."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre completo *</Label>
              <Input
                value={form.full_name}
                onChange={(e) =>
                  setForm({ ...form, full_name: e.target.value })
                }
                placeholder="Ej: Juan Pérez"
              />
            </div>

            <div>
              <Label className="text-xs">Correo electrónico *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="correo@dgc.cl"
                disabled={!!editUser}
              />
            </div>

            <div>
              <Label className="text-xs">
                Contraseña {editUser ? "(dejar vacío para no cambiar)" : "*"}
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder={editUser ? "••••••••" : "Mínimo 6 caracteres"}
                  className="pr-9"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-xs">Rol *</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm({ ...form, role: v, allowed_projects: [] })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {form.role === "viewer" && "Acceso limitado a obras asignadas"}
                {form.role === "supervisor" &&
                  "Acceso a múltiples obras asignadas"}
                {form.role === "admin" && "Acceso completo a todo el sistema"}
              </p>
            </div>

            {form.role !== "admin" && (
              <div>
                <Label className="text-xs">Obras Permitidas (Opcional)</Label>
                <MultiSelect
                  options={projects.map((p) => ({
                    label: p.name,
                    value: p.name,
                  }))}
                  selected={
                    Array.isArray(form.allowed_projects)
                      ? form.allowed_projects
                      : []
                  }
                  onChange={(selected) =>
                    setForm({ ...form, allowed_projects: selected })
                  }
                  placeholder="Seleccionar obras (opcional)"
                />
                {(!Array.isArray(form.allowed_projects) ||
                  form.allowed_projects.length === 0) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    ℹ️ Sin obras asignadas: este usuario quedará con estado <strong>"Sin acceso"</strong> hasta que se le asigne una obra.
                  </p>
                )}
              </div>
            )}

            {formError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700">{formError}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setFormError("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                !form.full_name ||
                !form.email ||
                (!editUser && !form.password) ||
                isPending
              }
            >
              {isPending
                ? "Guardando..."
                : editUser
                  ? "Guardar cambios"
                  : "Crear usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Automatización y Pruebas de Correo para Administradores */}
      <ReminderEmailModal
        open={showRemindersModal}
        onOpenChange={setShowRemindersModal}
        users={users}
        adminCount={users.filter((u) => u.role === "admin").length}
        projects={projects}
      />
    </div>
  );
}
