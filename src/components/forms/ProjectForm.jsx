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
  Building2,
  Plus,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  X,
  AlertTriangle,
  HardHat,
  MapPin,
  Copy,
  CheckCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// Presets limpios para salas técnicas y recintos especiales (sin emojis recargados)
const PRESET_SALAS_TECNICAS = [
  { id: "tgbt", name: "Sala Eléctrica Principal (TGBT)", tag: "Eléctrica" },
  { id: "bombas", name: "Sala de Bombas de Agua Potable", tag: "Sanitaria" },
  { id: "generador", name: "Sala de Grupo Electrógeno", tag: "Fuerza" },
  { id: "conserjeria", name: "Hall Principal / Conserjería", tag: "Acceso" },
  { id: "medidores", name: "Sala de Medidores Eléctricos", tag: "Eléctrica" },
  { id: "rack", name: "Sala de RACK / CCTV / Citofonía", tag: "Comunicaciones" },
  { id: "basuras", name: "Sala de Basuras / Reciclaje", tag: "Servicios" },
  { id: "calderas", name: "Sala de Calderas / Termos", tag: "Clima" },
];

const PRESET_EXTERIORES = [
  { id: "alumbrado", name: "Alumbrado Perimetral Exterior" },
  { id: "empalme", name: "Canalización de Empalme Eléctrico" },
  { id: "camaras", name: "Cámaras de Paso y Ductos Exteriores" },
  { id: "cctv_ext", name: "Postes y Cámaras CCTV Perimetrales" },
];

const TOWER_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

// Generar departamentos: máximo 30 departamentos por piso
function generateDepartmentsForFloor(floorName, count = 8) {
  const match = floorName.match(/Piso\s+(\d+)/i);
  if (!match) return [];
  const floorNum = parseInt(match[1], 10);
  const total = Math.max(0, Math.min(Number(count) || 0, 30));

  return Array.from({ length: total }, (_, i) => {
    const depNum = i + 1;
    const formatted = depNum < 10 ? `0${depNum}` : `${depNum}`;
    return `${floorNum}${formatted}`;
  });
}

// Generar pisos: no más de 15 pisos
function generateTowerFloorList(tower) {
  const list = [];
  const start = Math.max(1, Math.min(15, Number(tower.startFloor) || 1));
  const end = Math.max(start, Math.min(15, Number(tower.endFloor) || 1));

  for (let i = start; i <= end; i++) {
    list.push(`Piso ${i}`);
  }
  if (tower.hasCubierta) {
    list.push("Cubierta");
  }
  return list;
}

