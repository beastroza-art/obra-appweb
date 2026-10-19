import React, { useEffect, useState, useMemo, useRef } from "react";
import { useWakeLock } from "@/hooks/useWakeLock";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  X,
  Layers,
  Building2,
  Car,
  Trees,
  Zap,
  ArrowUpDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/PermissionsContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { RAW_DEFAULT_ACTIVITIES } from "@/constants/defaultActivities";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { AutocompleteSelect } from "@/components/ui/autocomplete-select";
import {
  SCOPE_TYPES,
  MEASUREMENT_UNITS,
  isVerticalScope,
  normalizeScopeTypeValue,
} from "@/constants/activityScope";
import { sortFloors } from "@/utils/floors";

const ALL_FLOOR_OPTIONS = [
  { label: "Piso 1", value: "Piso 1" },
  { label: "Piso 2", value: "Piso 2" },
  { label: "Piso 3", value: "Piso 3" },
  { label: "Piso 4", value: "Piso 4" },
  { label: "Piso 5", value: "Piso 5" },
  { label: "Piso 6", value: "Piso 6" },
  { label: "Piso 7", value: "Piso 7" },
  { label: "Piso 8", value: "Piso 8" },
  { label: "Piso 9", value: "Piso 9" },
  { label: "Piso 10", value: "Piso 10" },
  { label: "Piso 11", value: "Piso 11" },
  { label: "Piso 12", value: "Piso 12" },
  { label: "Piso 13", value: "Piso 13" },
  { label: "Piso 14", value: "Piso 14" },
  { label: "Piso 15", value: "Piso 15" },
  { label: "Piso 16", value: "Piso 16" },
  { label: "Piso 17", value: "Piso 17" },
  { label: "Piso 18", value: "Piso 18" },
  { label: "Piso 19", value: "Piso 19" },
  { label: "Piso 20", value: "Piso 20" },
  { label: "Piso 21", value: "Piso 21" },
  { label: "Piso 22", value: "Piso 22" },
  { label: "Piso 23", value: "Piso 23" },
  { label: "Piso 24", value: "Piso 24" },
  { label: "Piso 25", value: "Piso 25" },
  { label: "Piso 26", value: "Piso 26" },
  { label: "Piso 27", value: "Piso 27" },
  { label: "Piso 28", value: "Piso 28" },
  { label: "Piso 29", value: "Piso 29" },
  { label: "Piso 30", value: "Piso 30" },
  { label: "Subterráneo 1", value: "Subterráneo 1" },
  { label: "Subterráneo 2", value: "Subterráneo 2" },
  { label: "Subterráneo 3", value: "Subterráneo 3" },
  { label: "Subterráneo 4", value: "Subterráneo 4" },
  { label: "Subterráneo 5", value: "Subterráneo 5" },
  { label: "Cubierta", value: "Cubierta" },
  { label: "Exteriores", value: "Exteriores" },
  { label: "Áreas Comunes", value: "Áreas Comunes" },
];

const EMPTY_MEMBER = { name: "", role: "" };
const TOWER_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const ACTIVITY_OPTIONS = RAW_DEFAULT_ACTIVITIES;

const INITIAL_FORM = {
  project: "",
  scope_type: SCOPE_TYPES.PISO,
  tower: "",
  floor: "",
  departments: "",
  activity: "",
  start_date: "",
  end_date: "",
  planned_qty: "",
  unit: "und",
  crew_name: "",
  status: "pendiente",
  release_status: "no_liberado",
  restrictions: "",
  observations: "",
  floors: [],
  floor_planned_qtys: {},
};

function getTowerOnlyOptions(towerCount) {
  const count = Number.isInteger(Number(towerCount)) ? Number(towerCount) : 1;
  return TOWER_LETTERS.slice(0, Math.min(Math.max(count, 1), TOWER_LETTERS.length)).map(
    (letter) => `Torre ${letter}`
  );
}

function getFormFromEditItem(editItem) {
  const scopeType = normalizeScopeTypeValue(editItem.scope_type);

  return {
    project: editItem.project || "",
    scope_type: scopeType,
    tower: editItem.tower || "",
    floor: editItem.floor || "",
    departments: editItem.departments || "",
    activity: editItem.activity || "",
    start_date: editItem.start_date || "",
    end_date: editItem.end_date || "",
    planned_qty: editItem.planned_qty ?? "",
    unit: editItem.unit || "und",
    crew_name: editItem.crew_name || "",
    status: editItem.status || "pendiente",
    release_status: editItem.release_status || "no_liberado",
    restrictions: editItem.restrictions || "",
    observations: editItem.observations || "",
    floors:
      (scopeType === SCOPE_TYPES.PISO || scopeType === "multiples_pisos") && editItem.floor
        ? editItem.floor.split(",").map((f) => f.trim())
        : ["departamento", "pasillo", "espacios_comunes", "salas_asignables", "bodegas"].includes(scopeType) && editItem.floor
          ? [editItem.floor]
          : [],
  };
}

function getCrewMembersFromEditItem(editItem) {
  if (!editItem?.crew_members) return [{ ...EMPTY_MEMBER }];

  if (Array.isArray(editItem.crew_members)) {
    return editItem.crew_members.length > 0
      ? editItem.crew_members
      : [{ ...EMPTY_MEMBER }];
  }

  try {
    const parsed = JSON.parse(editItem.crew_members);
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : [{ ...EMPTY_MEMBER }];
  } catch {
    return [{ ...EMPTY_MEMBER }];
  }
}

