import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/lib/PermissionsContext";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { AlertTriangle, Trash2, ChevronLeft, ChevronRight, Layers, SlidersHorizontal, ArrowUpDown, Car, Trees, Zap, Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const GENERATOR_FLOORS = [
  "Cubierta",
  ...Array.from({ length: 30 }, (_, i) => `Piso ${30 - i}`),
  ...Array.from({ length: 5 }, (_, i) => `Subterráneo ${i + 1}`)
];

const DEFAULT_SUBTERRANEOS = [
  "Subterráneo -1 (Estacionamientos)",
  "Subterráneo -2 (Estacionamientos)",
  "Subterráneo -2 (Bodegas)",
  "Subterráneo -3 (Estacionamientos)",
  "Subterráneo -4",
  "Subterráneo -5",
];

const DEFAULT_EXTERIORES = [
  "Canalización de Empalme",
  "Alumbrado Perimetral Exterior",
  "Cámaras de Paso Eléctricas",
  "Canalización Subterránea Exterior",
  "Cámaras Corrientes Débiles / CCTV",
  "Postes y Focos Exteriores",
];

const DEFAULT_AREAS_COMUNES = [
  "Sala Eléctrica Principal (TGBT)",
  "Sala de Bombas",
  "Sala de Grupo Electrógeno",
  "Hall de Acceso Principal",
  "Conserjería",
  "Sala de Basuras / Reciclaje",
  "Sala de Medidores",
  "Gimnasio / Quincho",
];

function getDepartmentsForFloor(floorName) {
  const match = floorName.match(/Piso\s+(\d+)/i);
  if (!match) return [];
  const floorNum = parseInt(match[1], 10);
  return Array.from({ length: 30 }, (_, i) => {
    const depNum = i + 1;
    const formattedDep = depNum < 10 ? `0${depNum}` : `${depNum}`;
    return `${floorNum}${formattedDep}`;
  });
}

function safeParseJson(value, fallback) {
  try {
    if (!value) return fallback;
    if (typeof value === "string") {
      return JSON.parse(value);
    }
    return value;
  } catch {
    return fallback;
  }
}

const INITIAL_FORM = {
  name: "",
  address: "",
  client: "",
  supervisor: "",
  capataz: "",
  description: "",
  status: "activa",
  start_date: "",
  end_date: "",
  tower_count: "1",
};