// Proyectar siempre hasta 30 casillas de departamentos disponibles por piso
function getCandidateDepartments(floorName, existingSelected = []) {
  const match = floorName.match(/Piso\s+(\d+)/i);
  if (!match) return existingSelected;
  const floorNum = parseInt(match[1], 10);

  let maxSuffix = 0;
  (existingSelected || []).forEach((dep) => {
    const matchDep = String(dep).match(/\d+$/);
    if (matchDep) {
      const val = parseInt(matchDep[0], 10);
      const suffix = val % 100;
      if (suffix > maxSuffix) maxSuffix = suffix;
    }
  });

  // Base fija de 30 casillas (o más si hay un depto personalizado superior)
  const baseCount = Math.max(30, maxSuffix);
  const candidates = new Set();
  for (let i = 1; i <= baseCount; i++) {
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
  const endFloor = 15; // No más de 15 pisos
  const hasCubierta = true;
  const defaultDepsCount = 8; // Hasta 30 deptos

  const tower = {
    id: `tower-${index + 1}-${Date.now()}`,
    name: `Torre ${letter}`,
    startFloor,
    endFloor,
    hasCubierta,
    defaultDepsCount,
    departments: {},
  };

  const floors = generateTowerFloorList(tower);
  floors.forEach((f) => {
    tower.departments[f] = f === "Cubierta" ? [] : generateDepartmentsForFloor(f, defaultDepsCount);
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
  const [subterraneoLevels, setSubterraneoLevels] = useState(0);
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

      if (parsedDeps.__towers_config__ && Array.isArray(parsedDeps.__towers_config__)) {
        // Asegurar que pisos no excedan 15
        const sanitized = parsedDeps.__towers_config__.map((t) => ({
          ...t,
          startFloor: Math.max(1, Math.min(15, Number(t.startFloor) || 1)),
          endFloor: Math.max(1, Math.min(15, Number(t.endFloor) || 15)),
          defaultDepsCount: Math.max(1, Math.min(30, Number(t.defaultDepsCount) || 8)),
        }));
        setTowers(sanitized);
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
            endFloor: Math.min(15, maxFloorNum || 15), // Máximo 15 pisos
            hasCubierta: rawFloors.some((f) => /cubierta|azotea/i.test(f)),
            defaultDepsCount: 8,
            departments: {},
          };

          const tFloors = generateTowerFloorList(t);
          tFloors.forEach((f) => {
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

  // Actualizar torre activa y sincronizar sus pisos (con límite de 15 pisos)
  const updateActiveTower = (field, value) => {
    setTowers((prev) => {
      const next = [...prev];
      if (next[activeTowerIndex]) {
        let parsedVal = value;
        if (field === "startFloor") {
          parsedVal = Math.max(1, Math.min(15, parseInt(value, 10) || 1));
        } else if (field === "endFloor") {
          parsedVal = Math.max(1, Math.min(15, parseInt(value, 10) || 1));
        }

        const updated = {
          ...next[activeTowerIndex],
          [field]: parsedVal,
        };

        if (field === "startFloor" || field === "endFloor" || field === "hasCubierta") {
          const newFloors = generateTowerFloorList(updated);
          const currentDeps = updated.departments || {};
          const syncedDeps = {};
          const defaultCount = updated.defaultDepsCount || 8;

          newFloors.forEach((f) => {
            if (f === "Cubierta") {
              syncedDeps[f] = currentDeps[f] || [];
            } else if (currentDeps[f] && currentDeps[f].length > 0) {
              syncedDeps[f] = currentDeps[f];
            } else {
              syncedDeps[f] = generateDepartmentsForFloor(f, defaultCount);
            }
          });
          updated.departments = syncedDeps;
        }

        next[activeTowerIndex] = updated;
      }
      return next;
    });
  };

  // Actualizar cantidad de departamentos por piso para toda la torre activa (hasta 30)
  const updateTowerDefaultDeps = (countVal) => {
    const count = Math.min(30, Math.max(1, parseInt(countVal, 10) || 1));
    setTowers((prev) => {
      const next = [...prev];
      if (next[activeTowerIndex]) {
        const tower = { ...next[activeTowerIndex] };
        tower.defaultDepsCount = count;
        const towerDeps = { ...(tower.departments || {}) };
        const towerFloors = generateTowerFloorList(tower);

        towerFloors.forEach((floor) => {
          if (floor !== "Cubierta") {
            towerDeps[floor] = generateDepartmentsForFloor(floor, count);
          }
        });

        tower.departments = towerDeps;
        next[activeTowerIndex] = tower;
      }
      return next;
    });
  };

  // Departamentos del piso activo
  const activeFloorDeps = (activeTower?.departments && activeTower.departments[activeFloorName]) || [];
  const candidateDeps = useMemo(() => {
    return getCandidateDepartments(activeFloorName, activeFloorDeps);
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

  // Aplicar cantidad exacta de departamentos en el piso activo (hasta 30)
  const applyPresetCount = (count) => {
    const deps = generateDepartmentsForFloor(activeFloorName, Math.min(30, count));
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

    setCopiedFeedback(`¡Se aplicaron ${currentCount} dptos a todos los pisos de ${activeTower.name}!`);
    setTimeout(() => setCopiedFeedback(""), 3500);
  };

  // Añadir departamento personalizado
  const handleAddCustomDepto = () => {
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

    // Asegurar que al entrar al paso 2 se seleccione un piso habitacional (Piso 1) y NO Cubierta
    const currentFloors = generateTowerFloorList(activeTower);
    const firstResidential = currentFloors.find((f) => f !== "Cubierta") || "Piso 1";
    setActiveFloorName(firstResidential);
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
        description: form.description.trim() || `Instalaciones eléctricas de obra ${form.name.trim()}`,
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

  // Generar lista de pisos ordenada de arriba a abajo (Cubierta, Piso 15 ... Piso 1)
  const currentTowerFloors = useMemo(() => {
    const raw = generateTowerFloorList(activeTower);
    const hasCub = raw.includes("Cubierta");
    const numericFloors = raw
      .filter((f) => f !== "Cubierta")
      .sort((a, b) => {
        const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
        const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
        return nb - na; // Orden descendente (Piso 15 ... Piso 1)
      });

    return hasCub ? ["Cubierta", ...numericFloors] : numericFloors;
  }, [activeTower]);

  return (
    <Dialog open={open} onOpenChange={(val) => !saving && !val && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-0 sm:max-w-4xl bg-white shadow-2xl border border-slate-200/90 rounded-3xl">
        {/* LÍNEA DECORATIVA SUPERIOR */}
        <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 shrink-0" />

        {/* ENCABEZADO MODERNO Y LIMPIO */}
        <DialogHeader className="border-b border-slate-200/80 bg-slate-50/70 px-6 sm:px-8 py-3.5 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-xs shrink-0">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  {isEditing ? "Editar Configuración de Obra" : "Registrar Nueva Obra"}
                </DialogTitle>
                <p className="text-xs text-slate-500">
                  {step === 1
                    ? "Paso 1: Ficha contractual, plazos y responsables"
                    : "Paso 2: Estructura por torre, pisos y departamentos"}
                </p>
              </div>
            </div>

            {/* Stepper visual segmentado */}
            <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  step === 1
                    ? "bg-white text-slate-900 shadow-xs font-bold"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded text-[10px] flex items-center justify-center font-bold",
                    step === 1 ? "bg-orange-500 text-white" : "bg-slate-300 text-slate-600"
                  )}
                >
                  1
                </span>
                <span>Ficha</span>
              </button>

              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

              <button
                type="button"
                onClick={handleNextToStep2}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  step === 2
                    ? "bg-white text-slate-900 shadow-xs font-bold"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded text-[10px] flex items-center justify-center font-bold",
                    step === 2 ? "bg-orange-500 text-white" : "bg-slate-300 text-slate-600"
                  )}
                >
                  2
                </span>
                <span>Estructura</span>
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* ALERTA DE ERROR */}
        {error && (
          <div className="mx-6 sm:mx-8 mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800 animate-in fade-in">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* CONTENIDO CON SCROLL */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-4 scrollbar-thin">
          {/* ===================== PASO 1: ANTECEDENTES ===================== */}
          {step === 1 && (
            <div className="space-y-4 max-w-3xl mx-auto">
              {/* Tarjeta 1: Identificación y Mandante */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4.5 space-y-3.5 shadow-2xs">
                <div className="pb-1 border-b border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Identificación del Proyecto y Mandante
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1">
                      Nombre de la Obra <span className="text-orange-500">*</span>
                    </Label>
                    <Input
                      value={form.name}
                      onChange={(e) => updateFormField("name", e.target.value)}
                      placeholder="Ej: Edificio Parque Central"
                      className="h-10 text-xs sm:text-sm rounded-xl bg-slate-50/70 border-slate-200 focus:bg-white focus:border-orange-500 font-medium"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1">
                      Cliente / Constructora Mandante <span className="text-orange-500">*</span>
                    </Label>
                    <Input
                      value={form.client}
                      onChange={(e) => updateFormField("client", e.target.value)}
                      placeholder="Ej: Constructora Besalco"
                      className="h-10 text-xs sm:text-sm rounded-xl bg-slate-50/70 border-slate-200 focus:bg-white focus:border-orange-500 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Ubicación / Dirección de la Faena <span className="text-orange-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      value={form.address}
                      onChange={(e) => updateFormField("address", e.target.value)}
                      placeholder="Ej: Av. Las Condes 12345, Santiago"
                      className="h-10 text-xs sm:text-sm rounded-xl bg-slate-50/70 border-slate-200 focus:bg-white focus:border-orange-500 pl-8.5 font-medium"
                    />
                    <MapPin className="h-4 w-4 text-slate-400 absolute left-2.5 top-3 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Tarjeta 2: Equipo Responsable */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4.5 space-y-3.5 shadow-2xs">
                <div className="pb-1 border-b border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Equipo Responsable a Cargo
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1">
                      Supervisor Responsable <span className="text-orange-500">*</span>
                    </Label>
                    <Select
                      value={form.supervisor}
                      onValueChange={(v) => updateFormField("supervisor", v)}
                    >
                      <SelectTrigger className="h-10 text-xs sm:text-sm rounded-xl bg-slate-50/70 border-slate-200 focus:bg-white focus:border-orange-500 font-medium">
                        <SelectValue placeholder="Seleccionar supervisor" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                        {supervisors.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            Sin supervisores registrados
                          </SelectItem>
                        ) : (
                          supervisors.map((u) => (
                            <SelectItem key={u.id} value={u.full_name}>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-800">{u.full_name}</span>
                                {u.role === "admin" && (
                                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-orange-200 text-orange-700 bg-orange-50">
                                    Admin
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1">
                      Capataz Responsable <span className="text-orange-500">*</span>
                    </Label>
                    <Select
                      value={form.capataz}
                      onValueChange={(v) => updateFormField("capataz", v)}
                    >
                      <SelectTrigger className="h-10 text-xs sm:text-sm rounded-xl bg-slate-50/70 border-slate-200 focus:bg-white focus:border-orange-500 font-medium">
                        <SelectValue placeholder="Seleccionar capataz" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                        {capataces.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            Sin capataces registrados
                          </SelectItem>
                        ) : (
                          capataces.map((u) => (
                            <SelectItem key={u.id} value={u.full_name}>
                              <div className="flex items-center gap-2">
                                <HardHat className="h-3.5 w-3.5 text-amber-600" />
                                <span className="font-semibold text-slate-800">{u.full_name}</span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Tarjeta 3: Plazos Contractuales y Torres */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4.5 space-y-3.5 shadow-2xs">
                <div className="pb-1 border-b border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Plazos y Alcance General
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1">
                      Fecha de Inicio <span className="text-orange-500">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={form.start_date}
                      onChange={(e) => updateFormField("start_date", e.target.value)}
                      className="h-10 text-xs sm:text-sm rounded-xl bg-slate-50/70 border-slate-200 focus:bg-white focus:border-orange-500 font-medium"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1">
                      Término Estimado <span className="text-orange-500">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={form.end_date}
                      onChange={(e) => updateFormField("end_date", e.target.value)}
                      className="h-10 text-xs sm:text-sm rounded-xl bg-slate-50/70 border-slate-200 focus:bg-white focus:border-orange-500 font-medium"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1">
                      Cantidad de Torres <span className="text-orange-500">*</span>
                    </Label>
                    <Select
                      value={String(form.tower_count || 1)}
                      onValueChange={(val) => updateFormField("tower_count", val)}
                    >
                      <SelectTrigger className="h-10 text-xs sm:text-sm rounded-xl bg-slate-50/70 border-slate-200 focus:bg-white focus:border-orange-500 font-medium">
                        <SelectValue placeholder="Torres" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                          <SelectItem key={num} value={String(num)}>
                            {num} {num === 1 ? "Torre" : "Torres"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Descripción o Alcance de la Obra <span className="text-orange-500">*</span>
                  </Label>
                  <Input
                    value={form.description}
                    onChange={(e) => updateFormField("description", e.target.value)}
                    placeholder="Ej: Instalaciones eléctricas en losa, tabiquería, salas técnicas y corrientes débiles"
                    className="h-10 text-xs sm:text-sm rounded-xl bg-slate-50/70 border-slate-200 focus:bg-white focus:border-orange-500 font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ===================== PASO 2: ESTRUCTURA INTERACTIVA ===================== */}
          {step === 2 && (
            <div className="space-y-3.5">
              {/* Barra de pestañas limpia (sin iconos recargados) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setStep2Tab("torres")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg transition-all cursor-pointer",
                    step2Tab === "torres"
                      ? "bg-white text-orange-950 shadow-2xs font-extrabold border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <span>Torres y Deptos</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-mono">
                    {towers.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep2Tab("subterraneos")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg transition-all cursor-pointer",
                    step2Tab === "subterraneos"
                      ? "bg-white text-blue-950 shadow-2xs font-extrabold border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <span>Subterráneos</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-mono">
                    {selectedSubterraneos.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep2Tab("salas")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg transition-all cursor-pointer",
                    step2Tab === "salas"
                      ? "bg-white text-amber-950 shadow-2xs font-extrabold border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <span>Salas Técnicas</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-mono">
                    {selectedAreasComunes.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep2Tab("exteriores")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg transition-all cursor-pointer",
                    step2Tab === "exteriores"
                      ? "bg-white text-emerald-950 shadow-2xs font-extrabold border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <span>Exteriores</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-mono">
                    {selectedExteriores.length}
                  </span>
                </button>
              </div>

              {/* ===================== SUBTAB 1: TORRES Y DEPARTAMENTOS ===================== */}
              {step2Tab === "torres" && (
                <div className="space-y-3">
                  {/* Selector de Torres si hay más de 1 */}
                  {towers.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-700 pl-1">Torre activa:</span>
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
                              const firstRes = fList.find((f) => f !== "Cubierta") || "Piso 1";
                              setActiveFloorName(firstRes);
                            }}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                              isActive
                                ? "bg-orange-500 text-white border-orange-600 shadow-2xs"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                            )}
                          >
                            <span>{tower.name}</span>
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.2 rounded font-mono",
                                isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                              )}
                            >
                              {tDeps} dptos
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* BARRA DE CONFIGURACIÓN DE LA TORRE ACTIVA (Nombre, Pisos máx 15, Deptos hasta 30) */}
                  <div className="bg-slate-50/90 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Nombre de la torre */}
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs font-bold text-slate-700">Nombre:</Label>
                        <Input
                          value={activeTower.name}
                          onChange={(e) => updateActiveTower("name", e.target.value)}
                          className="h-8.5 w-28 text-xs bg-white font-bold rounded-lg border-slate-200"
                          placeholder="Torre A"
                        />
                      </div>

                      {/* Rango de pisos: hasta 15 pisos máximo */}
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs font-bold text-slate-700">Pisos:</Label>
                        <Input
                          type="number"
                          min="1"
                          max="15"
                          value={activeTower.startFloor}
                          onChange={(e) => updateActiveTower("startFloor", e.target.value)}
                          className="h-8.5 w-13 text-xs bg-white text-center font-bold rounded-lg border-slate-200"
                        />
                        <span className="text-slate-400 font-bold">al</span>
                        <Input
                          type="number"
                          min="1"
                          max="15"
                          value={activeTower.endFloor}
                          onChange={(e) => updateActiveTower("endFloor", e.target.value)}
                          className="h-8.5 w-13 text-xs bg-white text-center font-bold rounded-lg border-slate-200"
                        />
                        <span className="text-[10.5px] text-slate-400 font-medium">(máx 15)</span>
                      </div>

                      {/* Deptos por piso: hasta 30 */}
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs font-bold text-slate-700">Deptos/piso:</Label>
                        <Input
                          type="number"
                          min="1"
                          max="30"
                          value={activeTower.defaultDepsCount || 8}
                          onChange={(e) => updateTowerDefaultDeps(e.target.value)}
                          className="h-8.5 w-14 text-xs bg-white text-center font-bold rounded-lg border-slate-200"
                        />
                        <span className="text-[10.5px] text-slate-400 font-medium">(hasta 30)</span>
                      </div>

                      {/* Checkbox cubierta */}
                      <label className="flex items-center gap-1.5 cursor-pointer select-none bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={activeTower.hasCubierta}
                          onChange={(e) => updateActiveTower("hasCubierta", e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                        />
                        <span className="font-semibold text-slate-700 text-xs">Cubierta técnica</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">Total en {activeTower.name}:</span>
                      <Badge className="bg-orange-500 hover:bg-orange-600 text-white font-mono text-xs px-2.5 py-0.5 rounded-md">
                        {Object.values(activeTower.departments || {}).reduce((s, a) => s + a.length, 0)} dptos
                      </Badge>
                    </div>
                  </div>

                  {/* Feedback de copia a todos los pisos */}
                  {copiedFeedback && (
                    <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in shadow-2xs">
                      <CheckCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>{copiedFeedback}</span>
                    </div>
                  )}

                  {/* ESTUDIO: 2 COLUMNAS (PISOS A LA IZQUIERDA / GRILLA INTERACTIVA A LA DERECHA) */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                    {/* Columna Izquierda: Lista de Pisos (limpia, sin círculos verdes) */}
                    <div className="md:col-span-4 space-y-1.5">
                      <div className="flex items-center justify-between px-1">
                        <Label className="text-xs font-bold text-slate-800">
                          Pisos de {activeTower.name}
                        </Label>
                        <span className="text-[10.5px] text-slate-400 font-mono">
                          {currentTowerFloors.length} niveles
                        </span>
                      </div>

                      <div className="border border-slate-200 rounded-xl p-1.5 h-[310px] overflow-y-auto space-y-1 bg-white scrollbar-thin shadow-2xs">
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
                                "w-full flex items-center justify-between text-xs py-2 px-3 rounded-lg border transition-all text-left cursor-pointer",
                                isActive
                                  ? "bg-orange-50 border-orange-400 text-orange-950 font-bold shadow-2xs ring-1 ring-orange-300/40"
                                  : "border-slate-100 hover:bg-slate-50 text-slate-700 font-medium"
                              )}
                            >
                              <span>{floor}</span>

                              {isCubierta ? (
                                <span className="text-[10px] text-slate-400 italic">Azotea técnica</span>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "text-[10px] px-1.5 py-0.2 font-mono font-bold rounded border",
                                    depsCount > 0
                                      ? "bg-orange-100/70 text-orange-900 border-orange-200"
                                      : "bg-slate-100 text-slate-400 border-slate-200"
                                  )}
                                >
                                  {depsCount} dptos
                                </Badge>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Columna Derecha: Grilla de Departamentos (hasta 30 por piso) */}
                    <div className="md:col-span-8 space-y-1.5">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-xs font-bold text-slate-800">
                            Departamentos en
                          </Label>
                          <span className="text-orange-800 font-bold bg-orange-100/80 px-2 py-0.5 rounded text-xs border border-orange-200">
                            {activeFloorName}
                          </span>
                        </div>

                        {/* Presets rápidos hasta 30 */}
                        {activeFloorName !== "Cubierta" && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400 mr-0.5 hidden sm:inline">Fijar:</span>
                            {[4, 6, 8, 10, 12, 16, 20, 24, 30].map((num) => (
                              <button
                                key={num}
                                type="button"
                                onClick={() => applyPresetCount(num)}
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[10px] font-bold transition-all border cursor-pointer",
                                  activeFloorDeps.length === num
                                    ? "bg-orange-500 text-white border-orange-600 shadow-2xs"
                                    : "bg-white border-slate-200 text-slate-700 hover:bg-orange-50 hover:border-orange-300"
                                )}
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
                        <div className="border border-dashed border-slate-200 rounded-xl h-[310px] flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 shadow-2xs">
                          <p className="text-xs font-bold text-slate-800">Cubierta / Azotea Técnica</p>
                          <p className="text-[11px] text-slate-500 max-w-xs mt-1 leading-relaxed">
                            Este nivel no lleva departamentos habitacionales. Sus partidas se asignan como recinto global o sala técnica.
                          </p>
                        </div>
                      ) : (
                        <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/40 h-[310px] flex flex-col justify-between shadow-2xs">
                          {/* Grilla visual de departamentos: 6 columnas para hasta 30 deptos */}
                          <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin space-y-2">
                            <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                              <span>Toca las casillas para activar o desactivar:</span>
                              <span className="font-bold text-orange-800 bg-white px-2 py-0.5 rounded border border-orange-200 shadow-2xs">
                                {activeFloorDeps.length} de {candidateDeps.length} activos
                              </span>
                            </div>

                            {/* Grilla limpia sin checkmarks invasivos */}
                            <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5 pt-0.5">
                              {candidateDeps.map((dep) => {
                                const isSelected = activeFloorDeps.includes(dep);
                                return (
                                  <button
                                    key={dep}
                                    type="button"
                                    onClick={() => toggleDepartment(dep)}
                                    className={cn(
                                      "h-8.5 rounded-lg border text-xs font-mono font-bold transition-all flex items-center justify-center cursor-pointer select-none",
                                      isSelected
                                        ? "bg-orange-500 text-white border-orange-600 shadow-2xs scale-[1.02]"
                                        : "bg-white border-slate-200 text-slate-700 hover:border-orange-300 hover:bg-orange-50/60"
                                    )}
                                  >
                                    <span>{dep}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Barra de acciones al pie de la grilla */}
                          <div className="pt-2 border-t border-slate-200 space-y-1.5 shrink-0">
                            <div className="flex gap-2">
                              <Input
                                value={customDeptoInput}
                                onChange={(e) => setCustomDeptoInput(e.target.value)}
                                placeholder={`Agregar depto especial (ej: ${activeFloorName.replace(/\D/g, "")}31, Penthouse)`}
                                className="h-8.5 text-xs bg-white rounded-lg border-slate-200"
                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCustomDepto())}
                              />
                              <Button
                                type="button"
                                onClick={handleAddCustomDepto}
                                variant="outline"
                                size="sm"
                                className="h-8.5 text-xs px-3 font-bold shrink-0 bg-white rounded-lg border-slate-200 hover:bg-orange-50 hover:text-orange-900 shadow-2xs"
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Añadir
                              </Button>
                            </div>

                            <Button
                              type="button"
                              onClick={copyToAllFloorsOfTower}
                              variant="outline"
                              size="sm"
                              className="w-full h-8.5 text-xs font-bold border-orange-200 bg-orange-50/80 text-orange-900 hover:bg-orange-100 hover:border-orange-300 gap-1.5 rounded-lg shadow-2xs cursor-pointer transition-all"
                            >
                              <Copy className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                              <span>
                                Copiar distribución ({activeFloorDeps.length} dptos) a TODOS los pisos de {activeTower.name}
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
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
                    <div>
                      <Label className="text-xs font-bold text-slate-800 block">
                        Niveles de Subterráneo
                      </Label>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Selecciona cuántos niveles de estacionamientos y bodegas tiene el edificio:
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {[0, 1, 2, 3, 4, 5].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => handleSelectSubterraneoLevels(lvl)}
                          className={cn(
                            "px-3.5 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer shadow-2xs",
                            subterraneoLevels === lvl
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          {lvl === 0 ? "Sin subterráneos" : `${lvl} ${lvl === 1 ? "Nivel (-1)" : `Niveles (-1 al -${lvl})`}`}
                        </button>
                      ))}
                    </div>

                    {selectedSubterraneos.length > 0 && (
                      <div className="pt-2 space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700 block">
                          Niveles activos ({selectedSubterraneos.length}):
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {selectedSubterraneos.map((sub) => (
                            <div
                              key={sub}
                              className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs font-medium"
                            >
                              <span className="text-slate-800 font-semibold">{sub}</span>
                              <button
                                type="button"
                                onClick={() => toggleSubterraneoItem(sub)}
                                className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <Input
                        value={customSubterraneo}
                        onChange={(e) => setCustomSubterraneo(e.target.value)}
                        placeholder="Ej: Subterráneo -4 (Bodegas Generales)"
                        className="h-8.5 text-xs bg-white rounded-lg border-slate-200"
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomSubterraneoItem())}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addCustomSubterraneoItem}
                        className="h-8.5 text-xs font-bold shrink-0 rounded-lg border-slate-200 hover:bg-slate-50"
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
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
                    <div>
                      <Label className="text-xs font-bold text-slate-800 block">
                        Salas Técnicas y Recintos Especiales
                      </Label>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Toca las salas que aplican para este proyecto:
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
                              "flex items-center justify-between p-2.5 rounded-lg border text-xs font-semibold text-left transition-all cursor-pointer",
                              isSelected
                                ? "bg-amber-50/70 border-amber-300 text-amber-950 ring-1 ring-amber-300/40"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                            )}
                          >
                            <div>
                              <p className="font-bold text-slate-800">{sala.name}</p>
                              <span className="text-[10px] text-slate-400 font-normal">{sala.tag}</span>
                            </div>
                            <div
                              className={cn(
                                "w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold transition-colors",
                                isSelected
                                  ? "bg-amber-500 text-white"
                                  : "border border-slate-300 text-transparent"
                              )}
                            >
                              ✓
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <Input
                        value={customAreaComun}
                        onChange={(e) => setCustomAreaComun(e.target.value)}
                        placeholder="Ej: Sala de Calderas / Termos Solares"
                        className="h-8.5 text-xs bg-white rounded-lg border-slate-200"
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomAreaComun())}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addCustomAreaComun}
                        className="h-8.5 text-xs font-bold shrink-0 rounded-lg border-slate-200 hover:bg-slate-50"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Añadir
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ===================== SUBTAB 4: EXTERIORES Y VERTICALES ===================== */}
              {step2Tab === "exteriores" && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
                    <div>
                      <Label className="text-xs font-bold text-slate-800 block">
                        Sectores Exteriores y Perimetrales
                      </Label>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Selecciona las partidas que aplican en exteriores y shaft verticales:
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
                              "flex items-center justify-between p-2.5 rounded-lg border text-xs font-semibold text-left transition-all cursor-pointer",
                              isSelected
                                ? "bg-emerald-50/70 border-emerald-300 text-emerald-950 ring-1 ring-emerald-300/40"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                            )}
                          >
                            <span className="font-bold text-slate-800">{ext.name}</span>
                            <div
                              className={cn(
                                "w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold transition-colors",
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

                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <Input
                        value={customExterior}
                        onChange={(e) => setCustomExterior(e.target.value)}
                        placeholder="Ej: Urbanización Exterior / Paisajismo"
                        className="h-8.5 text-xs bg-white rounded-lg border-slate-200"
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomExterior())}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addCustomExterior}
                        className="h-8.5 text-xs font-bold shrink-0 rounded-lg border-slate-200 hover:bg-slate-50"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Añadir
                      </Button>
                    </div>
                  </div>

                  {/* Verticales / Shafts */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 shadow-2xs">
                    <Label className="text-xs font-bold text-slate-800 block">
                      Verticales / Shafts del edificio
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50/70 cursor-pointer text-xs hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={verticalEL}
                          onChange={(e) => setVerticalEL(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                        />
                        <span className="font-bold text-slate-800">Fuerza (EL)</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50/70 cursor-pointer text-xs hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={verticalCD}
                          onChange={(e) => setVerticalCD(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                        />
                        <span className="font-bold text-slate-800">Corrientes Débiles (CD)</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50/70 cursor-pointer text-xs hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={verticalTC}
                          onChange={(e) => setVerticalTC(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                        />
                        <span className="font-bold text-slate-800">Telecomunicaciones (TC)</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* ===================== RESUMEN EN VIVO LIMPIO ===================== */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                  <span className="font-bold text-slate-900">Resumen:</span>
                  <span>{summary.towersCount} {summary.towersCount === 1 ? "Torre" : "Torres"}</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-bold text-orange-700">{summary.totalDepartmentsCount} Deptos en total</span>
                  <span className="text-slate-300">•</span>
                  <span>{summary.subterraneosCount} Subterráneos</span>
                  <span className="text-slate-300">•</span>
                  <span>{summary.salasCount} Salas Técnicas</span>
                </div>

                <Badge className="bg-emerald-600 text-white font-mono text-[10.5px] px-2.5 py-0.5">
                  Estructura Configurada
                </Badge>
              </div>
            </div>
          )}
        </div>

        {/* PIE DE PÁGINA CON BOTONES MODERNOS Y CÓMODOS */}
        <DialogFooter className="border-t border-slate-200/80 bg-slate-50/90 px-6 sm:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div>
            {isEditing && canDelete && step === 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (window.confirm(`¿Estás seguro de eliminar la obra "${editProject.name}"?`)) {
                    onDelete?.(editProject);
                    onClose();
                  }
                }}
                className="gap-1.5 text-xs h-10 px-4 rounded-xl text-rose-700 border-rose-200 bg-rose-50/80 hover:bg-rose-100 font-bold transition-all cursor-pointer shadow-2xs"
              >
                <Trash2 className="h-4 w-4 text-rose-600" />
                <span>Eliminar Obra</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={saving}
              className="text-xs h-10 px-4 rounded-xl border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold transition-all cursor-pointer shadow-2xs"
            >
              Cancelar
            </Button>

            {step === 1 ? (
              <Button
                type="button"
                onClick={handleNextToStep2}
                className="bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white gap-2 text-xs sm:text-sm h-10 px-5 rounded-xl font-bold shadow-md shadow-orange-500/25 hover:shadow-lg hover:shadow-orange-500/30 transition-all cursor-pointer active:scale-[0.98]"
              >
                <span>Siguiente: Estructura de la Obra</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="gap-1.5 text-xs h-10 px-4 rounded-xl border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold transition-all cursor-pointer shadow-2xs"
                  disabled={saving}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Volver a Ficha</span>
                </Button>

                <Button
                  type="button"
                  onClick={handleSaveProject}
                  disabled={saving}
                  className="bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white gap-2 text-xs sm:text-sm h-10 px-6 rounded-xl font-bold shadow-md shadow-orange-500/25 hover:shadow-lg hover:shadow-orange-500/30 transition-all cursor-pointer active:scale-[0.98]"
                >
                  <Check className="h-4 w-4" />
                  <span>{saving ? "Guardando..." : isEditing ? "Guardar Cambios" : "Crear y Configurar Obra"}</span>
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
