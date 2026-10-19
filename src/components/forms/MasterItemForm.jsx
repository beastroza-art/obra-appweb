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
import { Plus, X, Layers } from "lucide-react";
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

function getTowerOptions(towerCount) {
  const count = Number.isInteger(Number(towerCount)) ? Number(towerCount) : 1;
  const towers = TOWER_LETTERS.slice(0, Math.min(Math.max(count, 1), TOWER_LETTERS.length)).map(
    (letter) => `Torre ${letter}`
  );
  return [...towers, "Exteriores"];
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

  const [selectedTowerTask, setSelectedTowerTask] = useState("piso");
  const [verticalSubtype, setVerticalSubtype] = useState(SCOPE_TYPES.VERTICAL_EL);
  const [floorSelectionMode, setFloorSelectionMode] = useState("single");
  const [singleFloorSubScope, setSingleFloorSubScope] = useState("departamento");

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

  const floorOptions = React.useMemo(() => {
    let list = [];
    if (selectedProjectObj) {
      const pFloors = safeParseJson(selectedProjectObj.floors, []);
      const pSubs = safeParseJson(selectedProjectObj.subterraneos, []);
      const pExts = safeParseJson(selectedProjectObj.exteriores, []);
      const pComunes = safeParseJson(selectedProjectObj.areas_comunes, []);

      const sortedFloors = [...pFloors].sort((a, b) => sortFloors(a, b));

      const items = [
        ...sortedFloors.map((f) => ({ label: f, value: f, group: "Torre" })),
        ...pSubs.map((s) => ({ label: s, value: s, group: "Subterráneo" })),
        ...pExts.map((e) => ({ label: e, value: e, group: "Exterior" })),
        ...pComunes.map((c) => ({ label: c, value: c, group: "Sala Técnica" })),
      ];

      if (items.length > 0) {
        list = items;
      }
    } else {
      list = ALL_FLOOR_OPTIONS;
    }
    return list;
  }, [selectedProjectObj]);

  const deptoOptions = React.useMemo(() => {
    if (selectedProjectObj && form.floors?.[0]) {
      const floorDeps = safeParseJson(selectedProjectObj.departments, {})[form.floors[0]] || [];
      return [...floorDeps]
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
        .map((d) => ({ label: String(d), value: String(d) }));
    }
    return [];
  }, [selectedProjectObj, form.floors]);

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
          if (parsed.selectedTowerTask) setSelectedTowerTask(parsed.selectedTowerTask);
          if (parsed.verticalSubtype) setVerticalSubtype(parsed.verticalSubtype);
          if (parsed.floorSelectionMode) setFloorSelectionMode(parsed.floorSelectionMode);
          if (parsed.singleFloorSubScope) setSingleFloorSubScope(parsed.singleFloorSubScope);
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

        const scopeType = parsedForm.scope_type;
        if (isVerticalScope(scopeType)) {
          setSelectedTowerTask("vertical");
          setVerticalSubtype(scopeType);
        } else {
          setSelectedTowerTask("piso");
          if (scopeType === "multiples_pisos") {
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
          } else {
            setFloorSelectionMode("single");
            if (["departamento", "pasillo", "espacios_comunes", "salas_asignables", "bodegas"].includes(scopeType)) {
              setSingleFloorSubScope(scopeType);
            } else {
              setSingleFloorSubScope("departamento");
            }
          }
        }
      } else {
        setForm({ ...INITIAL_FORM });
        setCrewMembers([{ ...EMPTY_MEMBER }]);
        setHasRestriction(false);
        setSelectedTowerTask("piso");
        setVerticalSubtype(SCOPE_TYPES.VERTICAL_EL);
        setFloorSelectionMode("single");
        setSingleFloorSubScope("departamento");
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
        selectedTowerTask,
        verticalSubtype,
        floorSelectionMode,
        singleFloorSubScope,
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
    selectedTowerTask,
    verticalSubtype,
    floorSelectionMode,
    singleFloorSubScope,
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
      setSelectedTowerTask("piso");
      setVerticalSubtype(SCOPE_TYPES.VERTICAL_EL);
      setFloorSelectionMode("single");
      setSingleFloorSubScope("departamento");
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

  const towerOptions = getTowerOptions(selectedProjectObj?.tower_count);
  const isTowerValid = !form.tower || towerOptions.includes(form.tower);
  const isActivityValid = !form.activity || activityOptions.includes(form.activity);

  const handleProjectChange = (value) => {
    const nextProject = projects.find((project) => project.name === value);
    const nextTowerOptions = getTowerOptions(nextProject?.tower_count);

    setForm((prev) => ({
      ...prev,
      project: value,
      tower: nextTowerOptions.includes(prev.tower) ? prev.tower : "",
    }));

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

    if (!form.tower) {
      return "Debe seleccionar una torre o exteriores.";
    }

    if (!isTowerValid) {
      return "Debe seleccionar una torre valida para la obra.";
    }

    if (!form.activity.trim()) {
      return "Debe seleccionar una actividad.";
    }

    if (!isActivityValid) {
      return "Debe seleccionar una actividad del catalogo definido.";
    }

    if (form.tower !== "Exteriores") {
      if (selectedTowerTask !== "vertical") {
        if (floorSelectionMode === "multiple") {
          if (!form.floors || form.floors.length === 0) {
            return "Debe seleccionar al menos un piso.";
          }
        } else {
          if (!form.floors || form.floors.length === 0) {
            return "Debe seleccionar el piso.";
          }
          if (form.floors.length > 1) {
            return "Seleccione un solo piso.";
          }
          if (singleFloorSubScope === "departamento") {
            if (!/Piso\s+(\d+)/i.test(form.floors[0])) {
              return "Este nivel no admite departamentos estándar.";
            }
            if (!form.departments.trim()) {
              return "Debe ingresar al menos un departamento.";
            }
          }
        }
      }
    }

    if (!form.start_date) {
      return "Debe ingresar la fecha de inicio.";
    }

    if (!form.end_date) {
      return "Debe ingresar la fecha de termino.";
    }

    if (floorSelectionMode === "multiple" && form.floors && form.floors.length > 0) {
      const missingQty = form.floors.some((f) => !form.floor_planned_qtys?.[f] || Number(form.floor_planned_qtys[f]) <= 0);
      if (missingQty) {
        return "Debe ingresar una cantidad planificada mayor a 0 para cada piso seleccionado.";
      }
    }

    if (!form.planned_qty || Number(form.planned_qty) <= 0) {
      return "Debe ingresar una cantidad planificada mayor a 0.";
    }

    if (!form.unit.trim()) {
      return "Debe seleccionar una unidad de medición.";
    }

    if (!MEASUREMENT_UNITS.some((entry) => entry.value === form.unit)) {
      return "Debe seleccionar una unidad de medición válida.";
    }

    if (!form.crew_name.trim()) {
      return "Debe ingresar el nombre de la cuadrilla.";
    }

    if (crewCatalogConflict) {
      return `La cuadrilla ya existe como "${crewCatalogConflict}". Usa ese nombre para evitar duplicados por mayusculas o tildes.`;
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

    if (hasRestriction && !form.restrictions.trim()) {
      return "Debe ingresar el detalle de la restricción.";
    }

    if (!form.observations.trim()) {
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

    let scope_type = SCOPE_TYPES.TORRE;
    let floor = "";
    let departments = "";

    if (form.tower === "Exteriores") {
      scope_type = SCOPE_TYPES.TORRE;
      floor = "";
      departments = "";
    } else {
      if (selectedTowerTask === "vertical") {
        scope_type = verticalSubtype;
      } else {
        if (floorSelectionMode === "multiple") {
          scope_type = "multiples_pisos";
          const sortedFloors = [...form.floors].sort(sortFloors);
          floor = sortedFloors.join(", ");
        } else {
          scope_type = singleFloorSubScope;
          floor = form.floors?.[0] || "";
          if (singleFloorSubScope === "departamento") {
            const sortedDeps = (form.departments || "")
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean)
              .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
            departments = sortedDeps.join(", ");
          }
        }
      }
    }

    return {
      ...form,
      project: form.project.trim(),
      tower: form.tower.trim(),
      floor,
      scope_type,
      departments,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
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

            <div>
              <Label className="text-xs">Torre *</Label>
              <Select
                value={form.tower}
                onValueChange={(value) => updateFormField("tower", value)}
                disabled={!form.project || Boolean(editItem)}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      form.project ? "Seleccionar torre" : "Seleccione obra"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {form.tower && !isTowerValid && (
                    <SelectItem value={form.tower} disabled>
                      {form.tower} (fuera del rango actual)
                    </SelectItem>
                  )}
                  {towerOptions.map((tower) => (
                    <SelectItem key={tower} value={tower}>
                      {tower}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedProjectObj?.supervisor && (
            <div>
              <Label className="text-xs">Supervisor de obra</Label>
              <Input
                value={selectedProjectObj.supervisor}
                readOnly
                className="bg-muted/50 text-muted-foreground"
              />
            </div>
          )}

          {form.tower && form.tower !== "Exteriores" && (
            <div className="space-y-3 border-l-2 border-slate-200 pl-3">
              <div>
                <Label className="text-xs">Tarea *</Label>
                <Select
                  value={selectedTowerTask}
                  onValueChange={(value) => {
                    setSelectedTowerTask(value);
                    if (value === "vertical") {
                      updateFormField("floors", []);
                    }
                  }}
                  disabled={Boolean(editItem)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tarea" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vertical">Vertical</SelectItem>
                    <SelectItem value="piso">Piso</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedTowerTask === "vertical" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Tipo de Vertical *</Label>
                    <Select
                      value={verticalSubtype}
                      onValueChange={(val) => setVerticalSubtype(val)}
                      disabled={Boolean(editItem)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo de vertical" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vertical_el">Vertical EL (Eléctrica)</SelectItem>
                        <SelectItem value="vertical_tc">Vertical TC (Telecomunicaciones)</SelectItem>
                        <SelectItem value="vertical_cd">Vertical CD (Corrientes Débiles)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 rounded-md border border-red-100 bg-red-50/60 px-3 py-2">
                    <p className="text-xs text-red-800">
                      Los verticales se controlan <strong>por torre</strong>. Registre
                      la cantidad total en metros, puntos o unidades del riser completo,
                      no por piso.
                    </p>
                  </div>
                </div>
              )}

              {selectedTowerTask === "piso" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Modo de Selección de Pisos *</Label>
                    <Select
                      value={floorSelectionMode}
                      onValueChange={(value) => {
                        setFloorSelectionMode(value);
                        updateFormField("floors", []);
                      }}
                      disabled={Boolean(editItem)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar modo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Un Piso</SelectItem>
                        <SelectItem value="multiple">Múltiples Pisos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {floorSelectionMode === "single" && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Área/Alcance en el Piso *</Label>
                        <Select
                          value={singleFloorSubScope}
                          onValueChange={(value) => {
                            setSingleFloorSubScope(value);
                            if (value !== "departamento") {
                              updateFormField("departments", "");
                            }
                          }}
                          disabled={Boolean(editItem)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar área" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="departamento">Departamentos</SelectItem>
                            <SelectItem value="pasillo">Pasillo</SelectItem>
                            <SelectItem value="espacios_comunes">Espacios Comunes</SelectItem>
                            <SelectItem value="salas_asignables">Salas Asignables</SelectItem>
                            <SelectItem value="bodegas">Bodegas</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                        <div className={singleFloorSubScope === "departamento" ? "md:col-span-5 space-y-1.5" : "md:col-span-12 space-y-1.5"}>
                          <Label className="text-xs font-bold">Piso *</Label>
                          <div className="border rounded-xl p-2.5 h-48 overflow-y-auto space-y-1 bg-white scrollbar-thin">
                            {floorOptions.map((opt) => {
                              const floor = opt.value;
                              const isSelected = form.floors.includes(floor);
                              return (
                                <div
                                  key={floor}
                                  onClick={() => {
                                    if (editItem) return;
                                    updateFormField("floors", [floor]);
                                  }}
                                  className={`flex items-center gap-2 text-xs font-bold py-1.5 px-2 rounded-lg border transition-all mb-0.5 ${
                                    editItem ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                                  } ${
                                    isSelected 
                                      ? "bg-primary/5 border-primary text-primary" 
                                      : "border-slate-100 hover:bg-slate-50 text-slate-700"
                                  }`}
                                >
                                  <div className={`h-3.5 w-3.5 border rounded-md flex items-center justify-center transition-colors shrink-0 ${
                                    isSelected ? "bg-primary border-primary text-white" : "border-slate-300"
                                  }`}>
                                    {isSelected && <span className="text-[10px]">✓</span>}
                                  </div>
                                  <span>{floor}</span>
                                  {opt.group && opt.group !== "Torre" && (
                                    <span className="ml-auto text-[9.5px] px-1.5 py-0.5 rounded font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                      {opt.group}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {singleFloorSubScope === "departamento" && (
                          <div className="md:col-span-7 space-y-1.5">
                            <Label className="text-xs font-bold">Departamentos *</Label>
                            {form.floors?.[0] ? (
                              !/Piso\s+(\d+)/i.test(form.floors[0]) ? (
                                <div className="border border-dashed rounded-xl p-3 h-48 flex flex-col items-center justify-center text-center bg-slate-50/50 text-slate-400 gap-1 leading-normal">
                                  <Layers className="h-6 w-6 text-slate-350" />
                                  <p className="text-xs font-bold text-slate-600">
                                    Este nivel no admite departamentos estándar
                                  </p>
                                  <p className="text-[10px] text-slate-400 max-w-[200px] leading-relaxed">
                                    Niveles como Cubierta o Subterráneos solo se configuran con actividades globales (Pasillos, Comunes, etc.).
                                  </p>
                                </div>
                              ) : deptoOptions.length > 0 ? (
                                <div className="border rounded-xl p-3 bg-slate-50/50 space-y-2.5 h-48 flex flex-col justify-between overflow-hidden">
                                  <div className="flex items-center justify-between border-b pb-1.5 shrink-0">
                                    <span className="text-[10px] font-bold text-slate-800">
                                      Configurar: <span className="text-primary font-extrabold">{form.floors[0]}</span>
                                    </span>
                                    <div className="flex gap-1.5">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 text-[9px] font-bold px-1.5 bg-white border"
                                        onClick={() => {
                                          updateFormField("departments", deptoOptions.map(o => o.value).join(", "));
                                        }}
                                      >
                                        Todos
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 text-[9px] font-bold px-1.5 bg-white border text-muted-foreground"
                                        onClick={() => {
                                          updateFormField("departments", "");
                                        }}
                                      >
                                        Limpiar
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
                                    <div className="grid grid-cols-3 gap-1">
                                      {deptoOptions.map((opt) => {
                                        const dep = opt.value;
                                        const selectedDeps = form.departments ? form.departments.split(",").map((d) => d.trim()).filter(Boolean) : [];
                                        const isChecked = selectedDeps.includes(dep);
                                        return (
                                          <label
                                            key={dep}
                                            className={`flex items-center justify-center p-1 rounded-lg border text-[10px] font-bold cursor-pointer transition-all h-7 ${
                                              isChecked 
                                                ? "bg-primary border-primary text-primary-foreground shadow-sm font-extrabold"
                                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isChecked}
                                              onChange={(e) => {
                                                const updated = e.target.checked
                                                  ? [...selectedDeps, dep]
                                                  : selectedDeps.filter(d => d !== dep);
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

                                  <div className="text-[9px] text-muted-foreground border-t pt-1 shrink-0 flex justify-between font-bold">
                                    <span>Total:</span>
                                    <span className="text-primary font-extrabold">
                                      {(form.departments ? form.departments.split(",").map((d) => d.trim()).filter(Boolean) : []).length} depto(s)
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="border rounded-xl p-2.5 h-48 flex flex-col justify-between bg-white">
                                  <div className="space-y-1.5">
                                    <Input
                                      value={form.departments}
                                      onChange={(e) => updateFormField("departments", e.target.value)}
                                      placeholder="Ej: 101, 102, 103"
                                      className="h-8 text-xs"
                                    />
                                    <p className="text-[10px] text-muted-foreground leading-normal">
                                      Ingrese los números de departamento separados por coma.
                                    </p>
                                  </div>
                                </div>
                              )
                            ) : (
                              <div className="border border-dashed rounded-xl h-48 flex flex-col items-center justify-center text-center p-3 text-slate-400 bg-slate-50/20">
                                <p className="text-[11px] font-bold text-slate-600">Seleccione un piso</p>
                                <p className="text-[10px] text-slate-400 mt-0.5 max-w-[150px] mx-auto leading-normal">
                                  Elige el piso a la izquierda para cargar los departamentos.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {floorSelectionMode === "multiple" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Pisos *</Label>
                      <div className="border rounded-xl p-2.5 h-48 overflow-y-auto space-y-1 bg-white scrollbar-thin">
                        {floorOptions.map((opt) => {
                          const floor = opt.value;
                          const isSelected = form.floors.includes(floor);
                          return (
                            <div
                              key={floor}
                              onClick={() => {
                                if (editItem) return;
                                if (isSelected) {
                                  updateFormField("floors", form.floors.filter(f => f !== floor));
                                } else {
                                  updateFormField("floors", [...form.floors, floor]);
                                }
                              }}
                              className={`flex items-center gap-2 text-xs font-bold py-1.5 px-2 rounded-lg border transition-all mb-0.5 ${
                                editItem ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                              } ${
                                isSelected 
                                  ? "bg-primary/5 border-primary text-primary" 
                                  : "border-slate-100 hover:bg-slate-50 text-slate-700"
                              }`}
                            >
                              <div className={`h-3.5 w-3.5 border rounded-md flex items-center justify-center transition-colors shrink-0 ${
                                isSelected ? "bg-primary border-primary text-white" : "border-slate-300"
                              }`}>
                                {isSelected && <span className="text-[10px]">✓</span>}
                              </div>
                              <span>{floor}</span>
                              {opt.group && opt.group !== "Torre" && (
                                <span className="ml-auto text-[9.5px] px-1.5 py-0.5 rounded font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                  {opt.group}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
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