function normalizeProjectName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export default function ProjectForm({ open, onClose, onSave, onDelete, editProject = null }) {
  const { canCreateProjects } = usePermissions();
  const isEditing = Boolean(editProject);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects"),
  });

  const { data: supervisors = [] } = useQuery({
    queryKey: ["users-supervisors-admins"],
    queryFn: () => api.get("/users/list?roles=supervisor,admin"),
    enabled: open,
  });

  const { data: capataces = [] } = useQuery({
    queryKey: ["users-viewers"],
    queryFn: () => api.get("/users/list?role=viewer"),
    enabled: open,
  });

  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Wizard specific states
  const [step, setStep] = useState(1);
  const [step2Tab, setStep2Tab] = useState("torres"); // 'torres' | 'subterraneos' | 'exteriores' | 'comunes'
  const [selectedFloors, setSelectedFloors] = useState([]);
  const [selectedSubterraneos, setSelectedSubterraneos] = useState([]);
  const [selectedExteriores, setSelectedExteriores] = useState([]);
  const [selectedAreasComunes, setSelectedAreasComunes] = useState([]);
  const [customSubterraneo, setCustomSubterraneo] = useState("");
  const [customExterior, setCustomExterior] = useState("");
  const [customAreaComun, setCustomAreaComun] = useState("");
  const [activeConfigFloor, setActiveConfigFloor] = useState(null);
  const [departmentsByFloor, setDepartmentsByFloor] = useState({});
  const [verticalCountEL, setVerticalCountEL] = useState(0);
  const [verticalCountTC, setVerticalCountTC] = useState(0);
  const [verticalCountCD, setVerticalCountCD] = useState(0);
  const [verticalError, setVerticalError] = useState(false);

  const handleVerticalCountChange = (val, setter) => {
    if (val.length > 0) {
      const lastChar = val[val.length - 1];
      if (!["0", "1", "2", "3"].includes(lastChar)) {
        setVerticalError(true);
        setTimeout(() => setVerticalError(false), 2000);
      }
    }
    const cleaned = val.replace(/[^0-3]/g, "");
    const singleChar = cleaned.length > 0 ? cleaned[cleaned.length - 1] : "0";
    setter(parseInt(singleChar, 10) || 0);
  };

  const toggleSubterraneo = (item) => {
    setSelectedSubterraneos(prev =>
      prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]
    );
  };
  const addCustomSubterraneo = () => {
    const val = customSubterraneo.trim();
    if (val && !selectedSubterraneos.includes(val)) {
      setSelectedSubterraneos(prev => [...prev, val]);
      setCustomSubterraneo("");
    }
  };

  const toggleExterior = (item) => {
    setSelectedExteriores(prev =>
      prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]
    );
  };
  const addCustomExterior = () => {
    const val = customExterior.trim();
    if (val && !selectedExteriores.includes(val)) {
      setSelectedExteriores(prev => [...prev, val]);
      setCustomExterior("");
    }
  };

  const toggleAreaComun = (item) => {
    setSelectedAreasComunes(prev =>
      prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]
    );
  };
  const addCustomAreaComun = () => {
    const val = customAreaComun.trim();
    if (val && !selectedAreasComunes.includes(val)) {
      setSelectedAreasComunes(prev => [...prev, val]);
      setCustomAreaComun("");
    }
  };

  // Reset or pre-populate states
  useEffect(() => {
    if (!open) {
      setError("");
      setSaving(false);
      setForm({ ...INITIAL_FORM });
      return;
    }

    if (editProject) {
      setForm({
        name: editProject.name || "",
        address: editProject.address || editProject.location || "",
        client: editProject.client || "",
        supervisor: editProject.supervisor || "",
        capataz: editProject.capataz || "",
        description: editProject.description || "",
        status: editProject.status || "activa",
        start_date: editProject.start_date || "",
        end_date: editProject.end_date || "",
        tower_count: String(editProject.tower_count || 1),
      });
      setSelectedFloors(safeParseJson(editProject.floors, []));
      setDepartmentsByFloor(safeParseJson(editProject.departments, {}));
      setSelectedSubterraneos(safeParseJson(editProject.subterraneos, []));
      setSelectedExteriores(safeParseJson(editProject.exteriores, []));
      setSelectedAreasComunes(safeParseJson(editProject.areas_comunes, []));
      setVerticalCountEL(Number(editProject.vertical_el_count || 0));
      setVerticalCountTC(Number(editProject.vertical_tc_count || 0));
      setVerticalCountCD(Number(editProject.vertical_cd_count || 0));
      setStep(1);
      setStep2Tab("torres");
    } else {
      setForm({ ...INITIAL_FORM });
      setStep(1);
      setStep2Tab("torres");
      setSelectedFloors([]);
      setSelectedSubterraneos([]);
      setSelectedExteriores([]);
      setSelectedAreasComunes([]);
      setCustomSubterraneo("");
      setCustomExterior("");
      setCustomAreaComun("");
      setActiveConfigFloor(null);
      setDepartmentsByFloor({});
      setVerticalCountEL(0);
      setVerticalCountTC(0);
      setVerticalCountCD(0);
    }
  }, [open, editProject]);

  const updateFormField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
  };

  const handleClose = () => {
    if (saving) return;
    setForm({ ...INITIAL_FORM });
    setError("");
    onClose();
  };

  const handleNextStep = () => {
    if (step === 1) {
      // Validate Step 1
      const name = form.name.trim();
      const requiredFields = [
        ["address", "La ubicación es obligatoria."],
        ["client", "El cliente es obligatorio."],
        ["supervisor", "Debe seleccionar un supervisor."],
        ["capataz", "Debe seleccionar un capataz."],
        ["start_date", "La fecha de inicio es obligatoria."],
        ["end_date", "La fecha de término es obligatoria."],
        ["description", "La descripción es obligatoria."],
        ["tower_count", "La cantidad de torres es obligatoria."],
      ];

      if (!name) {
        setError("El nombre de la obra es obligatorio.");
        return;
      }

      const duplicateProject = projects.find(
        (project) =>
          normalizeProjectName(project.name) === normalizeProjectName(name) &&
          Number(project.id) !== Number(editProject?.id)
      );

      if (duplicateProject) {
        setError(`Ya existe una obra con el nombre "${duplicateProject.name}".`);
        return;
      }

      const missingField = requiredFields.find(([field]) => !String(form[field] || "").trim());
      if (missingField) {
        setError(missingField[1]);
        return;
      }

      const tCount = Number(form.tower_count);
      if (!Number.isInteger(tCount) || tCount < 1 || tCount > 10) {
        setError("La cantidad de torres debe ser un número entre 1 y 10.");
        return;
      }
    }

    if (step === 2) {
      if (selectedFloors.length === 0) {
        setError("Debe seleccionar al menos un piso.");
        return;
      }
    }

    setError("");
    setStep((prev) => prev + 1);
  };

  const handlePrevStep = () => {
    setError("");
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const towerCount = Number(form.tower_count);
    const projectAddress = form.address.trim();

    try {
      setSaving(true);
      setError("");

      const payload = {
        ...form,
        name,
        address: projectAddress,
        client: form.client.trim(),
        supervisor: form.supervisor,
        capataz: form.capataz,
        description: form.description.trim(),
        status: form.status || "activa",
        tower_count: towerCount,
        floors: selectedFloors,
        departments: departmentsByFloor,
        subterraneos: selectedSubterraneos,
        exteriores: selectedExteriores,
        areas_comunes: selectedAreasComunes,
        vertical_el_count: verticalCountEL,
        vertical_tc_count: verticalCountTC,
        vertical_cd_count: verticalCountCD,
      };

      // Create/Update Project in database
      await onSave(payload);

      setForm({ ...INITIAL_FORM });
      onClose();
    } catch (error) {
      console.error("Error al guardar obra y estructurar:", error);
      setError(error?.message || "No se pudo guardar la obra.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editProject || !onDelete) return;

    const confirmed = window.confirm(
      `¿Eliminar la obra "${editProject.name}"?\nEsta acción también eliminará sus ítems, reportes diarios y fotos.`,
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");
      await onDelete(editProject);
      setForm({ ...INITIAL_FORM });
      onClose();
    } catch (error) {
      console.error("Error al eliminar obra:", error);
      setError(error?.message || "No se pudo eliminar la obra.");
    } finally {
      setSaving(false);
    }
  };

  if (!canCreateProjects) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Permiso Insuficiente
            </DialogTitle>
          </DialogHeader>
          <div>
            <p className="text-sm text-muted-foreground">
              Solo administradores pueden crear nuevas obras.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(
        "max-h-[90vh] overflow-y-auto transition-all duration-300",
        step === 2 ? "sm:max-w-3xl" : "sm:max-w-lg"
      )}>
        <DialogHeader>
          <DialogTitle className="flex justify-between items-center pr-6">
            <span>{isEditing ? "Editar Obra" : "Nueva Obra"}</span>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 border px-2 py-0.5 rounded-full">
              Paso {step} de 3
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Step Indicators for Wizard */}
        <div className="flex items-center gap-1.5 border-b pb-3.5 mb-2">
          {[
            { num: 1, label: "General" },
            { num: 2, label: "Estructura & Zonas" },
            { num: 3, label: "Verticales" }
          ].map((s) => (
            <div key={s.num} className="flex-1 flex items-center gap-1.5">
              <span className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors",
                step >= s.num 
                  ? "bg-primary border-primary text-primary-foreground" 
                  : "bg-white border-slate-200 text-slate-400"
              )}>
                {s.num}
              </span>
              <span className={cn(
                "text-[10px] font-extrabold hidden sm:inline",
                step >= s.num ? "text-slate-800" : "text-slate-400"
              )}>
                {s.label}
              </span>
              {s.num < 3 && <div className={cn("flex-1 h-[1px] bg-slate-200", step > s.num && "bg-primary")} />}
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* STEP 1: GENERAL INFO */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Nombre de la Obra *</Label>
                <AutocompleteInput
                  value={form.name}
                  onChange={(e) => updateFormField("name", e.target.value)}
                  options={projects.map((p) => p.name)}
                  placeholder="Ej: Edificio Centro"
                  disabled={isEditing}
                />
              </div>

              <div>
                <Label className="text-xs">Ubicación *</Label>
                <Input
                  value={form.address}
                  onChange={(e) => updateFormField("address", e.target.value)}
                  placeholder="Ej: Santiago Centro"
                />
              </div>

              <div>
                <Label className="text-xs">Cliente *</Label>
                <Input
                  value={form.client}
                  onChange={(e) => updateFormField("client", e.target.value)}
                  placeholder="Ej: Constructora Demo"
                />
              </div>

              <div>
                <Label className="text-xs">Cantidad de torres *</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  value={form.tower_count}
                  onChange={(e) => updateFormField("tower_count", e.target.value)}
                  placeholder="1 a 10"
                  disabled={isEditing}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Supervisor *</Label>
                  <Select
                    value={form.supervisor}
                    onValueChange={(v) => updateFormField("supervisor", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar supervisor" />
                    </SelectTrigger>
                    <SelectContent>
                      {supervisors.length === 0 ? (
                        <SelectItem value="__none_s__" disabled>
                          Sin supervisores registrados
                        </SelectItem>
                      ) : (
                        supervisors.map((u) => (
                          <SelectItem key={u.id} value={u.full_name}>
                            <div className="flex items-center gap-2">
                              <span>{u.full_name}</span>
                              {u.role === "admin" && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  Admin
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Capataz *</Label>
                  <Select
                    value={form.capataz}
                    onValueChange={(v) => updateFormField("capataz", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar capataz" />
                    </SelectTrigger>
                    <SelectContent>
                      {capataces.length === 0 ? (
                        <SelectItem value="__none_c__" disabled>
                          Sin capataces registrados
                        </SelectItem>
                      ) : (
                        capataces.map((u) => (
                          <SelectItem key={u.id} value={u.full_name}>
                            {u.full_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Fecha Inicio *</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => updateFormField("start_date", e.target.value)}
                  />
                </div>

                <div>
                  <Label className="text-xs">Fecha Término *</Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => updateFormField("end_date", e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Descripción *</Label>
                <Input
                  value={form.description}
                  onChange={(e) => updateFormField("description", e.target.value)}
                  placeholder="Descripción breve de la obra"
                />
              </div>
            </div>
          )}

          {/* STEP 2: BUILDINGS STRUCTURE & MACRO-ZONES */}
          {step === 2 && (
            <div className="space-y-3">
              {/* Tab Navigation for Step 2 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setStep2Tab("torres")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                    step2Tab === "torres"
                      ? "bg-white text-primary shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Layers className="h-3.5 w-3.5 text-orange-500" />
                  <span>Torre ({selectedFloors.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep2Tab("subterraneos")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                    step2Tab === "subterraneos"
                      ? "bg-white text-primary shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Car className="h-3.5 w-3.5 text-blue-500" />
                  <span>Subterr. ({selectedSubterraneos.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep2Tab("exteriores")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                    step2Tab === "exteriores"
                      ? "bg-white text-primary shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Trees className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Exteriores ({selectedExteriores.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep2Tab("comunes")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                    step2Tab === "comunes"
                      ? "bg-white text-primary shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  <span>Salas Téc. ({selectedAreasComunes.length})</span>
                </button>
              </div>

              {/* Subtab 1: Torres y Pisos */}
              {step2Tab === "torres" && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground font-medium">
                    Selecciona los pisos de la torre y define qué departamentos existen en cada nivel.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    {/* Left side: floors selection */}
                    <div className="md:col-span-5 space-y-2">
                      <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <Layers className="h-4 w-4 text-orange-500" />
                        1. Selección de Pisos ({selectedFloors.length})
                      </Label>
                      <div className="border rounded-xl p-3 h-72 overflow-y-auto space-y-1 bg-white scrollbar-thin">
                        {GENERATOR_FLOORS.map((floor) => {
                          const isSelected = selectedFloors.includes(floor);
                          return (
                            <div
                              key={floor}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedFloors(prev => prev.filter(f => f !== floor));
                                  if (activeConfigFloor === floor) setActiveConfigFloor(null);
                                } else {
                                  setSelectedFloors(prev => [...prev, floor]);
                                  setActiveConfigFloor(floor);
                                }
                              }}
                              className={cn(
                                "flex items-center gap-2 text-xs font-bold cursor-pointer py-1.5 px-2.5 rounded-lg border transition-all mb-1",
                                isSelected 
                                  ? "bg-primary/5 border-primary text-primary" 
                                  : "border-slate-100 hover:bg-slate-50 text-slate-700"
                              )}
                            >
                              <div className={cn(
                                "h-3.5 w-3.5 border rounded-md flex items-center justify-center transition-colors shrink-0",
                                isSelected ? "bg-primary border-primary text-white" : "border-slate-300"
                              )}>
                                {isSelected && <span className="text-[10px]">✓</span>}
                              </div>
                              <span>{floor}</span>
                              {isSelected && getDepartmentsForFloor(floor).length > 0 && (
                                <span className="ml-auto text-[9.5px] px-1.5 bg-primary/10 border border-primary/20 text-primary rounded-full">
                                  {(departmentsByFloor[floor] || []).length} deptos
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right side: departments configuration */}
                    <div className="md:col-span-7 space-y-2">
                      <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <SlidersHorizontal className="h-4 w-4 text-orange-500" />
                        2. Departamentos del Piso seleccionado
                      </Label>

                      {activeConfigFloor ? (
                        (() => {
                          const floorDeps = getDepartmentsForFloor(activeConfigFloor);
                          const selectedDeps = departmentsByFloor[activeConfigFloor] || [];
                          const isFloorDeptoAdmissible = floorDeps.length > 0;

                          return (
                            <div className="border rounded-xl p-4 bg-slate-50/50 space-y-3.5 h-72 flex flex-col justify-between overflow-hidden">
                              <div className="flex items-center justify-between border-b pb-2 shrink-0">
                                <span className="text-xs font-bold text-slate-800">
                                  Configurar: <span className="text-primary font-extrabold">{activeConfigFloor}</span>
                                </span>
                                {isFloorDeptoAdmissible && (
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-[10px] font-bold px-2 bg-white border"
                                      onClick={() => {
                                        setDepartmentsByFloor(prev => ({ ...prev, [activeConfigFloor]: [...floorDeps] }));
                                      }}
                                    >
                                      Todos
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-[10px] font-bold px-2 bg-white border text-muted-foreground"
                                      onClick={() => {
                                        setDepartmentsByFloor(prev => ({ ...prev, [activeConfigFloor]: [] }));
                                      }}
                                    >
                                      Limpiar
                                    </Button>
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
                                {isFloorDeptoAdmissible ? (
                                  <div className="grid grid-cols-4 gap-1.5">
                                    {floorDeps.map((dep) => {
                                      const isChecked = selectedDeps.includes(dep);
                                      return (
                                        <label
                                          key={dep}
                                          className={cn(
                                            "flex items-center justify-center p-2 rounded-lg border text-[11px] font-bold cursor-pointer transition-all h-8",
                                            isChecked 
                                              ? "bg-primary border-primary text-primary-foreground shadow-sm"
                                              : "bg-white border-slate-200 text-slate-650 hover:bg-slate-50"
                                          )}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => {
                                              setDepartmentsByFloor(prev => {
                                                const current = prev[activeConfigFloor] || [];
                                                const updated = e.target.checked
                                                  ? [...current, dep]
                                                  : current.filter(d => d !== dep);
                                                return { ...prev, [activeConfigFloor]: updated };
                                              });
                                            }}
                                            className="hidden"
                                          />
                                          <span>{dep}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 gap-2">
                                    <Layers className="h-8 w-8 text-slate-300" />
                                    <p className="text-xs font-semibold text-slate-500">
                                      Este nivel no admite departamentos estándar
                                    </p>
                                    <p className="text-[10px] text-slate-400 max-w-[200px] leading-relaxed">
                                      Niveles como Cubierta se configuran con actividades globales.
                                    </p>
                                  </div>
                                )}
                              </div>

                              {isFloorDeptoAdmissible && (
                                <div className="text-[10px] text-muted-foreground border-t pt-2 shrink-0 flex justify-between font-bold">
                                  <span>Total seleccionado:</span>
                                  <span className="text-primary font-extrabold">{selectedDeps.length} deptos</span>
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        <div className="border border-dashed rounded-xl h-72 flex flex-col items-center justify-center text-center p-6 text-slate-400 bg-slate-50/20 gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                            <Layers className="h-5 w-5 text-slate-350" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-600">Selecciona un piso a la izquierda</p>
                            <p className="text-[10.5px] text-slate-400 mt-1 max-w-[220px] mx-auto leading-relaxed">
                              Haz clic en cualquier piso marcado para configurar su grilla de departamentos específicos.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Subtab 2: Subterráneos */}
              {step2Tab === "subterraneos" && (
                <div className="space-y-3.5">
                  <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl">
                    <p className="text-xs font-bold text-blue-900">
                      Niveles Subterráneos y Estacionamientos
                    </p>
                    <p className="text-[11px] text-blue-700 mt-0.5">
                      Permite al capataz registrar avances en bandejas de corrientes débiles, tableros de bombas y tuberías de iluminación vehicular.
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      Sugerencias frecuentes (haz clic para añadir o quitar):
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {DEFAULT_SUBTERRANEOS.map((sub) => {
                        const isSelected = selectedSubterraneos.includes(sub);
                        return (
                          <button
                            key={sub}
                            type="button"
                            onClick={() => toggleSubterraneo(sub)}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5",
                              isSelected
                                ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            )}
                          >
                            <span>{isSelected ? "✓" : "+"}</span>
                            <span>{sub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2 border-t">
                    <Label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      Agregar nivel o sector subterráneo adicional:
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={customSubterraneo}
                        onChange={(e) => setCustomSubterraneo(e.target.value)}
                        placeholder="Ej: Subterráneo -3 Sector Poniente"
                        className="text-xs"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomSubterraneo();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        onClick={addCustomSubterraneo}
                        size="sm"
                        className="shrink-0 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Agregar
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs font-bold text-slate-700">
                        Subterráneos habilitados ({selectedSubterraneos.length}):
                      </Label>
                      {selectedSubterraneos.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedSubterraneos([])}
                          className="h-6 text-[11px] text-muted-foreground hover:text-red-600"
                        >
                          Limpiar
                        </Button>
                      )}
                    </div>

                    {selectedSubterraneos.length === 0 ? (
                      <div className="border border-dashed rounded-xl p-4 text-center text-xs text-muted-foreground bg-slate-50">
                        No hay niveles subterráneos seleccionados (opcional para obras en superficie).
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2.5 border rounded-xl bg-slate-50/50">
                        {selectedSubterraneos.map((item) => (
                          <span
                            key={item}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-800 shadow-xs"
                          >
                            <span>{item}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedSubterraneos(prev => prev.filter(x => x !== item))}
                              className="text-slate-400 hover:text-red-500 rounded-full"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Subtab 3: Exteriores */}
              {step2Tab === "exteriores" && (
                <div className="space-y-3.5">
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl">
                    <p className="text-xs font-bold text-emerald-900">
                      Exteriores y Urbanización
                    </p>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      Crucial para reportar canalizaciones de empalme, cámaras subterráneas y alumbrado exterior donde la constructora frecuentemente bloquea el paso por movimientos de tierra.
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      Sugerencias frecuentes:
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {DEFAULT_EXTERIORES.map((ext) => {
                        const isSelected = selectedExteriores.includes(ext);
                        return (
                          <button
                            key={ext}
                            type="button"
                            onClick={() => toggleExterior(ext)}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5",
                              isSelected
                                ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            )}
                          >
                            <span>{isSelected ? "✓" : "+"}</span>
                            <span>{ext}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2 border-t">
                    <Label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      Agregar frente o sector exterior:
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={customExterior}
                        onChange={(e) => setCustomExterior(e.target.value)}
                        placeholder="Ej: Luminarias Jardín Central / Caseta Guardia"
                        className="text-xs"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomExterior();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        onClick={addCustomExterior}
                        size="sm"
                        className="shrink-0 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Agregar
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs font-bold text-slate-700">
                        Frentes exteriores configurados ({selectedExteriores.length}):
                      </Label>
                      {selectedExteriores.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedExteriores([])}
                          className="h-6 text-[11px] text-muted-foreground hover:text-red-600"
                        >
                          Limpiar
                        </Button>
                      )}
                    </div>

                    {selectedExteriores.length === 0 ? (
                      <div className="border border-dashed rounded-xl p-4 text-center text-xs text-muted-foreground bg-slate-50">
                        No hay zonas exteriores seleccionadas (opcional).
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2.5 border rounded-xl bg-slate-50/50">
                        {selectedExteriores.map((item) => (
                          <span
                            key={item}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-800 shadow-xs"
                          >
                            <span>{item}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedExteriores(prev => prev.filter(x => x !== item))}
                              className="text-slate-400 hover:text-red-500 rounded-full"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Subtab 4: Salas Técnicas y Comunes */}
              {step2Tab === "comunes" && (
                <div className="space-y-3.5">
                  <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl">
                    <p className="text-xs font-bold text-amber-900">
                      Salas Técnicas y Áreas Comunes
                    </p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Recintos neurálgicos donde se montan tableros TGBT, grupos electrógenos y medidores. Es vital documentar atrasos si la obra civil de la sala no está entregada.
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      Sugerencias frecuentes:
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {DEFAULT_AREAS_COMUNES.map((com) => {
                        const isSelected = selectedAreasComunes.includes(com);
                        return (
                          <button
                            key={com}
                            type="button"
                            onClick={() => toggleAreaComun(com)}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5",
                              isSelected
                                ? "bg-amber-600 border-amber-600 text-white shadow-xs"
                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            )}
                          >
                            <span>{isSelected ? "✓" : "+"}</span>
                            <span>{com}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2 border-t">
                    <Label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      Agregar sala técnica o recinto común:
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={customAreaComun}
                        onChange={(e) => setCustomAreaComun(e.target.value)}
                        placeholder="Ej: Sala de Transformadores / Subestación"
                        className="text-xs"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomAreaComun();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        onClick={addCustomAreaComun}
                        size="sm"
                        className="shrink-0 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Agregar
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs font-bold text-slate-700">
                        Salas técnicas configuradas ({selectedAreasComunes.length}):
                      </Label>
                      {selectedAreasComunes.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedAreasComunes([])}
                          className="h-6 text-[11px] text-muted-foreground hover:text-red-600"
                        >
                          Limpiar
                        </Button>
                      )}
                    </div>

                    {selectedAreasComunes.length === 0 ? (
                      <div className="border border-dashed rounded-xl p-4 text-center text-xs text-muted-foreground bg-slate-50">
                        No hay salas técnicas seleccionadas aún.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2.5 border rounded-xl bg-slate-50/50">
                        {selectedAreasComunes.map((item) => (
                          <span
                            key={item}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-800 shadow-xs"
                          >
                            <span>{item}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedAreasComunes(prev => prev.filter(x => x !== item))}
                              className="text-slate-400 hover:text-red-500 rounded-full"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 max-w-sm mx-auto py-4">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <ArrowUpDown className="h-4 w-4 text-orange-500" />
                  Cantidad de Riser / Columnas Verticales
                </Label>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Ingresa cuántas bajadas o subidas de ductos independientes tiene el edificio por especialidad.
                </p>
                <p className={cn(
                  "text-[10px] font-bold mt-1.5 transition-all duration-300 p-2 rounded-lg border",
                  verticalError
                    ? "text-red-700 bg-red-50 border-red-200 animate-bounce"
                    : "text-orange-700 bg-orange-50 border-orange-100"
                )}>
                  * Advertencia: Solo se permite seleccionar de 0 a 3 verticales por especialidad. Si presionas una tecla inválida, se ignorará.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between gap-4 border p-3 rounded-xl bg-white shadow-sm">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-800">Verticales Eléctricas</span>
                    <p className="text-[10px] text-slate-400">Canalización alimentadores, bandejas EL</p>
                  </div>
                  <Input
                    type="text"
                    value={String(verticalCountEL)}
                    onChange={(e) => handleVerticalCountChange(e.target.value, setVerticalCountEL)}
                    className={cn(
                      "w-20 text-center font-bold text-xs h-9",
                      verticalError && "border-red-500 ring-2 ring-red-200"
                    )}
                  />
                </div>

                <div className="flex items-center justify-between gap-4 border p-3 rounded-xl bg-white shadow-sm">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-800">Verticales Telecomunicaciones</span>
                    <p className="text-[10px] text-slate-400">Coaxial, fibra óptica, risers TC</p>
                  </div>
                  <Input
                    type="text"
                    value={String(verticalCountTC)}
                    onChange={(e) => handleVerticalCountChange(e.target.value, setVerticalCountTC)}
                    className={cn(
                      "w-20 text-center font-bold text-xs h-9",
                      verticalError && "border-red-500 ring-2 ring-red-200"
                    )}
                  />
                </div>

                <div className="flex items-center justify-between gap-4 border p-3 rounded-xl bg-white shadow-sm">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-800">Verticales Corrientes Débiles</span>
                    <p className="text-[10px] text-slate-400">CCDD, CCTV, control de accesos, citofonía</p>
                  </div>
                  <Input
                    type="text"
                    value={String(verticalCountCD)}
                    onChange={(e) => handleVerticalCountChange(e.target.value, setVerticalCountCD)}
                    className={cn(
                      "w-20 text-center font-bold text-xs h-9",
                      verticalError && "border-red-500 ring-2 ring-red-200"
                    )}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row mt-4">
          {/* Left aligned Delete button in edit mode */}
          {isEditing && onDelete && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
              className="gap-2 sm:mr-auto"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          )}

          {/* Close/Cancel */}
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>

          {/* Step Back (Wizard) */}
          {step > 1 && (
            <Button type="button" variant="outline" onClick={handlePrevStep} disabled={saving}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Atrás
            </Button>
          )}

          {/* Step Next (Wizard) */}
          {step < 3 && (
            <Button type="button" onClick={handleNextStep}>
              Siguiente
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}

          {/* Save (Project) */}
          {step === 3 && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : isEditing ? "Guardar Cambios" : "Crear Obra"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}