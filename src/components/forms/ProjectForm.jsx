import React, { useEffect, useState, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/lib/PermissionsContext";
import {
  Building,
  Building2,
  Layers,
  SlidersHorizontal,
  Car,
  Trees,
  Zap,
  Plus,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
  Sparkles,
  Info,
  Calendar,
  UserCheck,
  MapPin,
  FileText,
  Copy,
  CheckCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// Presets para salas técnicas y exteriores
const PRESET_SALAS_TECNICAS = [
  { id: "tgbt", name: "Sala Eléctrica Principal (TGBT)", icon: "⚡", tag: "Eléctrica" },
  { id: "bombas", name: "Sala de Bombas de Agua Potable", icon: "💧", tag: "Sanitaria" },
  { id: "generador", name: "Sala de Grupo Electrógeno", icon: "🔋", tag: "Fuerza" },
  { id: "conserjeria", name: "Hall Principal / Conserjería", icon: "🏢", tag: "Acceso" },
  { id: "medidores", name: "Sala de Medidores Eléctricos", icon: "📦", tag: "Eléctrica" },
  { id: "rack", name: "Sala de RACK / CCTV / Citofonía", icon: "📶", tag: "Comunicaciones" },
  { id: "basuras", name: "Sala de Basuras / Reciclaje", icon: "♻️", tag: "Servicios" },
  { id: "calderas", name: "Sala de Calderas / Termos", icon: "🔥", tag: "Clima" },
];

const PRESET_EXTERIORES = [
  { id: "alumbrado", name: "Alumbrado Perimetral Exterior", icon: "💡" },
  { id: "empalme", name: "Canalización de Empalme Eléctrico", icon: "🔌" },
  { id: "camaras", name: "Cámaras de Paso y Ductos Exteriores", icon: "📦" },
  { id: "cctv_ext", name: "Postes y Cámaras CCTV Perimetrales", icon: "📹" },
];

const TOWER_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

function generateDepartmentsForFloor(floorName, count = 8) {
  const match = floorName.match(/Piso\s+(\d+)/i);
  if (!match) return [];
  const floorNum = parseInt(match[1], 10);
  const total = Math.max(0, Math.min(Number(count) || 0, 40));

  return Array.from({ length: total }, (_, i) => {
    const depNum = i + 1;
    const formatted = depNum < 10 ? `0${depNum}` : `${depNum}`;
    return `${floorNum}${formatted}`;
  });
}

function generateTowerFloorList(tower) {
  const list = [];
  const start = Math.min(Number(tower.startFloor) || 1, Number(tower.endFloor) || 1);
  const end = Math.max(Number(tower.startFloor) || 1, Number(tower.endFloor) || 1);

  for (let i = start; i <= end; i++) {
    list.push(`Piso ${i}`);
  }
  if (tower.hasCubierta) {
    list.push("Cubierta");
  }
  return list;
}

function getCandidateDepartments(floorName, existingSelected = [], maxBase = 16) {
  const match = floorName.match(/Piso\s+(\d+)/i);
  if (!match) return existingSelected;
  const floorNum = parseInt(match[1], 10);

  const candidates = new Set();
  for (let i = 1; i <= maxBase; i++) {
    const formatted = i < 10 ? `0${i}` : `${i}`;
    candidates.add(`${floorNum}${formatted}`);
  }
  (existingSelected || []).forEach((dep) => candidates.add(dep));

  return Array.from(candidates).sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

function createDefaultTower(index = 0) {
  const letter = TOWER_LETTERS[index] || `${index + 1}`;
  const startFloor = 1;
  const endFloor = 15;
  const hasCubierta = true;

  const tower = {
    id: `tower-${index + 1}-${Date.now()}`,
    name: `Torre ${letter}`,
    startFloor,
    endFloor,
    hasCubierta,
    departments: {},
  };

  const floors = generateTowerFloorList(tower);
  floors.forEach((f) => {
    tower.departments[f] = f === "Cubierta" ? [] : generateDepartmentsForFloor(f, 8);
  });

  return tower;
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

export default function ProjectForm({
  open,
  onClose,
  onSave,
  onDelete,
  editProject = null,
}) {
  const { canDelete } = usePermissions();
  const isEditing = Boolean(editProject);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects"),
    enabled: open,
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

  // Pasos del Wizard: 1 = Ficha Contrato, 2 = Estructura del Edificio
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Estructura por Torre
  const [towers, setTowers] = useState([createDefaultTower(0)]);
  const [activeTowerIndex, setActiveTowerIndex] = useState(0);
  const [activeFloorName, setActiveFloorName] = useState("Piso 1");
  const [customDeptoInput, setCustomDeptoInput] = useState("");
  const [copiedFeedback, setCopiedFeedback] = useState("");

  // Subterráneos
  const [subterraneoLevels, setSubterraneoLevels] = useState(0); // 0 a 5
  const [selectedSubterraneos, setSelectedSubterraneos] = useState([]);
  const [customSubterraneo, setCustomSubterraneo] = useState("");

  // Salas Especiales y Exteriores
  const [selectedAreasComunes, setSelectedAreasComunes] = useState([
    "Sala Eléctrica Principal (TGBT)",
    "Sala de Bombas de Agua Potable",
  ]);
  const [customAreaComun, setCustomAreaComun] = useState("");

  const [selectedExteriores, setSelectedExteriores] = useState([
    "Alumbrado Perimetral Exterior",
    "Canalización de Empalme Eléctrico",
  ]);
  const [customExterior, setCustomExterior] = useState("");

  // Verticales / Shafts
  const [verticalEL, setVerticalEL] = useState(true);
  const [verticalCD, setVerticalCD] = useState(true);
  const [verticalTC, setVerticalTC] = useState(true);

  // Pestaña activa en Paso 2: 'torres' | 'subterraneos' | 'salas' | 'exteriores'
  const [step2Tab, setStep2Tab] = useState("torres");

  // Inicialización / Reset
  useEffect(() => {
    if (!open) {
      setError("");
      setSaving(false);
      setStep(1);
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

      const parsedDeps = safeParseJson(editProject.departments, {});
      const parsedSubs = safeParseJson(editProject.subterraneos, []);
      const parsedExts = safeParseJson(editProject.exteriores, []);
      const parsedComs = safeParseJson(editProject.areas_comunes, []);

      setSelectedSubterraneos(parsedSubs);
      setSubterraneoLevels(parsedSubs.length > 0 ? parsedSubs.length : 0);
      setSelectedExteriores(parsedExts);
      setSelectedAreasComunes(parsedComs);

      setVerticalEL(Number(editProject.vertical_el_count || 0) > 0);
      setVerticalTC(Number(editProject.vertical_tc_count || 0) > 0);
      setVerticalCD(Number(editProject.vertical_cd_count || 0) > 0);

      // Si existe configuración guardada de torres
      if (parsedDeps.__towers_config__ && Array.isArray(parsedDeps.__towers_config__)) {
        setTowers(parsedDeps.__towers_config__);
      } else {
        const count = Math.max(1, Number(editProject.tower_count) || 1);
        const parsedFloors = safeParseJson(editProject.floors, []);
        const rawFloors = parsedFloors.filter((f) => !/Subterr|Exterior|Comun/i.test(f));
        const maxFloorNum = rawFloors.reduce((max, f) => {
          const m = f.match(/\d+/);
          return m ? Math.max(max, Number(m[0])) : max;
        }, 15);

        const newTowers = [];
        for (let i = 0; i < count; i++) {
          const t = {
            id: `tower-${i + 1}`,
            name: count > 1 ? `Torre ${TOWER_LETTERS[i] || i + 1}` : "Torre 1",
            startFloor: 1,
            endFloor: maxFloorNum || 15,
            hasCubierta: rawFloors.some((f) => /cubierta|azotea/i.test(f)),
            departments: {},
          };

          const tFloors = generateTowerFloorList(t);
          tFloors.forEach((f) => {
            // Revisar si viene de formato anidado o plano
            const fromNested = parsedDeps[t.name]?.[f];
            const fromFlat = parsedDeps[f];
            t.departments[f] = Array.isArray(fromNested)
              ? fromNested
              : Array.isArray(fromFlat)
              ? fromFlat
              : f === "Cubierta"
              ? []
              : generateDepartmentsForFloor(f, 8);
          });
          newTowers.push(t);
        }
        setTowers(newTowers);
      }

      setActiveTowerIndex(0);
      setActiveFloorName("Piso 1");
      setStep(1);
    } else {
      setForm({ ...INITIAL_FORM });
      setStep(1);
      const defaultTowers = [createDefaultTower(0)];
      setTowers(defaultTowers);
      setActiveTowerIndex(0);
      setActiveFloorName("Piso 1");
      setSubterraneoLevels(2);
      setSelectedSubterraneos([
        "Subterráneo -1 (Estacionamientos y Bodegas)",
        "Subterráneo -2 (Estacionamientos y Bodegas)",
      ]);
      setSelectedAreasComunes([
        "Sala Eléctrica Principal (TGBT)",
        "Sala de Bombas de Agua Potable",
        "Sala de Grupo Electrógeno",
        "Hall Principal / Conserjería",
      ]);
      setSelectedExteriores([
        "Alumbrado Perimetral Exterior",
        "Canalización de Empalme Eléctrico",
      ]);
      setVerticalEL(true);
      setVerticalCD(true);
      setVerticalTC(true);
      setCustomDeptoInput("");
      setCopiedFeedback("");
    }
  }, [open, editProject]);

  const updateFormField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");

    if (field === "tower_count") {
      const num = parseInt(value, 10);
      if (Number.isInteger(num) && num >= 1 && num <= 10) {
        setTowers((prev) => {
          if (prev.length === num) return prev;
          if (prev.length < num) {
            const added = [];
            for (let i = prev.length; i < num; i++) {
              added.push(createDefaultTower(i));
            }
            return [...prev, ...added];
          } else {
            return prev.slice(0, num);
          }
        });
        if (activeTowerIndex >= num) {
          setActiveTowerIndex(0);
        }
      }
    }
  };

  const activeTower = towers[activeTowerIndex] || towers[0];

  // Actualizar torre activa y sincronizar sus pisos
  const updateActiveTower = (field, value) => {
    setTowers((prev) => {
      const next = [...prev];
      if (next[activeTowerIndex]) {
        const updated = {
          ...next[activeTowerIndex],
          [field]: value,
        };

        // Si cambiaron los pisos o cubierta, sincronizar diccionario de departamentos
        if (field === "startFloor" || field === "endFloor" || field === "hasCubierta") {
          const newFloors = generateTowerFloorList(updated);
          const currentDeps = updated.departments || {};
          const syncedDeps = {};

          newFloors.forEach((f) => {
            if (f === "Cubierta") {
              syncedDeps[f] = currentDeps[f] || [];
            } else if (currentDeps[f] && currentDeps[f].length > 0) {
              syncedDeps[f] = currentDeps[f];
            } else {
              syncedDeps[f] = generateDepartmentsForFloor(f, 8);
            }
          });
          updated.departments = syncedDeps;
        }

        next[activeTowerIndex] = updated;
      }
      return next;
    });
  };

  // Departamentos del piso activo
  const activeFloorDeps = (activeTower?.departments && activeTower.departments[activeFloorName]) || [];
  const candidateDeps = useMemo(() => {
    return getCandidateDepartments(activeFloorName, activeFloorDeps, 16);
  }, [activeFloorName, activeFloorDeps]);

  // Alternar un departamento en el piso activo
  const toggleDepartment = (dep) => {
    setTowers((prev) => {
      const next = [...prev];
      const tower = { ...next[activeTowerIndex] };
      const towerDeps = { ...(tower.departments || {}) };
      const currentList = towerDeps[activeFloorName] || [];

      if (currentList.includes(dep)) {
        towerDeps[activeFloorName] = currentList.filter((d) => d !== dep);
      } else {
        towerDeps[activeFloorName] = [...currentList, dep].sort((a, b) => {
          const na = parseInt(a, 10);
          const nb = parseInt(b, 10);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return a.localeCompare(b, undefined, { numeric: true });
        });
      }

      tower.departments = towerDeps;
      next[activeTowerIndex] = tower;
      return next;
    });
  };

  // Botones de selección rápida (1 al 4, 1 al 8, todos, limpiar)
  const applyPresetCount = (count) => {
    const deps = generateDepartmentsForFloor(activeFloorName, count);
    setTowers((prev) => {
      const next = [...prev];
      const tower = { ...next[activeTowerIndex] };
      const towerDeps = { ...(tower.departments || {}) };
      towerDeps[activeFloorName] = deps;
      tower.departments = towerDeps;
      next[activeTowerIndex] = tower;
      return next;
    });
  };

  const selectAllCandidates = () => {
    setTowers((prev) => {
      const next = [...prev];
      const tower = { ...next[activeTowerIndex] };
      const towerDeps = { ...(tower.departments || {}) };
      towerDeps[activeFloorName] = [...candidateDeps];
      tower.departments = towerDeps;
      next[activeTowerIndex] = tower;
      return next;
    });
  };

  const clearActiveFloorDeps = () => {
    setTowers((prev) => {
      const next = [...prev];
      const tower = { ...next[activeTowerIndex] };
      const towerDeps = { ...(tower.departments || {}) };
      towerDeps[activeFloorName] = [];
      tower.departments = towerDeps;
      next[activeTowerIndex] = tower;
      return next;
    });
  };

  // Copiar distribución del piso actual a todos los pisos de la torre activa
  const copyToAllFloorsOfTower = () => {
    const currentCount = activeFloorDeps.length;
    setTowers((prev) => {
      const next = [...prev];
      const tower = { ...next[activeTowerIndex] };
      const towerDeps = { ...(tower.departments || {}) };
      const towerFloors = generateTowerFloorList(tower);

      towerFloors.forEach((floor) => {
        if (floor !== "Cubierta") {
          towerDeps[floor] = generateDepartmentsForFloor(floor, currentCount);
        }
      });

      tower.departments = towerDeps;
      next[activeTowerIndex] = tower;
      return next;
    });

    setCopiedFeedback(`¡Se aplicaron ${currentCount} departamentos a todos los pisos de ${activeTower.name}!`);
    setTimeout(() => setCopiedFeedback(""), 3500);
  };

  // Añadir departamento personalizado
  const handleAddCustomDepto = (e) => {
    if (e) e.preventDefault();
    const val = customDeptoInput.trim().toUpperCase();
    if (!val) return;
    toggleDepartment(val);
    setCustomDeptoInput("");
  };

  // Subterráneos
  const handleSelectSubterraneoLevels = (levels) => {
    setSubterraneoLevels(levels);
    if (levels === 0) {
      setSelectedSubterraneos([]);
      return;
    }
    const generated = [];
    for (let i = 1; i <= levels; i++) {
      generated.push(`Subterráneo -${i} (Estacionamientos y Bodegas)`);
    }
    setSelectedSubterraneos(generated);
  };

  const toggleSubterraneoItem = (item) => {
    setSelectedSubterraneos((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  const addCustomSubterraneoItem = () => {
    const val = customSubterraneo.trim();
    if (val && !selectedSubterraneos.includes(val)) {
      setSelectedSubterraneos((prev) => [...prev, val]);
      setCustomSubterraneo("");
    }
  };

  // Salas técnicas y exteriores
  const toggleAreaComun = (name) => {
    setSelectedAreasComunes((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  };

  const addCustomAreaComun = () => {
    const val = customAreaComun.trim();
    if (val && !selectedAreasComunes.includes(val)) {
      setSelectedAreasComunes((prev) => [...prev, val]);
      setCustomAreaComun("");
    }
  };

  const toggleExterior = (name) => {
    setSelectedExteriores((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  };

  const addCustomExterior = () => {
    const val = customExterior.trim();
    if (val && !selectedExteriores.includes(val)) {
      setSelectedExteriores((prev) => [...prev, val]);
      setCustomExterior("");
    }
  };

  // Resumen calculado en tiempo real
  const summary = useMemo(() => {
    let totalFloorsCount = 0;
    let totalDepartmentsCount = 0;

    const towersBreakdown = towers.map((t) => {
      const floorsList = generateTowerFloorList(t);
      let towerDepsCount = 0;

      floorsList.forEach((floorName) => {
        const floorDeps = (t.departments && t.departments[floorName]) || [];
        towerDepsCount += floorDeps.length;
      });

      totalFloorsCount += floorsList.length;
      totalDepartmentsCount += towerDepsCount;

      return {
        name: t.name,
        floorsCount: floorsList.length,
        depsCount: towerDepsCount,
      };
    });

    return {
      towersCount: towers.length,
      totalFloorsCount,
      totalDepartmentsCount,
      towersBreakdown,
      subterraneosCount: selectedSubterraneos.length,
      salasCount: selectedAreasComunes.length,
      exterioresCount: selectedExteriores.length,
    };
  }, [towers, selectedSubterraneos, selectedAreasComunes, selectedExteriores]);

  // Validaciones para pasar al paso 2
  const handleNextToStep2 = () => {
    const name = form.name.trim();
    if (!name) {
      setError("Por favor, ingresa el nombre de la obra.");
      return;
    }

    const duplicate = projects.find(
      (p) =>
        p.name.trim().toLowerCase() === name.toLowerCase() &&
        Number(p.id) !== Number(editProject?.id)
    );
    if (duplicate) {
      setError(`Ya existe una obra con el nombre "${duplicate.name}". Usa otro nombre.`);
      return;
    }

    if (!form.client?.trim()) {
      setError("Por favor, indica el cliente o constructora.");
      return;
    }
    if (!form.address?.trim()) {
      setError("Por favor, ingresa la ubicación o dirección.");
      return;
    }
    if (!form.supervisor) {
      setError("Por favor, selecciona el supervisor asignado.");
      return;
    }
    if (!form.capataz) {
      setError("Por favor, selecciona el capataz asignado.");
      return;
    }
    if (!form.start_date) {
      setError("Por favor, selecciona la fecha de inicio.");
      return;
    }
    if (!form.end_date) {
      setError("Por favor, selecciona la fecha de término.");
      return;
    }
    if (form.start_date > form.end_date) {
      setError("La fecha de inicio no puede ser posterior a la fecha de término.");
      return;
    }

    setError("");
    setStep(2);
  };

  // Guardar proyecto
  const handleSaveProject = async () => {
    try {
      setSaving(true);
      setError("");

      const allFloorsSet = new Set();
      towers.forEach((t) => {
        const tFloors = generateTowerFloorList(t);
        tFloors.forEach((f) => allFloorsSet.add(f));
      });
      const consolidatedFloors = Array.from(allFloorsSet);

      const departmentsObj = {
        __towers_config__: towers,
      };

      towers.forEach((t) => {
        departmentsObj[t.name] = t.departments || {};
        // Retrocompatibilidad con ítems anteriores a nivel plano
        Object.entries(t.departments || {}).forEach(([f, deps]) => {
          if (!departmentsObj[f] || departmentsObj[f].length === 0) {
            departmentsObj[f] = deps;
          }
        });
      });

      const payload = {
        name: form.name.trim(),
        client: form.client.trim(),
        address: form.address.trim(),
        location: form.address.trim(),
        description: form.description.trim() || `Obra ${form.name.trim()}`,
        status: form.status || "activa",
        start_date: form.start_date,
        end_date: form.end_date,
        supervisor: form.supervisor,
        capataz: form.capataz,
        tower_count: Number(towers.length || 1),
        floors: consolidatedFloors,
        departments: departmentsObj,
        subterraneos: selectedSubterraneos,
        exteriores: selectedExteriores,
        areas_comunes: selectedAreasComunes,
        vertical_el_count: verticalEL ? 1 : 0,
        vertical_tc_count: verticalTC ? 1 : 0,
        vertical_cd_count: verticalCD ? 1 : 0,
      };

      await onSave(payload);
      onClose();
    } catch (err) {
      console.error("Error al guardar obra:", err);
      setError(err.message || "Error al guardar los datos de la obra.");
    } finally {
      setSaving(false);
    }
  };

  const currentTowerFloors = generateTowerFloorList(activeTower);

  return (
    <Dialog open={open} onOpenChange={(val) => !saving && !val && onClose()}>
      <DialogContent className="flex max-h-[94vh] flex-col overflow-hidden p-0 sm:max-w-4xl bg-white shadow-2xl border-slate-200">
        {/* ENCABEZADO CORDIAL */}
        <DialogHeader className="border-b bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-50 text-orange-600 border border-orange-200">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-800">
                  {isEditing ? "Editar Configuración de Obra" : "Registrar Nueva Obra"}
                </DialogTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  {step === 1
                    ? "Paso 1 de 2: Ficha contractual, plazos y responsables"
                    : "Paso 2 de 2: Configuración estructural interactiva por torre"}
                </p>
              </div>
            </div>

            {/* Pasos */}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all",
                  step === 1
                    ? "bg-orange-500 text-white shadow-xs"
                    : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                )}
              >
                {step > 1 ? "✓" : "1"}
              </span>
              <div className="w-6 h-0.5 bg-slate-200" />
              <span
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all",
                  step === 2
                    ? "bg-orange-500 text-white shadow-xs"
                    : "bg-slate-100 text-slate-400 border border-slate-200"
                )}
              >
                2
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* ALERTA DE ERROR */}
        {error && (
          <div className="mx-6 mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-xs text-rose-800 animate-in fade-in">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* CUERPO DEL FORMULARIO CON SCROLL */}
        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
          {/* ===================== PASO 1: FICHA CONTRACTUAL ===================== */}
          {step === 1 && (
            <div className="space-y-4 max-w-2xl mx-auto py-1">
              <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-3 flex items-start gap-2.5 text-xs text-slate-650">
                <Info className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                <p>
                  Ingresa los antecedentes principales de la obra. En el siguiente paso definirás la estructura de torres, pisos y la grilla de departamentos.
                </p>
              </div>

              {/* Nombre de la Obra y Cliente */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <Building className="h-3.5 w-3.5 text-orange-600" />
                    Nombre de la Obra *
                  </Label>
                  <Input
                    value={form.name}
                    onChange={(e) => updateFormField("name", e.target.value)}
                    placeholder="Ej: Edificio Vista Parque"
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <FileText className="h-3.5 w-3.5 text-orange-600" />
                    Cliente / Constructora *
                  </Label>
                  <Input
                    value={form.client}
                    onChange={(e) => updateFormField("client", e.target.value)}
                    placeholder="Ej: Constructora Besalco"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* Ubicación y Cantidad de Torres */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                <div className="sm:col-span-8">
                  <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <MapPin className="h-3.5 w-3.5 text-orange-600" />
                    Ubicación / Dirección *
                  </Label>
                  <Input
                    value={form.address}
                    onChange={(e) => updateFormField("address", e.target.value)}
                    placeholder="Ej: Av. Las Condes 12345, Santiago"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="sm:col-span-4">
                  <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <Layers className="h-3.5 w-3.5 text-orange-600" />
                    Cantidad de Torres *
                  </Label>
                  <Select
                    value={String(form.tower_count || 1)}
                    onValueChange={(val) => updateFormField("tower_count", val)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Torres" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <SelectItem key={num} value={String(num)}>
                          {num} {num === 1 ? "Torre" : "Torres"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Supervisores y Capataces */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-orange-600" />
                    Supervisor Responsable *
                  </Label>
                  <Select
                    value={form.supervisor}
                    onValueChange={(v) => updateFormField("supervisor", v)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Seleccionar supervisor" />
                    </SelectTrigger>
                    <SelectContent>
                      {supervisors.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          Sin supervisores registrados
                        </SelectItem>
                      ) : (
                        supervisors.map((u) => (
                          <SelectItem key={u.id} value={u.full_name}>
                            {u.full_name} {u.role === "admin" && "(Admin)"}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-orange-600" />
                    Capataz Responsable *
                  </Label>
                  <Select
                    value={form.capataz}
                    onValueChange={(v) => updateFormField("capataz", v)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Seleccionar capataz" />
                    </SelectTrigger>
                    <SelectContent>
                      {capataces.length === 0 ? (
                        <SelectItem value="__none__" disabled>
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

              {/* Fechas de Contrato */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <Calendar className="h-3.5 w-3.5 text-orange-600" />
                    Fecha de Inicio *
                  </Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => updateFormField("start_date", e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <Calendar className="h-3.5 w-3.5 text-orange-600" />
                    Fecha de Término Estimada *
                  </Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => updateFormField("end_date", e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* Descripción */}
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 block">
                  Descripción o Alcance Breve
                </Label>
                <Input
                  value={form.description}
                  onChange={(e) => updateFormField("description", e.target.value)}
                  placeholder="Ej: Instalaciones Eléctricas en losa, tabiquería y corrientes débiles"
                  className="h-9 text-xs"
                />
              </div>
            </div>
          )}

          {/* ===================== PASO 2: ESTRUCTURA INTERACTIVA ===================== */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Pestañas de secciones */}
              <div className="flex flex-wrap items-center gap-1.5 border-b pb-2">
                <button
                  type="button"
                  onClick={() => setStep2Tab("torres")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                    step2Tab === "torres"
                      ? "bg-orange-500 text-white border-orange-500 shadow-xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Torres y Departamentos ({towers.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep2Tab("subterraneos")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                    step2Tab === "subterraneos"
                      ? "bg-orange-500 text-white border-orange-500 shadow-xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <Car className="h-3.5 w-3.5" />
                  <span>Subterráneos ({selectedSubterraneos.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep2Tab("salas")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                    step2Tab === "salas"
                      ? "bg-orange-500 text-white border-orange-500 shadow-xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Salas Técnicas ({selectedAreasComunes.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep2Tab("exteriores")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                    step2Tab === "exteriores"
                      ? "bg-orange-500 text-white border-orange-500 shadow-xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <Trees className="h-3.5 w-3.5" />
                  <span>Exteriores ({selectedExteriores.length})</span>
                </button>
              </div>

              {/* ===================== SUBTAB 1: GRILLA INTERACTIVA DE TORRES Y DEPTOS ===================== */}
              {step2Tab === "torres" && (
                <div className="space-y-3.5">
                  {/* Selector de Torres si hay más de 1 */}
                  {towers.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">Torre:</span>
                      {towers.map((tower, idx) => {
                        const isActive = idx === activeTowerIndex;
                        const tDeps = Object.values(tower.departments || {}).reduce((s, a) => s + a.length, 0);
                        return (
                          <button
                            key={tower.id || idx}
                            type="button"
                            onClick={() => {
                              setActiveTowerIndex(idx);
                              const fList = generateTowerFloorList(tower);
                              if (!fList.includes(activeFloorName)) {
                                setActiveFloorName(fList[0] || "Piso 1");
                              }
                            }}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                              isActive
                                ? "bg-orange-50 border-orange-400 text-orange-950 shadow-xs ring-1 ring-orange-400"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                            )}
                          >
                            <span>{tower.name}</span>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10px] px-1.5 py-0 rounded-full font-mono",
                                isActive ? "bg-orange-200/80 text-orange-900" : ""
                              )}
                            >
                              {tDeps} dptos
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Barra de parámetros de la Torre Activa */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs font-bold text-slate-700">Nombre:</Label>
                        <Input
                          value={activeTower.name}
                          onChange={(e) => updateActiveTower("name", e.target.value)}
                          className="h-8 w-28 text-xs bg-white font-bold"
                          placeholder="Torre A"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs font-bold text-slate-700">Pisos:</Label>
                        <Input
                          type="number"
                          min="1"
                          max="50"
                          value={activeTower.startFloor}
                          onChange={(e) =>
                            updateActiveTower("startFloor", parseInt(e.target.value, 10) || 1)
                          }
                          className="h-8 w-14 text-xs bg-white text-center font-bold"
                        />
                        <span className="text-slate-400 font-bold">al</span>
                        <Input
                          type="number"
                          min="1"
                          max="50"
                          value={activeTower.endFloor}
                          onChange={(e) =>
                            updateActiveTower("endFloor", parseInt(e.target.value, 10) || 1)
                          }
                          className="h-8 w-14 text-xs bg-white text-center font-bold"
                        />
                      </div>

                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={activeTower.hasCubierta}
                          onChange={(e) => updateActiveTower("hasCubierta", e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-orange-600"
                        />
                        <span className="font-semibold text-slate-700">Cubierta</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">Total en {activeTower.name}:</span>
                      <Badge className="bg-orange-500 text-white font-mono text-xs">
                        {Object.values(activeTower.departments || {}).reduce((s, a) => s + a.length, 0)} departamentos
                      </Badge>
                    </div>
                  </div>

                  {/* Feedback de copia a todos los pisos */}
                  {copiedFeedback && (
                    <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                      <CheckCheck className="h-4 w-4 text-emerald-600" />
                      <span>{copiedFeedback}</span>
                    </div>
                  )}

                  {/* ESTUDIO INTERACTIVO: 2 COLUMNAS (PISOS A LA IZQUIERDA / GRILLA INTERACTIVA A LA DERECHA) */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                    {/* Columna Izquierda: Lista de Pisos de esta Torre */}
                    <div className="md:col-span-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          <Layers className="h-4 w-4 text-orange-600" />
                          1. Pisos de {activeTower.name} ({currentTowerFloors.length})
                        </Label>
                        <span className="text-[10px] text-muted-foreground">Toca un piso</span>
                      </div>

                      <div className="border border-slate-200 rounded-xl p-2 h-80 overflow-y-auto space-y-1 bg-white scrollbar-thin">
                        {currentTowerFloors.map((floor) => {
                          const isActive = floor === activeFloorName;
                          const depsCount = (activeTower.departments?.[floor] || []).length;
                          const isCubierta = floor === "Cubierta";

                          return (
                            <button
                              key={floor}
                              type="button"
                              onClick={() => setActiveFloorName(floor)}
                              className={cn(
                                "w-full flex items-center justify-between text-xs py-2 px-3 rounded-lg border transition-all text-left",
                                isActive
                                  ? "bg-orange-50 border-orange-500 text-orange-950 font-bold shadow-2xs ring-1 ring-orange-400"
                                  : "border-slate-100 hover:bg-slate-50 text-slate-700"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "w-2 h-2 rounded-full",
                                    isActive ? "bg-orange-500" : depsCount > 0 ? "bg-emerald-500" : "bg-slate-300"
                                  )}
                                />
                                <span>{floor}</span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                {isCubierta ? (
                                  <span className="text-[10px] text-slate-400 italic">Técnica</span>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      "text-[10.5px] px-2 py-0.5 font-mono font-bold",
                                      depsCount > 0
                                        ? "bg-orange-100 text-orange-800 border border-orange-200"
                                        : "bg-slate-100 text-slate-400"
                                    )}
                                  >
                                    {depsCount} dptos
                                  </Badge>
                                )}
                                <span className={cn("text-xs font-black", isActive ? "text-orange-600" : "text-transparent")}>
                                  →
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Columna Derecha: Grilla Interactiva de Departamentos */}
                    <div className="md:col-span-7 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <SlidersHorizontal className="h-4 w-4 text-orange-600" />
                          2. Departamentos en <span className="text-orange-700 font-extrabold">{activeFloorName}</span>
                        </Label>

                        {activeFloorName !== "Cubierta" && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground mr-1">Rápido:</span>
                            {[4, 6, 8, 10].map((num) => (
                              <button
                                key={num}
                                type="button"
                                onClick={() => applyPresetCount(num)}
                                className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-700 hover:bg-orange-50 hover:border-orange-300 transition-colors cursor-pointer"
                              >
                                {num}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={selectAllCandidates}
                              className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-orange-700 hover:bg-orange-50 hover:border-orange-300 transition-colors cursor-pointer ml-0.5"
                            >
                              Todos
                            </button>
                            <button
                              type="button"
                              onClick={clearActiveFloorDeps}
                              className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-400 hover:text-rose-600 transition-colors cursor-pointer ml-0.5"
                            >
                              Limpiar
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Caja interactiva de departamentos */}
                      {activeFloorName === "Cubierta" ? (
                        <div className="border border-dashed border-slate-200 rounded-xl h-80 flex flex-col items-center justify-center text-center p-6 bg-slate-50/50">
                          <Layers className="h-8 w-8 text-slate-300 mb-2" />
                          <p className="text-xs font-bold text-slate-700">Cubierta / Azotea Técnica</p>
                          <p className="text-[11px] text-slate-400 max-w-xs mt-1">
                            Este nivel no lleva departamentos habitacionales. Sus actividades se asignan como recinto global o sala técnica.
                          </p>
                        </div>
                      ) : (
                        <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/40 h-80 flex flex-col justify-between">
                          {/* Grilla visual de departamentos */}
                          <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin space-y-2">
                            <p className="text-[10.5px] text-slate-500 font-medium flex items-center justify-between">
                              <span>Toca cada depto para activarlo o desactivarlo:</span>
                              <span className="font-bold text-orange-700">
                                {activeFloorDeps.length} seleccionados
                              </span>
                            </p>

                            <div className="grid grid-cols-4 sm:grid-cols-4 gap-2 pt-1">
                              {candidateDeps.map((dep) => {
                                const isSelected = activeFloorDeps.includes(dep);
                                return (
                                  <button
                                    key={dep}
                                    type="button"
                                    onClick={() => toggleDepartment(dep)}
                                    className={cn(
                                      "h-9 rounded-xl border text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer select-none",
                                      isSelected
                                        ? "bg-orange-500 text-white border-orange-600 shadow-xs ring-1 ring-orange-400"
                                        : "bg-white border-slate-200 text-slate-650 hover:bg-orange-50 hover:border-orange-300"
                                    )}
                                  >
                                    {isSelected && <span className="text-[10px]">✓</span>}
                                    <span>{dep}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Barra de acciones al pie de la grilla */}
                          <div className="pt-2 border-t border-slate-200 space-y-2 shrink-0">
                            {/* Input para agregar departamento con nombre único */}
                            <form onSubmit={handleAddCustomDepto} className="flex gap-2">
                              <Input
                                value={customDeptoInput}
                                onChange={(e) => setCustomDeptoInput(e.target.value)}
                                placeholder={`Ej: ${activeFloorName.replace(/\D/g, "")}01-A, Penthouse`}
                                className="h-7 text-xs bg-white"
                              />
                              <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2.5 font-bold shrink-0 bg-white"
                              >
                                + Añadir
                              </Button>
                            </form>

                            {/* Botón potente: Copiar a toda la torre */}
                            <Button
                              type="button"
                              onClick={copyToAllFloorsOfTower}
                              variant="outline"
                              size="sm"
                              className="w-full h-8 text-xs font-bold border-orange-200 bg-orange-50/70 text-orange-850 hover:bg-orange-100 hover:border-orange-300 gap-1.5"
                            >
                              <Copy className="h-3.5 w-3.5 text-orange-600" />
                              <span>
                                Copiar {activeFloorDeps.length} dptos a TODOS los pisos de {activeTower.name}
                              </span>
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ===================== SUBTAB 2: SUBTERRÁNEOS ===================== */}
              {step2Tab === "subterraneos" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                    <Label className="text-xs font-bold text-slate-800 block">
                      ¿Cuántos niveles de subterráneo tiene la obra?
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Toca un número para generar los niveles de estacionamientos y bodegas automáticamente:
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {[0, 1, 2, 3, 4, 5].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => handleSelectSubterraneoLevels(lvl)}
                          className={cn(
                            "px-3.5 py-2 rounded-xl text-xs font-bold border transition-all",
                            subterraneoLevels === lvl
                              ? "bg-orange-500 text-white border-orange-500 shadow-xs ring-2 ring-orange-200"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          {lvl === 0 ? "Sin subterráneos" : `${lvl} ${lvl === 1 ? "Nivel (-1)" : `Niveles (-1 al -${lvl})`}`}
                        </button>
                      ))}
                    </div>

                    {/* Lista de subterráneos seleccionados */}
                    {selectedSubterraneos.length > 0 && (
                      <div className="pt-2 space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700 block">
                          Niveles activos en el proyecto ({selectedSubterraneos.length}):
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {selectedSubterraneos.map((sub) => (
                            <div
                              key={sub}
                              className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white text-xs font-medium"
                            >
                              <div className="flex items-center gap-2">
                                <Car className="h-3.5 w-3.5 text-blue-600" />
                                <span>{sub}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleSubterraneoItem(sub)}
                                className="text-slate-400 hover:text-rose-600 p-1"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Agregar subterráneo personalizado */}
                    <div className="flex gap-2 pt-2 border-t">
                      <Input
                        value={customSubterraneo}
                        onChange={(e) => setCustomSubterraneo(e.target.value)}
                        placeholder="Ej: Subterráneo -4 (Bodegas Generales)"
                        className="h-8 text-xs bg-white"
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomSubterraneoItem())}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addCustomSubterraneoItem}
                        className="h-8 text-xs shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Añadir
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ===================== SUBTAB 3: SALAS TÉCNICAS ===================== */}
              {step2Tab === "salas" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                    <div>
                      <Label className="text-xs font-bold text-slate-800 block">
                        Salas Técnicas y Recintos Especiales
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Toca las salas que aplican para esta obra. Estarán disponibles para asignar frentes de trabajo y se reflejarán en el modelo 3D.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {PRESET_SALAS_TECNICAS.map((sala) => {
                        const isSelected = selectedAreasComunes.includes(sala.name);
                        return (
                          <button
                            key={sala.id}
                            type="button"
                            onClick={() => toggleAreaComun(sala.name)}
                            className={cn(
                              "flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold text-left transition-all",
                              isSelected
                                ? "bg-orange-50 border-orange-400 text-orange-950 shadow-2xs ring-1 ring-orange-300"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-base">{sala.icon}</span>
                              <span>{sala.name}</span>
                            </div>
                            <div
                              className={cn(
                                "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold",
                                isSelected
                                  ? "bg-orange-500 text-white"
                                  : "border border-slate-300 text-transparent"
                              )}
                            >
                              ✓
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Agregar sala personalizada */}
                    <div className="flex gap-2 pt-2 border-t">
                      <Input
                        value={customAreaComun}
                        onChange={(e) => setCustomAreaComun(e.target.value)}
                        placeholder="Ej: Sala de Calderas / Termos Solares"
                        className="h-8 text-xs bg-white"
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomAreaComun())}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addCustomAreaComun}
                        className="h-8 text-xs shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Añadir Sala
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ===================== SUBTAB 4: EXTERIORES Y VERTICALES ===================== */}
              {step2Tab === "exteriores" && (
                <div className="space-y-4">
                  {/* Exteriores */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                    <div>
                      <Label className="text-xs font-bold text-slate-800 block">
                        Sectores Exteriores y Perimetrales
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Selecciona las partidas que se ejecutarán fuera de las torres:
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {PRESET_EXTERIORES.map((ext) => {
                        const isSelected = selectedExteriores.includes(ext.name);
                        return (
                          <button
                            key={ext.id}
                            type="button"
                            onClick={() => toggleExterior(ext.name)}
                            className={cn(
                              "flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold text-left transition-all",
                              isSelected
                                ? "bg-emerald-50 border-emerald-400 text-emerald-950 shadow-2xs ring-1 ring-emerald-300"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-base">{ext.icon}</span>
                              <span>{ext.name}</span>
                            </div>
                            <div
                              className={cn(
                                "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold",
                                isSelected
                                  ? "bg-emerald-600 text-white"
                                  : "border border-slate-300 text-transparent"
                              )}
                            >
                              ✓
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Agregar exterior personalizado */}
                    <div className="flex gap-2 pt-2 border-t">
                      <Input
                        value={customExterior}
                        onChange={(e) => setCustomExterior(e.target.value)}
                        placeholder="Ej: Urbanización Exterior / Paisajismo"
                        className="h-8 text-xs bg-white"
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomExterior())}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addCustomExterior}
                        className="h-8 text-xs shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Añadir Exterior
                      </Button>
                    </div>
                  </div>

                  {/* Verticales / Shafts */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                    <Label className="text-xs font-bold text-slate-800 block">
                      Verticales / Shafts que suben por el edificio
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={verticalEL}
                          onChange={(e) => setVerticalEL(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-orange-600"
                        />
                        <span className="font-semibold text-slate-800">⚡ Fuerza (EL)</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={verticalCD}
                          onChange={(e) => setVerticalCD(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-orange-600"
                        />
                        <span className="font-semibold text-slate-800">📶 Corrientes Débiles (CD)</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={verticalTC}
                          onChange={(e) => setVerticalTC(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-orange-600"
                        />
                        <span className="font-semibold text-slate-800">🌐 Telecomunicaciones (TC)</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* ===================== RESUMEN CORDIAL EN VIVO ===================== */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-950 space-y-1 shadow-2xs">
                <div className="flex items-center justify-between font-bold text-emerald-900 border-b border-emerald-200/60 pb-1">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-emerald-600" />
                    Resumen del Proyecto: {form.name || "Obra sin nombre"}
                  </span>
                  <Badge variant="outline" className="bg-white border-emerald-300 text-emerald-800">
                    Listo para generar
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-medium">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Torres:</span>
                    <span className="font-bold text-slate-800">
                      {summary.towersCount} {summary.towersCount === 1 ? "Torre" : "Torres"}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px]">Departamentos totales:</span>
                    <span className="font-bold text-orange-700 font-mono">
                      {summary.totalDepartmentsCount} dptos
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px]">Subterráneos:</span>
                    <span className="font-bold text-slate-800">
                      {summary.subterraneosCount} niveles
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px]">Salas Técnicas:</span>
                    <span className="font-bold text-slate-800">
                      {summary.salasCount} recintos
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PIE DE PÁGINA CON BOTONES */}
        <DialogFooter className="border-t bg-slate-50 px-6 py-3 flex items-center justify-between shrink-0">
          <div>
            {isEditing && canDelete && step === 1 && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (window.confirm(`¿Estás seguro de eliminar la obra "${editProject.name}"?`)) {
                    onDelete?.(editProject);
                    onClose();
                  }
                }}
                className="gap-1.5 text-xs h-9"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar Obra
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={saving}
              className="text-xs h-9"
            >
              Cancelar
            </Button>

            {step === 1 ? (
              <Button
                type="button"
                onClick={handleNextToStep2}
                className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5 text-xs h-9 font-bold shadow-xs"
              >
                <span>Siguiente: Estructura de la Obra</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="gap-1.5 text-xs h-9"
                  disabled={saving}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Volver a Ficha</span>
                </Button>

                <Button
                  type="button"
                  onClick={handleSaveProject}
                  disabled={saving}
                  className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5 text-xs h-9 font-bold shadow-xs"
                >
                  <Check className="h-4 w-4" />
                  <span>{saving ? "Guardando..." : isEditing ? "Actualizar Obra" : "Crear Obra"}</span>
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