function normalizeCatalogValue(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getCatalogOptions(values) {
  const optionsByKey = new Map();

  values.forEach((value) => {
    const cleanValue = String(value || "").trim().replace(/\s+/g, " ");
    const key = normalizeCatalogValue(cleanValue);

    if (key && !optionsByKey.has(key)) {
      optionsByKey.set(key, cleanValue);
    }
  });

  return Array.from(optionsByKey.values());
}

function findCatalogConflict(value, options) {
  const cleanValue = String(value || "").trim().replace(/\s+/g, " ");
  const key = normalizeCatalogValue(cleanValue);

  if (!key) return null;

  const existing = options.find((option) => normalizeCatalogValue(option) === key);
  if (!existing || existing === cleanValue) return null;

  return existing;
}

export default function MasterItemForm({
  open,
  onClose,
  onSave,
  onSaveAndLog,
  editItem,
  projects = [],
}) {
  const { hasAccessToProject, userRole, isAdmin } = usePermissions();
  const queryClient = useQueryClient();

  const { data: dbActivities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => api.get("/activities"),
  });

  const activityOptions = useMemo(() => {
    if (Array.isArray(dbActivities) && dbActivities.length > 0) {
      return dbActivities.map((a) => (typeof a === "string" ? a : a.name));
    }
    return RAW_DEFAULT_ACTIVITIES;
  }, [dbActivities]);

  const [quickActivityOpen, setQuickActivityOpen] = useState(false);
  const [quickCategory, setQuickCategory] = useState("EL");
  const [quickName, setQuickName] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState("");

  const handleQuickAddActivity = async (e) => {
    if (e) e.preventDefault();
    if (!quickName.trim()) {
      setQuickError("El nombre de la actividad es obligatorio.");
      return;
    }
    try {
      setQuickLoading(true);
      setQuickError("");
      const res = await api.post("/activities", {
        category: quickCategory,
        name: quickName.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ["activities"] });
      updateFormField("activity", res.name);
      setQuickActivityOpen(false);
      setQuickName("");
    } catch (err) {
      setQuickError(err.message || "Error al registrar la actividad.");
    } finally {
      setQuickLoading(false);
    }
  };

  const isEditingMultiFloor = editItem && (
    editItem.scope_type === "multiples_pisos" ||
    editItem.parent_id !== null
  );

  const { data: allItems = [] } = useQuery({
    queryKey: ["masterItems"],
    queryFn: () => api.get("/master-items"),
  });

  const { data: projectWorkers = [] } = useQuery({
    queryKey: ["projectWorkers"],
    queryFn: () => api.get("/project-workers"),
  });

  const filteredProjects =
    userRole === "admin"
      ? projects
      : projects.filter((project) => hasAccessToProject(project.name));

  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [crewMembers, setCrewMembers] = useState([{ ...EMPTY_MEMBER }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasRestriction, setHasRestriction] = useState(false);

  // Macro-Zone states
  const [zoneType, setZoneType] = useState("torre"); // 'torre' | 'subterraneo' | 'exterior' | 'comun' | 'vertical'
  const [towerScopeMode, setTowerScopeMode] = useState("departamento"); // 'departamento' | 'pasillo'
  const [verticalSubtype, setVerticalSubtype] = useState(SCOPE_TYPES.VERTICAL_EL);
  const [floorSelectionMode, setFloorSelectionMode] = useState("single");

  const [selectedSubterraneo, setSelectedSubterraneo] = useState("");
  const [customSubterraneo, setCustomSubterraneo] = useState("");
  const [isCustomSubterraneo, setIsCustomSubterraneo] = useState(false);

  const [selectedExterior, setSelectedExterior] = useState("");
  const [customExterior, setCustomExterior] = useState("");
  const [isCustomExterior, setIsCustomExterior] = useState(false);

  const [selectedAreaComun, setSelectedAreaComun] = useState("");
  const [customAreaComun, setCustomAreaComun] = useState("");
  const [isCustomAreaComun, setIsCustomAreaComun] = useState(false);

  const [draftRestored, setDraftRestored] = useState(false);
  const isInitializedRef = useRef(false);

  // Prevent tablet screen from sleeping while editing an item
  useWakeLock(open);

  const draftKey = editItem
    ? `draft_master_item_edit_${editItem.id}`
    : "draft_master_item_create";

  const currentProjectWorkers = projectWorkers.filter(
    (w) => w.project === form.project
  );
  const uniqueCrewNames = getCatalogOptions(allItems.map((i) => i.crew_name));
  const crewCatalogConflict = findCatalogConflict(form.crew_name, uniqueCrewNames);

  const selectedProjectObj = projects.find((p) => p.name === form.project);

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

  const towerOnlyOptions = useMemo(() => {
    return getTowerOnlyOptions(selectedProjectObj?.tower_count);
  }, [selectedProjectObj]);

  const isTowerValid = !form.tower || towerOnlyOptions.includes(form.tower);
  const isActivityValid = !form.activity || activityOptions.includes(form.activity);

  const projectTowerFloors = useMemo(() => {
    if (selectedProjectObj) {
      const pFloors = safeParseJson(selectedProjectObj.floors, []);
      const valid = pFloors.filter(
        (f) => !/Subterr[aá]neo/i.test(f) && !/Exterior/i.test(f) && !/Comun/i.test(f)
      );
      if (valid.length > 0) return [...valid].sort(sortFloors);
    }
    return ALL_FLOOR_OPTIONS
      .filter((f) => !/Subterr[aá]neo/i.test(f.value) && f.value !== "Exteriores" && f.value !== "Áreas Comunes")
      .map((f) => f.value);
  }, [selectedProjectObj]);

  const projectSubterraneos = useMemo(() => {
    if (selectedProjectObj) {
      const pSubs = safeParseJson(selectedProjectObj.subterraneos, []);
      if (Array.isArray(pSubs) && pSubs.length > 0) return pSubs;
    }
    return ["Subterráneo 1", "Subterráneo 2"];
  }, [selectedProjectObj]);

  const projectExteriores = useMemo(() => {
    if (selectedProjectObj) {
      const pExts = safeParseJson(selectedProjectObj.exteriores, []);
      if (Array.isArray(pExts) && pExts.length > 0) return pExts;
    }
    return ["Canalización de Empalme", "Alumbrado Exterior", "Patios y Urbanización"];
  }, [selectedProjectObj]);

  const projectAreasComunes = useMemo(() => {
    if (selectedProjectObj) {
      const pComs = safeParseJson(selectedProjectObj.areas_comunes, []);
      if (Array.isArray(pComs) && pComs.length > 0) return pComs;
    }
    return [
      "Sala Eléctrica Principal (TGBT)",
      "Sala de Bombas",
      "Sala de Grupo Electrógeno",
      "Conserjería y Control",
      "Hall de Acceso",
    ];
  }, [selectedProjectObj]);

  const deptoOptions = useMemo(() => {
    if (selectedProjectObj && form.floors?.[0]) {
      const floorDeps = safeParseJson(selectedProjectObj.departments, {})[form.floors[0]] || [];
      return [...floorDeps]
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
        .map((d) => ({ label: String(d), value: String(d) }));
    }
    return [];
  }, [selectedProjectObj, form.floors]);

  const handleZoneChange = (newZone) => {
    if (editItem) return;
    setZoneType(newZone);
    if (newZone === "subterraneo" && !selectedSubterraneo && projectSubterraneos.length > 0) {
      setSelectedSubterraneo(projectSubterraneos[0]);
    }
    if (newZone === "exterior" && !selectedExterior && projectExteriores.length > 0) {
      setSelectedExterior(projectExteriores[0]);
    }
    if (newZone === "comun" && !selectedAreaComun && projectAreasComunes.length > 0) {
      setSelectedAreaComun(projectAreasComunes[0]);
    }
    if (newZone === "torre" && !form.tower && towerOnlyOptions.length > 0) {
      updateFormField("tower", towerOnlyOptions[0]);
    }
    if (error) setError("");
  };

  useEffect(() => {
    if (!open) {
      isInitializedRef.current = false;
      return;
    }

    setError("");
    setSaving(false);

    let restoredFromDraft = false;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        const isFresh = !parsed.timestamp || Date.now() - parsed.timestamp < 48 * 60 * 60 * 1000;
        if (
          isFresh &&
          parsed.form &&
          (parsed.form.project || parsed.form.activity || parsed.form.floors?.length > 0)
        ) {
          setForm(parsed.form);
          if (Array.isArray(parsed.crewMembers)) setCrewMembers(parsed.crewMembers);
          if (typeof parsed.hasRestriction === "boolean") setHasRestriction(parsed.hasRestriction);
          if (parsed.zoneType) setZoneType(parsed.zoneType);
          if (parsed.towerScopeMode) setTowerScopeMode(parsed.towerScopeMode);
          if (parsed.verticalSubtype) setVerticalSubtype(parsed.verticalSubtype);
          if (parsed.floorSelectionMode) setFloorSelectionMode(parsed.floorSelectionMode);
          if (parsed.selectedSubterraneo) setSelectedSubterraneo(parsed.selectedSubterraneo);
          if (parsed.customSubterraneo) setCustomSubterraneo(parsed.customSubterraneo);
          if (typeof parsed.isCustomSubterraneo === "boolean") setIsCustomSubterraneo(parsed.isCustomSubterraneo);
          if (parsed.selectedExterior) setSelectedExterior(parsed.selectedExterior);
          if (parsed.customExterior) setCustomExterior(parsed.customExterior);
          if (typeof parsed.isCustomExterior === "boolean") setIsCustomExterior(parsed.isCustomExterior);
          if (parsed.selectedAreaComun) setSelectedAreaComun(parsed.selectedAreaComun);
          if (parsed.customAreaComun) setCustomAreaComun(parsed.customAreaComun);
          if (typeof parsed.isCustomAreaComun === "boolean") setIsCustomAreaComun(parsed.isCustomAreaComun);

          setDraftRestored(true);
          restoredFromDraft = true;
        }
      }
    } catch (e) {
      console.warn("Error reading master item draft from localStorage:", e);
    }

    if (!restoredFromDraft) {
      setDraftRestored(false);
      if (editItem) {
        const parsedForm = getFormFromEditItem(editItem);
        setForm(parsedForm);
        setCrewMembers(getCrewMembersFromEditItem(editItem));
        setHasRestriction(!!parsedForm.restrictions?.trim());

        const rawTower = editItem.tower || "";
        const rawFloor = editItem.floor || "";
        const rawScope = editItem.scope_type || "";
        const rawZone = editItem.zone_type || "";

        if (rawZone === "subterraneo" || rawTower === "Subterráneo" || /Subterr[aá]neo/i.test(rawFloor)) {
          setZoneType("subterraneo");
          setSelectedSubterraneo(rawFloor);
        } else if (rawZone === "exterior" || rawTower === "Exteriores" || /exterior/i.test(rawTower) || /exterior/i.test(rawFloor)) {
          setZoneType("exterior");
          setSelectedExterior(rawFloor);
        } else if (rawZone === "comun" || rawTower === "Áreas Comunes" || rawScope === "espacios_comunes" || rawScope === "salas_asignables") {
          setZoneType("comun");
          setSelectedAreaComun(rawFloor);
        } else if (rawZone === "vertical" || isVerticalScope(rawScope)) {
          setZoneType("vertical");
          setVerticalSubtype(rawScope);
        } else {
          setZoneType("torre");
          if (rawScope === "multiples_pisos") {
            setTowerScopeMode("pasillo");
            setFloorSelectionMode("multiple");
            const children = allItems.filter((i) => i.parent_id === editItem.id);
            if (children.length > 0) {
              const qtys = {};
              children.forEach((c) => {
                if (c.floor) qtys[c.floor] = c.planned_qty;
              });
              parsedForm.floor_planned_qtys = qtys;
              setForm({ ...parsedForm, floor_planned_qtys: qtys });
            }
          } else if (rawScope === "departamento" || editItem.departments) {
            setTowerScopeMode("departamento");
            setFloorSelectionMode("single");
          } else {
            setTowerScopeMode("pasillo");
            setFloorSelectionMode("single");
          }
        }
      } else {
        const initialProject = filteredProjects[0]?.name || "";
        const initialProjectObj = projects.find((p) => p.name === initialProject);
        const initialTower = initialProjectObj
          ? getTowerOnlyOptions(initialProjectObj.tower_count)[0] || "Torre A"
          : "Torre A";
        setForm({ ...INITIAL_FORM, project: initialProject, tower: initialTower });
        setCrewMembers([{ ...EMPTY_MEMBER }]);
        setHasRestriction(false);
        setZoneType("torre");
        setTowerScopeMode("departamento");
        setVerticalSubtype(SCOPE_TYPES.VERTICAL_EL);
        setFloorSelectionMode("single");
        setSelectedSubterraneo("");
        setCustomSubterraneo("");
        setIsCustomSubterraneo(false);
        setSelectedExterior("");
        setCustomExterior("");
        setIsCustomExterior(false);
        setSelectedAreaComun("");
        setCustomAreaComun("");
        setIsCustomAreaComun(false);
      }
    }

    isInitializedRef.current = true;
  }, [editItem, open, draftKey]);

  // Auto-save draft function
  const saveDraft = React.useCallback(() => {
    if (!open || !isInitializedRef.current) return;
    try {
      const dataToSave = {
        form,
        crewMembers,
        hasRestriction,
        zoneType,
        towerScopeMode,
        verticalSubtype,
        floorSelectionMode,
        selectedSubterraneo,
        customSubterraneo,
        isCustomSubterraneo,
        selectedExterior,
        customExterior,
        isCustomExterior,
        selectedAreaComun,
        customAreaComun,
        isCustomAreaComun,
        timestamp: Date.now(),
      };
      localStorage.setItem(draftKey, JSON.stringify(dataToSave));
      localStorage.setItem(
        "active_modal_session",
        JSON.stringify({
          type: "master_item",
          editItemId: editItem?.id || null,
          timestamp: Date.now(),
        })
      );
    } catch (e) {}
  }, [
    open,
    draftKey,
    form,
    crewMembers,
    hasRestriction,
    zoneType,
    towerScopeMode,
    verticalSubtype,
    floorSelectionMode,
    selectedSubterraneo,
    customSubterraneo,
    isCustomSubterraneo,
    selectedExterior,
    customExterior,
    isCustomExterior,
    selectedAreaComun,
    customAreaComun,
    isCustomAreaComun,
    editItem?.id,
  ]);

  // Auto-save on form state change
  useEffect(() => {
    if (open && isInitializedRef.current) {
      saveDraft();
    }
  }, [saveDraft, open]);

  // Emergency save on visibilitychange or beforeunload
  useEffect(() => {
    if (!open) return;
    const handleEmergencySave = () => {
      saveDraft();
    };
    document.addEventListener("visibilitychange", handleEmergencySave);
    window.addEventListener("beforeunload", handleEmergencySave);
    return () => {
      document.removeEventListener("visibilitychange", handleEmergencySave);
      window.removeEventListener("beforeunload", handleEmergencySave);
    };
  }, [open, saveDraft]);

  const discardDraft = () => {
    try {
      localStorage.removeItem(draftKey);
      localStorage.removeItem("active_modal_session");
    } catch (e) {}
    setDraftRestored(false);
    if (editItem) {
      const parsedForm = getFormFromEditItem(editItem);
      setForm(parsedForm);
      setCrewMembers(getCrewMembersFromEditItem(editItem));
      setHasRestriction(!!parsedForm.restrictions?.trim());
    } else {
      setForm({ ...INITIAL_FORM });
      setCrewMembers([{ ...EMPTY_MEMBER }]);
      setHasRestriction(false);
      setZoneType("torre");
      setTowerScopeMode("departamento");
      setVerticalSubtype(SCOPE_TYPES.VERTICAL_EL);
      setFloorSelectionMode("single");
      setSelectedSubterraneo("");
      setCustomSubterraneo("");
      setIsCustomSubterraneo(false);
      setSelectedExterior("");
      setCustomExterior("");
      setIsCustomExterior(false);
      setSelectedAreaComun("");
      setCustomAreaComun("");
      setIsCustomAreaComun(false);
    }
  };

  const handleClose = () => {
    if (saving) return;

    try {
      localStorage.removeItem(draftKey);
      localStorage.removeItem("active_modal_session");
    } catch (e) {}
    setDraftRestored(false);
    isInitializedRef.current = false;
    setForm({ ...INITIAL_FORM });
    setCrewMembers([{ ...EMPTY_MEMBER }]);
    setError("");
    onClose();
  };

  const updateFormField = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (error) setError("");
  };

  const handleProjectChange = (value) => {
    const nextProject = projects.find((project) => project.name === value);
    const nextTowers = getTowerOnlyOptions(nextProject?.tower_count);
    const nextSubs = safeParseJson(nextProject?.subterraneos, []);
    const nextExts = safeParseJson(nextProject?.exteriores, []);
    const nextComs = safeParseJson(nextProject?.areas_comunes, []);

    setForm((prev) => ({
      ...prev,
      project: value,
      tower: nextTowers[0] || "Torre A",
      floors: [],
      departments: "",
    }));

    if (nextSubs.length > 0) {
      setSelectedSubterraneo(nextSubs[0]);
      setIsCustomSubterraneo(false);
    }
    if (nextExts.length > 0) {
      setSelectedExterior(nextExts[0]);
      setIsCustomExterior(false);
    }
    if (nextComs.length > 0) {
      setSelectedAreaComun(nextComs[0]);
      setIsCustomAreaComun(false);
    }

    if (error) setError("");
  };

  const updateMember = (index, field, value) => {
    setCrewMembers((prev) =>
      prev.map((member, i) => {
        if (i !== index) return member;
        const updated = { ...member, [field]: value };
        if (field === "name") {
          const worker = currentProjectWorkers.find((w) => w.name === value);
          if (worker) {
            updated.role = worker.role || "";
          }
        }
        return updated;
      })
    );
  };

  const addMember = () => {
    setCrewMembers((prev) => [...prev, { ...EMPTY_MEMBER }]);
  };

  const removeMember = (index) => {
    setCrewMembers((prev) => {
      const nextMembers = prev.filter((_, i) => i !== index);
      return nextMembers.length > 0 ? nextMembers : [{ ...EMPTY_MEMBER }];
    });
  };

  const validateForm = () => {
    if (!form.project) {
      return "Debe seleccionar una obra/proyecto.";
    }

    if (zoneType === "torre") {
      if (!form.tower) {
        return "Debe seleccionar una torre.";
      }
      if (!isTowerValid) {
        return "Debe seleccionar una torre válida para la obra.";
      }
      if (towerScopeMode === "departamento") {
        if (!form.floors || form.floors.length === 0) {
          return "Debe seleccionar un piso para los departamentos.";
        }
        if (!form.departments?.trim()) {
          return "Debe seleccionar al menos un departamento.";
        }
      } else {
        if (!form.floors || form.floors.length === 0) {
          return "Debe seleccionar al menos un piso.";
        }
        if (floorSelectionMode === "multiple") {
          const missingQty = form.floors.some(
            (f) => !form.floor_planned_qtys?.[f] || Number(form.floor_planned_qtys[f]) <= 0
          );
          if (missingQty) {
            return "Debe ingresar una cantidad planificada mayor a 0 para cada piso seleccionado.";
          }
        }
      }
    } else if (zoneType === "subterraneo") {
      const finalSub = isCustomSubterraneo ? customSubterraneo.trim() : selectedSubterraneo;
      if (!finalSub) {
        return "Debe seleccionar o ingresar un nivel de subterráneo.";
      }
    } else if (zoneType === "exterior") {
      const finalExt = isCustomExterior ? customExterior.trim() : selectedExterior;
      if (!finalExt) {
        return "Debe seleccionar o ingresar un sector exterior.";
      }
    } else if (zoneType === "comun") {
      const finalCom = isCustomAreaComun ? customAreaComun.trim() : selectedAreaComun;
      if (!finalCom) {
        return "Debe seleccionar o ingresar una sala técnica o área común.";
      }
    } else if (zoneType === "vertical") {
      if (!form.tower) {
        return "Debe seleccionar una torre para la montante vertical.";
      }
      if (!verticalSubtype) {
        return "Debe seleccionar el tipo de vertical (EL, TC o CD).";
      }
    }

    if (!form.activity?.trim()) {
      return "Debe seleccionar una actividad.";
    }

    if (!isActivityValid) {
      return "Debe seleccionar una actividad del catálogo definido.";
    }

    if (!form.start_date) {
      return "Debe ingresar la fecha de inicio.";
    }

    if (!form.end_date) {
      return "Debe ingresar la fecha de término.";
    }

    if (!(zoneType === "torre" && towerScopeMode === "pasillo" && floorSelectionMode === "multiple")) {
      if (!form.planned_qty || Number(form.planned_qty) <= 0) {
        return "Debe ingresar una cantidad planificada mayor a 0.";
      }
    }

    if (!form.unit?.trim()) {
      return "Debe seleccionar una unidad de medición.";
    }

    if (!MEASUREMENT_UNITS.some((entry) => entry.value === form.unit)) {
      return "Debe seleccionar una unidad de medición válida.";
    }

    if (!form.crew_name?.trim()) {
      return "Debe ingresar el nombre de la cuadrilla.";
    }

    if (crewCatalogConflict) {
      return `La cuadrilla ya existe como "${crewCatalogConflict}". Usa ese nombre para evitar duplicados por mayúsculas o tildes.`;
    }

    const filledMembers = crewMembers.filter((member) => member.name.trim() || member.role.trim());
    if (filledMembers.length === 0) {
      return "Debe agregar al menos una persona en Integrantes de la Cuadrilla.";
    }

    if (hasDuplicateMembers) {
      return "No se puede repetir el mismo integrante dentro de la cuadrilla.";
    }

    if (filledMembers.some((member) => !member.name.trim() || !member.role.trim())) {
      return "Cada integrante de la cuadrilla debe tener nombre y cargo.";
    }

    if (hasRestriction && !form.restrictions?.trim()) {
      return "Debe ingresar el detalle de la restricción.";
    }

    if (!form.observations?.trim()) {
      return "Debe ingresar observaciones.";
    }

    return "";
  };

  const buildData = () => {
    const validMembers = crewMembers
      .filter((member) => member.name.trim() && member.role.trim())
      .map((member) => ({
        name: member.name.trim(),
        role: member.role.trim(),
      }));

    let finalTower = form.tower || towerOnlyOptions[0] || "Torre A";
    let finalFloor = "";
    let finalScopeType = SCOPE_TYPES.PISO;
    let finalZoneType = zoneType;
    let finalDepartments = "";

    if (zoneType === "torre") {
      finalTower = form.tower || towerOnlyOptions[0] || "Torre A";
      finalZoneType = "torre";
      if (towerScopeMode === "departamento") {
        finalScopeType = "departamento";
        finalFloor = form.floors?.[0] || "";
        const sortedDeps = (form.departments || "")
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean)
          .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        finalDepartments = sortedDeps.join(", ");
      } else if (floorSelectionMode === "multiple") {
        finalScopeType = "multiples_pisos";
        finalFloor = [...form.floors].sort(sortFloors).join(", ");
      } else {
        finalScopeType = "pasillo";
        finalFloor = form.floors?.[0] || "";
      }
    } else if (zoneType === "subterraneo") {
      finalTower = "Subterráneo";
      finalFloor = (isCustomSubterraneo ? customSubterraneo.trim() : selectedSubterraneo) || "Subterráneo 1";
      finalScopeType = "piso";
      finalZoneType = "subterraneo";
      finalDepartments = "";
    } else if (zoneType === "exterior") {
      finalTower = "Exteriores";
      finalFloor = (isCustomExterior ? customExterior.trim() : selectedExterior) || "Exterior";
      finalScopeType = "piso";
      finalZoneType = "exterior";
      finalDepartments = "";
    } else if (zoneType === "comun") {
      finalTower = "Áreas Comunes";
      finalFloor = (isCustomAreaComun ? customAreaComun.trim() : selectedAreaComun) || "Áreas Comunes";
      finalScopeType = "espacios_comunes";
      finalZoneType = "comun";
      finalDepartments = "";
    } else if (zoneType === "vertical") {
      finalTower = form.tower || towerOnlyOptions[0] || "Torre A";
      finalFloor = "";
      finalScopeType = verticalSubtype;
      finalZoneType = "vertical";
      finalDepartments = "";
    }

    return {
      ...form,
      project: form.project.trim(),
      tower: finalTower.trim(),
      floor: finalFloor,
      scope_type: finalScopeType,
      zone_type: finalZoneType,
      departments: finalDepartments,
      activity: form.activity.trim(),
      planned_qty: Number(form.planned_qty || 0),
      unit: form.unit.trim() || "und",
      crew_name: form.crew_name.trim(),
      restrictions: hasRestriction ? form.restrictions.trim() : "",
      observations: form.observations.trim(),
      crew_size: validMembers.length,
      crew_members: JSON.stringify(validMembers),
    };
  };

  const handleSave = async () => {
    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError("");

      await onSave(buildData());
      handleClose();
    } catch (error) {
      console.error("Error al guardar ítem:", error);
      setError(error?.message || "No se pudo guardar el ítem.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndLog = async () => {
    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError("");

      await onSaveAndLog(buildData());
      handleClose();
    } catch (error) {
      console.error("Error al guardar ítem y abrir log:", error);
      setError(error?.message || "No se pudo guardar el ítem.");
    } finally {
      setSaving(false);
    }
  };

  const validMemberCount = crewMembers.filter((member) =>
    member.name.trim() && member.role.trim()
  ).length;
  const selectedMemberNames = crewMembers
    .map((member) => member.name.trim())
    .filter(Boolean);
  const duplicateMemberNames = selectedMemberNames.filter(
    (name, index) => selectedMemberNames.indexOf(name) !== index
  );
  const hasDuplicateMembers = duplicateMemberNames.length > 0;

  const isFormInvalid = validateForm() !== "" || saving;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editItem ? "Editar Ítem" : "Nuevo Ítem Maestro"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {draftRestored && (
            <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900 shadow-sm animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="text-base">📝</span>
                <div>
                  <p className="font-semibold">Borrador recuperado</p>
                  <p className="text-[11px] text-blue-700">Se restauraron los datos no guardados de tu sesión previa.</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs border-blue-300 text-blue-800 bg-white hover:bg-blue-100"
                onClick={discardDraft}
              >
                Descartar
              </Button>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {filteredProjects.length === 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              No hay obras disponibles. Primero crea una obra desde el botón
              “Nueva Obra”.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Proyecto *</Label>
              <Select
                value={form.project}
                onValueChange={handleProjectChange}
                disabled={Boolean(editItem)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProjects.map((project) => (
                    <SelectItem key={project.id} value={project.name}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProjectObj?.supervisor ? (
              <div>
                <Label className="text-xs">Supervisor de obra</Label>
                <Input
                  value={selectedProjectObj.supervisor}
                  readOnly
                  className="bg-muted/50 text-muted-foreground text-xs"
                />
              </div>
            ) : (
              <div className="hidden sm:block" />
            )}
          </div>

          {/* Macro-Zone Selector */}
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs font-bold text-slate-700">
              Sector / Zona de la Obra *
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => handleZoneChange("torre")}
                disabled={Boolean(editItem)}
                className={cn(
                  "flex flex-col items-center justify-center py-2 px-2 rounded-lg text-xs font-bold transition-all gap-1 cursor-pointer",
                  zoneType === "torre"
                    ? "bg-white text-primary shadow-xs border border-slate-200 font-extrabold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60",
                  editItem && "cursor-not-allowed opacity-80"
                )}
              >
                <Building2 className="w-4 h-4" />
                <span>Torre</span>
              </button>

              <button
                type="button"
                onClick={() => handleZoneChange("subterraneo")}
                disabled={Boolean(editItem)}
                className={cn(
                  "flex flex-col items-center justify-center py-2 px-2 rounded-lg text-xs font-bold transition-all gap-1 cursor-pointer",
                  zoneType === "subterraneo"
                    ? "bg-white text-primary shadow-xs border border-slate-200 font-extrabold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60",
                  editItem && "cursor-not-allowed opacity-80"
                )}
              >
                <Car className="w-4 h-4" />
                <span>Subterráneo</span>
              </button>

              <button
                type="button"
                onClick={() => handleZoneChange("exterior")}
                disabled={Boolean(editItem)}
                className={cn(
                  "flex flex-col items-center justify-center py-2 px-2 rounded-lg text-xs font-bold transition-all gap-1 cursor-pointer",
                  zoneType === "exterior"
                    ? "bg-white text-primary shadow-xs border border-slate-200 font-extrabold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60",
                  editItem && "cursor-not-allowed opacity-80"
                )}
              >
                <Trees className="w-4 h-4" />
                <span>Exteriores</span>
              </button>

              <button
                type="button"
                onClick={() => handleZoneChange("comun")}
                disabled={Boolean(editItem)}
                className={cn(
                  "flex flex-col items-center justify-center py-2 px-2 rounded-lg text-xs font-bold transition-all gap-1 cursor-pointer",
                  zoneType === "comun"
                    ? "bg-white text-primary shadow-xs border border-slate-200 font-extrabold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60",
                  editItem && "cursor-not-allowed opacity-80"
                )}
              >
                <Zap className="w-4 h-4" />
                <span>Salas Técnicas</span>
              </button>

              <button
                type="button"
                onClick={() => handleZoneChange("vertical")}
                disabled={Boolean(editItem)}
                className={cn(
                  "flex flex-col items-center justify-center py-2 px-2 rounded-lg text-xs font-bold transition-all gap-1 col-span-2 sm:col-span-1 cursor-pointer",
                  zoneType === "vertical"
                    ? "bg-white text-primary shadow-xs border border-slate-200 font-extrabold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60",
                  editItem && "cursor-not-allowed opacity-80"
                )}
              >
                <ArrowUpDown className="w-4 h-4" />
                <span>Verticales</span>
              </button>
            </div>
          </div>

          {/* Zone 1: TORRE */}
          {zoneType === "torre" && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {towerOnlyOptions.length > 1 && (
                  <div>
                    <Label className="text-xs font-bold text-slate-800">Torre *</Label>
                    <Select
                      value={form.tower || towerOnlyOptions[0]}
                      onValueChange={(val) => updateFormField("tower", val)}
                      disabled={Boolean(editItem)}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white mt-1">
                        <SelectValue placeholder="Seleccionar torre" />
                      </SelectTrigger>
                      <SelectContent>
                        {towerOnlyOptions.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className={towerOnlyOptions.length > 1 ? "" : "sm:col-span-2"}>
                  <Label className="text-xs font-bold text-slate-800">Modo de Alcance *</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setTowerScopeMode("departamento");
                        setFloorSelectionMode("single");
                      }}
                      disabled={Boolean(editItem)}
                      className={cn(
                        "py-1.5 px-3 rounded-lg border text-xs font-semibold transition-all text-center cursor-pointer",
                        towerScopeMode === "departamento"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                        editItem && "cursor-not-allowed opacity-80"
                      )}
                    >
                      Por Departamentos
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTowerScopeMode("pasillo");
                        updateFormField("departments", "");
                      }}
                      disabled={Boolean(editItem)}
                      className={cn(
                        "py-1.5 px-3 rounded-lg border text-xs font-semibold transition-all text-center cursor-pointer",
                        towerScopeMode === "pasillo"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                        editItem && "cursor-not-allowed opacity-80"
                      )}
                    >
                      Piso Completo / Pasillo
                    </button>
                  </div>
                </div>
              </div>

              {towerScopeMode === "departamento" ? (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                  <div className="sm:col-span-5 space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Seleccionar Piso *</Label>
                    <div className="border rounded-xl p-2 h-48 overflow-y-auto space-y-1 bg-white scrollbar-thin">
                      {projectTowerFloors.map((floor) => {
                        const isSelected = form.floors?.[0] === floor;
                        return (
                          <div
                            key={floor}
                            onClick={() => {
                              if (editItem) return;
                              updateFormField("floors", [floor]);
                            }}
                            className={cn(
                              "flex items-center gap-2 text-xs font-semibold py-1.5 px-2 rounded-lg border transition-all cursor-pointer",
                              isSelected
                                ? "bg-primary/10 border-primary text-primary font-bold"
                                : "border-slate-100 hover:bg-slate-50 text-slate-700",
                              editItem && "cursor-not-allowed opacity-70"
                            )}
                          >
                            <div className={cn(
                              "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                              isSelected ? "bg-primary border-primary text-white" : "border-slate-300"
                            )}>
                              {isSelected && <span className="text-[10px]">✓</span>}
                            </div>
                            <span>{floor}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="sm:col-span-7 space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Departamentos del Piso *</Label>
                    {form.floors?.[0] ? (
                      deptoOptions.length > 0 ? (
                        <div className="border rounded-xl p-2.5 bg-white space-y-2 h-48 flex flex-col justify-between">
                          <div className="flex items-center justify-between border-b pb-1.5">
                            <span className="text-[11px] font-bold text-slate-800">
                              Piso: <span className="text-primary font-extrabold">{form.floors[0]}</span>
                            </span>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-2"
                                onClick={() => {
                                  updateFormField("departments", deptoOptions.map((o) => o.value).join(", "));
                                }}
                                disabled={Boolean(editItem)}
                              >
                                Todos
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-2 text-muted-foreground"
                                onClick={() => updateFormField("departments", "")}
                                disabled={Boolean(editItem)}
                              >
                                Limpiar
                              </Button>
                            </div>
                          </div>

                          <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
                            <div className="grid grid-cols-3 gap-1.5">
                              {deptoOptions.map((opt) => {
                                const dep = opt.value;
                                const selectedDeps = form.departments ? form.departments.split(",").map((d) => d.trim()).filter(Boolean) : [];
                                const isChecked = selectedDeps.includes(dep);
                                return (
                                  <label
                                    key={dep}
                                    className={cn(
                                      "flex items-center justify-center p-1 rounded-lg border text-xs font-bold cursor-pointer transition-all h-8",
                                      isChecked
                                        ? "bg-primary text-primary-foreground border-primary shadow-xs font-extrabold"
                                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100",
                                      editItem && "cursor-not-allowed opacity-70"
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      disabled={Boolean(editItem)}
                                      onChange={(e) => {
                                        const updated = e.target.checked
                                          ? [...selectedDeps, dep]
                                          : selectedDeps.filter((d) => d !== dep);
                                        const sorted = updated.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
                                        updateFormField("departments", sorted.join(", "));
                                      }}
                                      className="hidden"
                                    />
                                    <span>{dep}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          <div className="text-[10px] text-muted-foreground border-t pt-1 flex justify-between font-semibold">
                            <span>Seleccionados:</span>
                            <span className="text-primary font-bold">
                              {(form.departments ? form.departments.split(",").map((d) => d.trim()).filter(Boolean) : []).length} depto(s)
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="border rounded-xl p-3 h-48 flex flex-col justify-between bg-white">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Escribe los números de departamento:</Label>
                            <Input
                              value={form.departments}
                              onChange={(e) => updateFormField("departments", e.target.value)}
                              placeholder="Ej: 101, 102, 103"
                              className="h-8 text-xs"
                              disabled={Boolean(editItem)}
                            />
                            <p className="text-[10px] text-muted-foreground">Separados por coma.</p>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="border border-dashed rounded-xl h-48 flex flex-col items-center justify-center text-center p-3 text-slate-400 bg-white">
                        <Building2 className="w-6 h-6 mb-1 text-slate-300" />
                        <p className="text-xs font-semibold text-slate-600">Selecciona un piso a la izquierda</p>
                        <p className="text-[10px] text-slate-400">para desplegar sus departamentos</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-700">Seleccionar Piso(s) *</Label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFloorSelectionMode("single");
                          if (form.floors?.length > 1) updateFormField("floors", [form.floors[0]]);
                        }}
                        disabled={Boolean(editItem)}
                        className={cn("text-[11px] font-bold underline-offset-2 cursor-pointer", floorSelectionMode === "single" ? "text-primary underline" : "text-muted-foreground")}
                      >
                        Un Piso
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setFloorSelectionMode("multiple")}
                        disabled={Boolean(editItem)}
                        className={cn("text-[11px] font-bold underline-offset-2 cursor-pointer", floorSelectionMode === "multiple" ? "text-primary underline" : "text-muted-foreground")}
                      >
                        Múltiples Pisos
                      </button>
                    </div>
                  </div>

                  <div className="border rounded-xl p-2.5 h-48 overflow-y-auto space-y-1 bg-white scrollbar-thin">
                    {projectTowerFloors.map((floor) => {
                      const isSelected = form.floors.includes(floor);
                      return (
                        <div
                          key={floor}
                          onClick={() => {
                            if (editItem) return;
                            if (floorSelectionMode === "multiple") {
                              if (isSelected) {
                                updateFormField("floors", form.floors.filter((f) => f !== floor));
                              } else {
                                updateFormField("floors", [...form.floors, floor]);
                              }
                            } else {
                              updateFormField("floors", [floor]);
                            }
                          }}
                          className={cn(
                            "flex items-center gap-2 text-xs font-semibold py-1.5 px-2 rounded-lg border transition-all cursor-pointer",
                            isSelected
                              ? "bg-primary/10 border-primary text-primary font-bold"
                              : "border-slate-100 hover:bg-slate-50 text-slate-700",
                            editItem && "cursor-not-allowed opacity-70"
                          )}
                        >
                          <div className={cn(
                            "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                            isSelected ? "bg-primary border-primary text-white" : "border-slate-300"
                          )}>
                            {isSelected && <span className="text-[10px]">✓</span>}
                          </div>
                          <span>{floor}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Zone 2: SUBTERRÁNEO */}
          {zoneType === "subterraneo" && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
              <div>
                <Label className="text-xs font-bold text-slate-800">
                  Nivel de Subterráneo *
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Selecciona el nivel o sector del subterráneo configurado para la obra.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {projectSubterraneos.map((sub) => {
                  const isSelected = !isCustomSubterraneo && selectedSubterraneo === sub;
                  return (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => {
                        if (editItem) return;
                        setIsCustomSubterraneo(false);
                        setSelectedSubterraneo(sub);
                      }}
                      disabled={Boolean(editItem)}
                      className={cn(
                        "flex items-center gap-2.5 p-2.5 rounded-lg border text-left text-xs font-semibold transition-all cursor-pointer",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-xs font-bold"
                          : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                        editItem && "cursor-not-allowed opacity-80"
                      )}
                    >
                      <Car className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary-foreground" : "text-slate-400")} />
                      <span className="truncate">{sub}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                    </button>
                  );
                })}

                {!editItem && (
                  <button
                    type="button"
                    onClick={() => setIsCustomSubterraneo(true)}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs font-semibold transition-all border-dashed cursor-pointer",
                      isCustomSubterraneo
                        ? "bg-primary/5 text-primary border-primary font-bold"
                        : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Otro nivel o sector...</span>
                  </button>
                )}
              </div>

              {isCustomSubterraneo && !editItem && (
                <div className="pt-2">
                  <Label className="text-xs">Nombre personalizado de subterráneo / sector</Label>
                  <Input
                    value={customSubterraneo}
                    onChange={(e) => setCustomSubterraneo(e.target.value)}
                    placeholder="Ej: Subterráneo -3 (Bomba de achique)"
                    className="h-8 text-xs bg-white mt-1"
                  />
                </div>
              )}
            </div>
          )}

          {/* Zone 3: EXTERIORES */}
          {zoneType === "exterior" && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
              <div>
                <Label className="text-xs font-bold text-slate-800">
                  Sector Exterior *
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Selecciona el área exterior, empalme o urbanización correspondiente.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {projectExteriores.map((ext) => {
                  const isSelected = !isCustomExterior && selectedExterior === ext;
                  return (
                    <button
                      key={ext}
                      type="button"
                      onClick={() => {
                        if (editItem) return;
                        setIsCustomExterior(false);
                        setSelectedExterior(ext);
                      }}
                      disabled={Boolean(editItem)}
                      className={cn(
                        "flex items-center gap-2.5 p-2.5 rounded-lg border text-left text-xs font-semibold transition-all cursor-pointer",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-xs font-bold"
                          : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                        editItem && "cursor-not-allowed opacity-80"
                      )}
                    >
                      <Trees className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary-foreground" : "text-slate-400")} />
                      <span className="truncate">{ext}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                    </button>
                  );
                })}

                {!editItem && (
                  <button
                    type="button"
                    onClick={() => setIsCustomExterior(true)}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs font-semibold transition-all border-dashed cursor-pointer",
                      isCustomExterior
                        ? "bg-primary/5 text-primary border-primary font-bold"
                        : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Otro sector exterior...</span>
                  </button>
                )}
              </div>

              {isCustomExterior && !editItem && (
                <div className="pt-2">
                  <Label className="text-xs">Nombre personalizado de sector exterior</Label>
                  <Input
                    value={customExterior}
                    onChange={(e) => setCustomExterior(e.target.value)}
                    placeholder="Ej: Empalme Eléctrico MT / Transformador"
                    className="h-8 text-xs bg-white mt-1"
                  />
                </div>
              )}
            </div>
          )}

          {/* Zone 4: SALAS TÉCNICAS / COMUNES */}
          {zoneType === "comun" && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
              <div>
                <Label className="text-xs font-bold text-slate-800">
                  Sala Técnica o Área Común *
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Selecciona la sala técnica o espacio común donde se ejecutarán las instalaciones.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {projectAreasComunes.map((com) => {
                  const isSelected = !isCustomAreaComun && selectedAreaComun === com;
                  return (
                    <button
                      key={com}
                      type="button"
                      onClick={() => {
                        if (editItem) return;
                        setIsCustomAreaComun(false);
                        setSelectedAreaComun(com);
                      }}
                      disabled={Boolean(editItem)}
                      className={cn(
                        "flex items-center gap-2.5 p-2.5 rounded-lg border text-left text-xs font-semibold transition-all cursor-pointer",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-xs font-bold"
                          : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                        editItem && "cursor-not-allowed opacity-80"
                      )}
                    >
                      <Zap className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary-foreground" : "text-slate-400")} />
                      <span className="truncate">{com}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                    </button>
                  );
                })}

                {!editItem && (
                  <button
                    type="button"
                    onClick={() => setIsCustomAreaComun(true)}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs font-semibold transition-all border-dashed cursor-pointer",
                      isCustomAreaComun
                        ? "bg-primary/5 text-primary border-primary font-bold"
                        : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Otra sala o espacio técnico...</span>
                  </button>
                )}
              </div>

              {isCustomAreaComun && !editItem && (
                <div className="pt-2">
                  <Label className="text-xs">Nombre personalizado de sala técnica</Label>
                  <Input
                    value={customAreaComun}
                    onChange={(e) => setCustomAreaComun(e.target.value)}
                    placeholder="Ej: Sala de Tableros Subterráneo 2"
                    className="h-8 text-xs bg-white mt-1"
                  />
                </div>
              )}
            </div>
          )}

          {/* Zone 5: VERTICALES */}
          {zoneType === "vertical" && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
              {towerOnlyOptions.length > 1 && (
                <div>
                  <Label className="text-xs font-bold text-slate-800">Torre *</Label>
                  <Select
                    value={form.tower || towerOnlyOptions[0]}
                    onValueChange={(val) => updateFormField("tower", val)}
                    disabled={Boolean(editItem)}
                  >
                    <SelectTrigger className="h-8 text-xs bg-white mt-1">
                      <SelectValue placeholder="Seleccionar torre" />
                    </SelectTrigger>
                    <SelectContent>
                      {towerOnlyOptions.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="text-xs font-bold text-slate-800">Tipo de Montante / Riser *</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1.5">
                  {[
                    { id: SCOPE_TYPES.VERTICAL_EL, label: "Vertical EL", desc: "Shaft Eléctrico y fuerza", icon: Zap },
                    { id: SCOPE_TYPES.VERTICAL_TC, label: "Vertical TC", desc: "Telecomunicaciones y red", icon: ArrowUpDown },
                    { id: SCOPE_TYPES.VERTICAL_CD, label: "Vertical CD", desc: "Corrientes débiles y citofonía", icon: Layers },
                  ].map((v) => {
                    const isSelected = verticalSubtype === v.id;
                    const VIcon = v.icon;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVerticalSubtype(v.id)}
                        disabled={Boolean(editItem)}
                        className={cn(
                          "p-2.5 rounded-lg border text-left transition-all cursor-pointer",
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-xs font-bold"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                          editItem && "cursor-not-allowed opacity-80"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold">{v.label}</span>
                          <VIcon className="w-3.5 h-3.5 opacity-80" />
                        </div>
                        <p className={cn("text-[10px]", isSelected ? "text-primary-foreground/90" : "text-muted-foreground")}>
                          {v.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-2.5 text-xs text-blue-900 flex items-start gap-2">
                <span className="text-sm">ℹ️</span>
                <p className="text-[11px] leading-relaxed">
                  Los montantes verticales se controlan <strong>por torre completa</strong> (metros lineales de escalerilla/bandeja o tendido troncal de riser). No se dividen por piso.
                </p>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Actividad *</Label>
              {isAdmin && !editItem && (
                <button
                  type="button"
                  onClick={() => {
                    setQuickError("");
                    setQuickName("");
                    setQuickActivityOpen((prev) => !prev);
                  }}
                  className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  {quickActivityOpen ? "Cancelar" : "Nueva Actividad"}
                </button>
              )}
            </div>

            {quickActivityOpen && isAdmin && !editItem && (
              <div className="p-3 mb-2 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary">
                    Agregar Actividad al Catálogo
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                    onClick={() => setQuickActivityOpen(false)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {quickError && (
                  <p className="text-[11px] text-rose-600 font-medium">
                    {quickError}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <Label className="text-[10px] text-muted-foreground">Especialidad</Label>
                    <Select value={quickCategory} onValueChange={setQuickCategory}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EL">EL (Eléctrica)</SelectItem>
                        <SelectItem value="CD">CD (C. Débiles)</SelectItem>
                        <SelectItem value="TC">TC (Telecom)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] text-muted-foreground">Nombre de la Actividad</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="ej: Montaje de transformador"
                      value={quickName}
                      onChange={(e) => {
                        setQuickName(e.target.value);
                        if (quickError) setQuickError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleQuickAddActivity();
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-muted-foreground">
                    Se guardará como:{" "}
                    <strong className="text-foreground">
                      {quickName.trim()
                        ? `${quickCategory} ${quickName.trim().replace(new RegExp(`^${quickCategory}[\\s:–-]+`, 'i'), '')}`
                        : `${quickCategory} ...`}
                    </strong>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs px-3"
                    disabled={quickLoading || !quickName.trim()}
                    onClick={handleQuickAddActivity}
                  >
                    {quickLoading ? "Guardando..." : "Guardar y Seleccionar"}
                  </Button>
                </div>
              </div>
            )}

            <AutocompleteSelect
              value={form.activity}
              onChange={(value) => updateFormField("activity", value)}
              options={activityOptions}
              disabled={Boolean(editItem)}
              placeholder="Buscar o seleccionar..."
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Fecha Inicio</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => updateFormField("start_date", e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs">Fecha Término</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => updateFormField("end_date", e.target.value)}
              />
            </div>
          </div>

          {floorSelectionMode === "multiple" && form.floors.length > 0 ? (
            <div className="space-y-3 border rounded-xl p-3.5 bg-slate-50/70">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700">
                  Cantidad Planificada por Piso
                </Label>
                <span className="text-[11px] text-muted-foreground font-medium">
                  {form.floors.length} pisos seleccionados
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {form.floors.map((floor) => (
                  <div
                    key={floor}
                    className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-xs min-w-0"
                  >
                    <span
                      className="text-xs font-medium text-slate-700 truncate min-w-0"
                      title={floor}
                    >
                      {floor}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Input
                        type="number"
                        min="0"
                        value={form.floor_planned_qtys?.[floor] || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          const newQtys = {
                            ...form.floor_planned_qtys,
                            [floor]: val,
                          };
                          updateFormField("floor_planned_qtys", newQtys);

                          const total = Object.values(newQtys).reduce(
                            (sum, q) => sum + (Number(q) || 0),
                            0
                          );
                          updateFormField("planned_qty", total || "");
                        }}
                        placeholder="0"
                        className="h-8 text-xs w-20 sm:w-24 text-right bg-white"
                      />
                      <span
                        className="text-[11px] font-semibold text-slate-500 w-6 truncate text-left"
                        title={form.unit}
                      >
                        {MEASUREMENT_UNITS.find((u) => u.value === form.unit)?.label || form.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-200">
                <div className="text-xs font-medium text-slate-600">
                  Total acumulado:{" "}
                  <span className="text-primary font-black text-sm ml-1">
                    {form.planned_qty || 0}
                  </span>{" "}
                  <span className="font-semibold text-slate-500">
                    {MEASUREMENT_UNITS.find((u) => u.value === form.unit)?.label || form.unit}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">
                    Unidad:
                  </Label>
                  <Select
                    value={form.unit}
                    onValueChange={(value) => updateFormField("unit", value)}
                    disabled={isEditingMultiFloor}
                  >
                    <SelectTrigger className="h-8 text-xs w-32 bg-white">
                      <SelectValue placeholder="Unidad" />
                    </SelectTrigger>
                    <SelectContent>
                      {MEASUREMENT_UNITS.map((unitOption) => (
                        <SelectItem key={unitOption.value} value={unitOption.value}>
                          {unitOption.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Plan cantidad *</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.planned_qty}
                  onChange={(e) =>
                    updateFormField("planned_qty", e.target.value)
                  }
                />
              </div>

              <div>
                <Label className="text-xs">Unidad de medición *</Label>
                <Select
                  value={form.unit}
                  onValueChange={(value) => updateFormField("unit", value)}
                  disabled={isEditingMultiFloor}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar unidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEASUREMENT_UNITS.map((unitOption) => (
                      <SelectItem key={unitOption.value} value={unitOption.value}>
                        {unitOption.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Nombre Cuadrilla</Label>
            <AutocompleteInput
              value={form.crew_name}
              onChange={(e) => updateFormField("crew_name", e.target.value)}
              options={uniqueCrewNames}
              placeholder="Ej: Cuadrilla Reyes"
              disabled={isEditingMultiFloor}
            />
            {crewCatalogConflict && (
              <p className="mt-1 text-xs text-red-600">
                Ya existe como "{crewCatalogConflict}". Usa ese texto.
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs">
                Integrantes de la Cuadrilla
                {validMemberCount > 0 && (
                  <span className="ml-1.5 text-muted-foreground">
                    ({validMemberCount} persona
                    {validMemberCount !== 1 ? "s" : ""})
                  </span>
                )}
              </Label>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={addMember}
                disabled={isEditingMultiFloor}
              >
                <Plus className="h-3 w-3" />
                Agregar
              </Button>
            </div>

            {hasDuplicateMembers && (
              <p className="mb-2 text-xs text-red-600">
                Hay integrantes repetidos. Selecciona una persona distinta en cada fila.
              </p>
            )}

            <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
              {crewMembers.map((member, index) => {
                const selectedOtherMemberNames = new Set(
                  crewMembers
                    .filter((_, memberIndex) => memberIndex !== index)
                    .map((crewMember) => crewMember.name)
                    .filter(Boolean)
                );
                const availableWorkers = currentProjectWorkers.filter(
                  (worker) => !selectedOtherMemberNames.has(worker.name)
                );

                return (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    value={member.name}
                    onValueChange={(val) => updateMember(index, "name", val)}
                    disabled={isEditingMultiFloor}
                  >
                    <SelectTrigger className="h-8 flex-1 text-xs">
                      <SelectValue placeholder="Seleccionar integrante..." />
                    </SelectTrigger>
                    <SelectContent>
                      {member.name && !currentProjectWorkers.some(w => w.name === member.name) && (
                        <SelectItem key={member.name} value={member.name}>
                          {member.name}
                        </SelectItem>
                      )}
                      {currentProjectWorkers.length === 0 ? (
                        <SelectItem value="__none_w__" disabled className="text-xs">
                          Sin personal registrado
                        </SelectItem>
                      ) : availableWorkers.length === 0 ? (
                        <SelectItem value="__none_available_w__" disabled className="text-xs">
                          Sin integrantes disponibles
                        </SelectItem>
                      ) : (
                        availableWorkers.map((w) => (
                          <SelectItem key={w.id} value={w.name} className="text-xs">
                            {w.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  <Input
                    value={member.role}
                    readOnly
                    placeholder="Cargo (Automático)"
                    className="h-8 w-32 text-xs bg-muted/50 text-muted-foreground select-none"
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeMember(index)}
                    disabled={crewMembers.length === 1 || isEditingMultiFloor}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                );
              })}
            </div>
          </div>


          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Switch
                id="has-restriction-switch"
                checked={hasRestriction}
                onCheckedChange={(value) => {
                  setHasRestriction(value);
                  if (!value) {
                    setForm((prev) => ({ ...prev, restrictions: "" }));
                  }
                }}
                disabled={Boolean(editItem && editItem.parent_id !== null)}
              />
              <Label htmlFor="has-restriction-switch" className="text-xs cursor-pointer">
                ¿Tiene restricción?
              </Label>
            </div>

            {hasRestriction && (
              <div className="space-y-1">
                <Label className="text-xs">Detalle de restricción *</Label>
                <Textarea
                  value={form.restrictions}
                  onChange={(e) =>
                    updateFormField("restrictions", e.target.value)
                  }
                  className="h-16"
                  placeholder="Escriba los detalles de la restricción..."
                  disabled={Boolean(editItem && editItem.parent_id !== null)}
                />
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Observaciones</Label>
            <Textarea
              value={form.observations}
              onChange={(e) =>
                updateFormField("observations", e.target.value)
              }
              className="h-16"
              disabled={isEditingMultiFloor}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>

          <Button onClick={handleSave} disabled={isFormInvalid}>
            {saving ? "Guardando..." : editItem ? "Actualizar" : "Crear Ítem"}
          </Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}