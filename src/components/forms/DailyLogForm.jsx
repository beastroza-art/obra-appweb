import React, { useEffect, useRef, useState } from "react";
import { useWakeLock } from "@/hooks/useWakeLock";
import { format, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { getFloorList } from "@/utils/floors";
import {
  Plus,
  Trash2,
  Users,
  Camera,
  X,
  TrendingUp,
  TrendingDown,
  Target,
  PenTool,
  Check,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import ItemScopeSummary from "@/components/common/ItemScopeSummary";

import SignaturePad from "./SignaturePad";
import { stampPhotoWatermark } from "@/utils/watermark";

const SERVER_URL = (
  typeof window !== "undefined" && window.location.port !== "3001"
    ? ""
    : (import.meta.env.VITE_API_URL || "http://localhost:3001/api")
).replace(/\/api\/?$/, "");

const REQUIRE_PHOTO = true;
const REQUIRE_SIGNATURE = false;
const REQUIRE_CAPATAZ = true;

const EMPTY_WORKER = {
  name: "",
  role: "",
  hours: "",
  executed: "",
};

const getInitialForm = (userName = "") => ({
  date: format(new Date(), "yyyy-MM-dd"),
  supervisor: userName || "",
  crew_name: "",
  executed_today: "",
  hours_worked: "",
  has_restriction: false,
  is_zero_progress: false,
  restriction_detail: "",
  observations: "",
  capataz_name: "",
});

function buildCrewWorkers(workers) {
  return workers
    .filter((worker) => worker.name?.trim() && worker.role?.trim())
    .map((worker) => ({
      name: worker.name.trim(),
      role: worker.role.trim(),
      hours: Number(worker.hours) || 0,
      executed: Number(worker.executed) || 0,
    }));
}

function getCrewMembers(masterItem, allMasterItems = []) {
  if (!masterItem) return [];
  let members = masterItem.crew_members;
  if (typeof members === "string") {
    try {
      members = JSON.parse(members);
    } catch {
      members = [];
    }
  }
  if (Array.isArray(members) && members.length > 0) {
    return members;
  }

  // Si es un sub-ítem hijo y no tiene crew_members, buscar en el ítem padre
  if (masterItem.parent_id && Array.isArray(allMasterItems)) {
    const parent = allMasterItems.find(
      (i) => Number(i.id) === Number(masterItem.parent_id)
    );
    if (parent?.crew_members) {
      let pMembers = parent.crew_members;
      if (typeof pMembers === "string") {
        try {
          pMembers = JSON.parse(pMembers);
        } catch {
          pMembers = [];
        }
      }
      if (Array.isArray(pMembers) && pMembers.length > 0) {
        return pMembers;
      }
    }
  }

  // Si es un ítem padre y no tiene crew_members, buscar si algún hijo tiene
  if (Array.isArray(allMasterItems) && masterItem.id) {
    const childWithCrew = allMasterItems.find(
      (i) => Number(i.parent_id) === Number(masterItem.id) && i.crew_members
    );
    if (childWithCrew) {
      let cMembers = childWithCrew.crew_members;
      if (typeof cMembers === "string") {
        try {
          cMembers = JSON.parse(cMembers);
        } catch {
          cMembers = [];
        }
      }
      if (Array.isArray(cMembers) && cMembers.length > 0) {
        return cMembers;
      }
    }
  }

  return [];
}

function hasUnsavedProgress(formData, workersList, photosList, sig, floorsData) {
  if (formData?.executed_today && String(formData.executed_today).trim() !== "") return true;
  if (formData?.hours_worked && String(formData.hours_worked).trim() !== "") return true;
  if (formData?.observations && String(formData.observations).trim() !== "") return true;
  if (formData?.restriction_detail && String(formData.restriction_detail).trim() !== "") return true;
  if (Array.isArray(photosList) && photosList.length > 0) return true;
  if (sig) return true;

  if (Array.isArray(workersList)) {
    const hasWorkerInput = workersList.some(
      (w) =>
        (w.hours !== undefined && w.hours !== null && String(w.hours).trim() !== "") ||
        (w.executed !== undefined && w.executed !== null && String(w.executed).trim() !== "")
    );
    if (hasWorkerInput) return true;
  }

  if (floorsData && typeof floorsData === "object") {
    for (const fd of Object.values(floorsData)) {
      if (!fd) continue;
      if (fd.executed_today && String(fd.executed_today).trim() !== "") return true;
      if (fd.hours_worked && String(fd.hours_worked).trim() !== "") return true;
      if (fd.observations && String(fd.observations).trim() !== "") return true;
      if (fd.restriction_detail && String(fd.restriction_detail).trim() !== "") return true;
      if (Array.isArray(fd.photos) && fd.photos.length > 0) return true;
      if (fd.signatureImage) return true;
      if (
        Array.isArray(fd.workers) &&
        fd.workers.some(
          (w) =>
            (w.hours !== undefined && w.hours !== null && String(w.hours).trim() !== "") ||
            (w.executed !== undefined && w.executed !== null && String(w.executed).trim() !== "")
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function createInitialFloorState(crewMembers = [], defaultHours = "") {
  return {
    executed_today: "",
    hours_worked: defaultHours || "",
    has_restriction: false,
    is_zero_progress: false,
    restriction_detail: "",
    observations: "",
    workers: Array.isArray(crewMembers) && crewMembers.length > 0
      ? crewMembers.map((m) => ({
          name: m.name || "",
          role: m.role || "",
          hours: defaultHours || "",
          executed: "",
        }))
      : [],
    photos: [],
    signatureImage: null,
  };
}

function calculateTotalHours(formHoursWorked, crewWorkers) {
  if (formHoursWorked) return Number(formHoursWorked);

  return crewWorkers.reduce((maxHours, worker) => {
    return Math.max(maxHours, Number(worker.hours || 0));
  }, 0);
}

function getRemainingQty(masterItem) {
  if (!masterItem) return 0;

  return Math.max(
    Number(masterItem.planned_qty || 0) - Number(masterItem.executed_qty || 0),
    0
  );
}

function getPhotoSrc(photo) {
  if (!photo) return "";
  if (photo.url?.startsWith("http")) return photo.url;
  if (photo.url?.startsWith("/uploads")) return `${SERVER_URL}${photo.url}`;
  if (photo.file_url?.startsWith("http")) return photo.file_url;
  if (photo.file_url?.startsWith("/uploads")) {
    return `${SERVER_URL}${photo.file_url}`;
  }
  return photo.url || photo.file_url || "";
}

export default function DailyLogForm({
  open,
  onClose,
  onSave,
  masterItem,
  project,
  userName,
  initialLogData = null,
}) {
  const [form, setForm] = useState(getInitialForm(userName));
  const [workers, setWorkers] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureImage, setSignatureImage] = useState(null);
  const [error, setError] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedFloors, setSelectedFloors] = useState([]);
  const [activeFloor, setActiveFloor] = useState(null);
  const [applySignatureToAll, setApplySignatureToAll] = useState(true);

  const { data: allLogs = [] } = useQuery({
    queryKey: ["allDailyLogsForAutocomplete"],
    queryFn: () => api.get("/daily-logs"),
    staleTime: 1000 * 60 * 5,
    enabled: open,
  });

  const { data: masterItems = [] } = useQuery({
    queryKey: ["masterItems"],
    queryFn: () => api.get("/master-items"),
    enabled: open,
  });

  const { data: allWorkers = [] } = useQuery({
    queryKey: ["allWorkersForAutocomplete"],
    queryFn: () => api.get("/project-workers"),
    staleTime: 1000 * 60 * 5,
    enabled: open,
  });

  const { data: supervisors = [] } = useQuery({
    queryKey: ["users-supervisors"],
    queryFn: () => api.get("/users/list?role=supervisor"),
    enabled: open,
  });

  const { data: capataces = [] } = useQuery({
    queryKey: ["users-viewers"],
    queryFn: () => api.get("/users/list?role=viewer"),
    enabled: open,
  });

  const resolvedMasterItem = React.useMemo(() => {
    if (initialLogData?.master_item_id && Array.isArray(masterItems) && masterItems.length > 0) {
      const found = masterItems.find(
        (i) => Number(i.id) === Number(initialLogData.master_item_id)
      );
      if (found) return found;
    }
    if (masterItem && masterItem.id) return masterItem;
    if (masterItem) return masterItem;
    if (initialLogData) {
      return {
        id: initialLogData.master_item_id,
        project: initialLogData.project,
        tower: initialLogData.tower,
        floor: initialLogData.floor,
        activity: initialLogData.activity,
        unit: "und",
        planned_qty: Number(initialLogData.executed_today || 0),
        executed_qty: Number(initialLogData.executed_today || 0),
        crew_name: initialLogData.crew_name || "",
      };
    }
    return null;
  }, [masterItem, initialLogData, masterItems]);

  const currentProjectWorkers = allWorkers.filter(
    (w) => w.project === (resolvedMasterItem?.project || initialLogData?.project)
  );

  const logWorkers = allLogs
    .filter((log) => log.project === (resolvedMasterItem?.project || initialLogData?.project))
    .flatMap((log) => log.crew_workers || []);
  const allWorkerData = [...currentProjectWorkers, ...logWorkers];

  const uniqueWorkerNames = Array.from(
    new Set(allWorkerData.map((worker) => worker.name).filter(Boolean))
  ).sort();

  const uniqueWorkerRoles = Array.from(
    new Set(allWorkerData.map((worker) => worker.role).filter(Boolean))
  ).sort();

  const childItems = React.useMemo(() => {
    if (!resolvedMasterItem?.id) return [];
    return masterItems.filter((item) => Number(item.parent_id) === Number(resolvedMasterItem.id));
  }, [masterItems, resolvedMasterItem]);

  const dynamicRemainingQty = React.useMemo(() => {
    if (!resolvedMasterItem) return 0;
    if (childItems.length === 0) {
      return Math.max(Number(resolvedMasterItem.planned_qty || 0) - Number(resolvedMasterItem.executed_qty || 0), 0);
    }
    
    const targetChildren = selectedFloors.length > 0
      ? childItems.filter((c) => selectedFloors.includes(c.floor))
      : childItems;
      
    return targetChildren.reduce((sum, c) => {
      const rem = Math.max(Number(c.planned_qty || 0) - Number(c.executed_qty || 0), 0);
      return sum + rem;
    }, 0);
  }, [resolvedMasterItem, childItems, selectedFloors]);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const hasSaved = useRef(false);
  const lastItemIdRef = useRef(null);

  useEffect(() => {
    if (resolvedMasterItem?.id) {
      lastItemIdRef.current = resolvedMasterItem.id;
    }
  }, [resolvedMasterItem?.id]);

  const [floorData, setFloorData] = useState({});
  const [draftRestored, setDraftRestored] = useState(false);

  // Prevent tablet screen from sleeping while filling daily log
  useWakeLock(open);

  const isMultiFloor =
    !initialLogData &&
    resolvedMasterItem &&
    getFloorList(resolvedMasterItem.floor).length > 1;

  const getEffectiveCrew = React.useCallback(() => {
    const fromMaster = getCrewMembers(resolvedMasterItem, masterItems);
    if (fromMaster.length > 0) return fromMaster;
    if (Array.isArray(workers) && workers.length > 0) {
      const valid = workers.filter((w) => w && (w.name?.trim() || w.role?.trim()));
      if (valid.length > 0) return valid;
    }
    const fromFloor = Object.values(floorData || {})
      .flatMap((fd) => (Array.isArray(fd?.workers) ? fd.workers : []))
      .filter((w) => w && (w.name?.trim() || w.role?.trim()));
    if (fromFloor.length > 0) {
      const seen = new Set();
      const dedup = [];
      for (const w of fromFloor) {
        const k = `${(w.name || "").trim().toLowerCase()}__${(w.role || "").trim().toLowerCase()}`;
        if (!seen.has(k)) {
          seen.add(k);
          dedup.push(w);
        }
      }
      return dedup;
    }
    return [];
  }, [resolvedMasterItem, masterItems, workers, floorData]);

  const saveDailyLogDraft = React.useCallback(() => {
    if (open && isInitialized && resolvedMasterItem?.id && !initialLogData) {
      const draftKey = `draft_daily_log_${resolvedMasterItem.id}`;
      const hasProgress = hasUnsavedProgress(
        form,
        workers,
        photos,
        signatureImage,
        floorData
      );

      if (!hasProgress) {
        try {
          localStorage.removeItem(draftKey);
        } catch (e) {}
        return;
      }

      const draftData = {
        savedForm: form,
        savedWorkers: workers,
        savedPhotos: photos,
        savedSignatureImage: signatureImage,
        savedSelectedFloors: selectedFloors,
        savedActiveFloor: activeFloor,
        savedFloorData: floorData,
        savedApplySignatureToAll: applySignatureToAll,
        timestamp: Date.now(),
      };
      try {
        localStorage.setItem(draftKey, JSON.stringify(draftData));
        localStorage.setItem(
          "active_modal_session",
          JSON.stringify({
            type: "daily_log",
            itemId: resolvedMasterItem.id,
            editLogId: null,
            timestamp: Date.now(),
          })
        );
      } catch (e) {}
    }
  }, [
    open,
    isInitialized,
    form,
    workers,
    photos,
    signatureImage,
    selectedFloors,
    activeFloor,
    floorData,
    applySignatureToAll,
    resolvedMasterItem?.id,
    initialLogData,
  ]);

  useEffect(() => {
    saveDailyLogDraft();
  }, [saveDailyLogDraft]);

  // Emergency save on visibilitychange or beforeunload
  useEffect(() => {
    if (!open) return;
    const handleEmergencySave = () => {
      saveDailyLogDraft();
    };
    document.addEventListener("visibilitychange", handleEmergencySave);
    window.addEventListener("beforeunload", handleEmergencySave);
    return () => {
      document.removeEventListener("visibilitychange", handleEmergencySave);
      window.removeEventListener("beforeunload", handleEmergencySave);
    };
  }, [open, saveDailyLogDraft]);

  const discardDraft = () => {
    const activeId = resolvedMasterItem?.id || lastItemIdRef.current;

    // 1. Extraer los trabajadores del borrador guardado antes de eliminarlo
    let draftWorkers = [];
    let draftFloorWorkers = [];
    if (activeId) {
      try {
        const raw = localStorage.getItem(`draft_daily_log_${activeId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.savedWorkers)) {
            draftWorkers = parsed.savedWorkers;
          }
          if (parsed.savedFloorData && typeof parsed.savedFloorData === "object") {
            draftFloorWorkers = Object.values(parsed.savedFloorData).flatMap((fd) =>
              Array.isArray(fd?.workers) ? fd.workers : []
            );
          }
        }
      } catch (e) {}

      try {
        localStorage.removeItem(`draft_daily_log_${activeId}`);
        localStorage.removeItem("active_modal_session");
      } catch (e) {}
    }
    setDraftRestored(false);

    // 2. Eliminar fotos temporales si se subieron durante el borrador
    photos.forEach((photo) => {
      if (photo.is_uploaded && photo.filename) {
        api.delete(`/upload/${photo.filename}`).catch(() => {});
      }
    });
    Object.values(floorData).forEach((fd) => {
      if (Array.isArray(fd?.photos)) {
        fd.photos.forEach((photo) => {
          if (photo.is_uploaded && photo.filename) {
            api.delete(`/upload/${photo.filename}`).catch(() => {});
          }
        });
      }
    });
    setPhotos([]);
    setSignatureImage(null);

    // 3. Recopilar y preservar TODO el personal registrado (nombre y cargo intactos)
    const baseCrew = getCrewMembers(resolvedMasterItem, masterItems);
    const currentWorkers = Array.isArray(workers) ? workers : [];
    const currentFloorWorkers = Object.values(floorData || {}).flatMap((fd) =>
      Array.isArray(fd?.workers) ? fd.workers : []
    );

    const allSources = [
      ...currentWorkers,
      ...currentFloorWorkers,
      ...draftWorkers,
      ...draftFloorWorkers,
      ...baseCrew,
    ];

    const seen = new Set();
    const preservedPersonnel = [];

    for (const w of allSources) {
      if (!w) continue;
      const name = (w.name || "").trim();
      const role = (w.role || "").trim();
      if (!name && !role) continue;

      const key = `${name.toLowerCase()}__${role.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        preservedPersonnel.push({
          name: name,
          role: role,
          hours: "",
          executed: "",
        });
      }
    }

    // 4. Actualizar workers general / piso individual
    setWorkers(preservedPersonnel);

    // 5. Actualizar floorData para multi-piso asegurando que ningún piso pierda su personal
    setFloorData((prevFloorData) => {
      const updated = {};
      Object.keys(prevFloorData).forEach((floor) => {
        const fd = prevFloorData[floor] || {};
        const floorWorkers = Array.isArray(fd.workers)
          ? fd.workers.filter((w) => w && (w.name?.trim() || w.role?.trim()))
          : [];

        const targetWorkers =
          floorWorkers.length > 0
            ? floorWorkers.map((w) => ({
                name: (w.name || "").trim(),
                role: (w.role || "").trim(),
                hours: "",
                executed: "",
              }))
            : preservedPersonnel;

        updated[floor] = {
          ...fd,
          executed_today: "",
          hours_worked: "",
          has_restriction: false,
          is_zero_progress: false,
          restriction_detail: "",
          observations: "",
          photos: [],
          signatureImage: null,
          workers: targetWorkers,
        };
      });
      return updated;
    });

    // 6. Resetear campos diarios de formulario (horas, ejecutado, restricciones, observaciones)
    setForm((prevForm) => ({
      ...prevForm,
      executed_today: "",
      hours_worked: "",
      has_restriction: false,
      is_zero_progress: false,
      restriction_detail: "",
      observations: "",
    }));
  };

  useEffect(() => {
    if (!open) {
      setIsInitialized(false);
      return;
    }

    hasSaved.current = false;

    if (initialLogData) {
      setForm({
        date: initialLogData.date || "",
        supervisor: initialLogData.supervisor || "",
        crew_name: initialLogData.crew_name || "",
        executed_today: String(initialLogData.executed_today || ""),
        hours_worked: String(initialLogData.hours_worked || ""),
        has_restriction: Boolean(initialLogData.has_restriction),
        is_zero_progress: Boolean(initialLogData.is_zero_progress),
        restriction_detail: initialLogData.restriction_detail || "",
        observations: initialLogData.observations || "",
        capataz_name: initialLogData.capataz_name || "",
      });
      let parsedWorkers = initialLogData.crew_workers;
      if (typeof parsedWorkers === "string") {
        try {
          parsedWorkers = JSON.parse(parsedWorkers);
        } catch {
          parsedWorkers = [];
        }
      }
      if ((!Array.isArray(parsedWorkers) || parsedWorkers.length === 0) && Number(initialLogData.executed_today) > 0 && !initialLogData.is_zero_progress) {
        parsedWorkers = [
          {
            name: initialLogData.capataz_name || initialLogData.supervisor || "Trabajador 1",
            role: "Maestro",
            hours: String(initialLogData.hours_worked || 1),
            executed: String(initialLogData.executed_today || 0),
          }
        ];
      }


      setWorkers(
        Array.isArray(parsedWorkers)
          ? parsedWorkers.map((w) => ({
              name: w.name || "",
              role: w.role || "",
              hours: String(w.hours ?? ""),
              executed: String(w.executed ?? ""),
            }))
          : []
      );
      let sig = initialLogData.capataz_signature || null;
      if (sig && !sig.startsWith("http") && !sig.startsWith("data:")) {
        sig = `${SERVER_URL}${sig}`;
      }
      setSignatureImage(sig);

      setPhotos([]);
      setUploadingPhotos(true);
      api.get(`/site-photos?daily_log_id=${initialLogData.id}`)
        .then((res) => {
          setPhotos(
            (res || []).map((p) => ({
              id: p.id,
              url: p.file_url,
              file_url: p.file_url,
              description: p.description,
              label: p.label,
              is_uploaded: true,
            }))
          );
        })
        .catch((e) => console.error("Error loading photos for daily log:", e))
        .finally(() => setUploadingPhotos(false));

      setSaving(false);
      setShowSignaturePad(false);
      setError("");
      setDraftRestored(false);
      setIsInitialized(true);
      return;
    }

    const draftKey = resolvedMasterItem?.id ? `draft_daily_log_${resolvedMasterItem.id}` : null;
    const savedDraft = draftKey ? localStorage.getItem(draftKey) : null;

    if (savedDraft) {
      try {
        const {
          savedForm,
          savedWorkers,
          savedPhotos,
          savedSignatureImage,
          savedSelectedFloors,
          savedActiveFloor,
          savedFloorData,
          savedApplySignatureToAll,
        } = JSON.parse(savedDraft);
        setForm(savedForm);
        setWorkers(savedWorkers);
        setPhotos(savedPhotos);
        setSignatureImage(savedSignatureImage);
        if (Array.isArray(savedSelectedFloors)) {
          setSelectedFloors(savedSelectedFloors);
        }
        if (savedActiveFloor) {
          setActiveFloor(savedActiveFloor);
        }
        if (savedFloorData && typeof savedFloorData === "object") {
          setFloorData(savedFloorData);
        }
        if (typeof savedApplySignatureToAll === "boolean") {
          setApplySignatureToAll(savedApplySignatureToAll);
        }

        setSaving(false);
        setUploadingPhotos(false);
        setShowSignaturePad(false);
        setError("");
        setDraftRestored(true);
        setIsInitialized(true);
        return;
      } catch (e) {
        console.warn("Failed to load draft from localStorage", e);
      }
    }

    setDraftRestored(false);
    setForm({
      ...getInitialForm(userName),
      supervisor: project?.supervisor || userName || "",
      crew_name: resolvedMasterItem?.crew_name || "",
      capataz_name: project?.capataz || "",
    });

    const crewMembers = getCrewMembers(resolvedMasterItem, masterItems);

    if (crewMembers.length > 0) {
      setWorkers(
        crewMembers.map((member) => ({
          name: member.name || "",
          role: member.role || "",
          hours: "",
          executed: "",
        }))
      );
    } else {
      setWorkers([]);
    }

    if (resolvedMasterItem?.floor) {
      const floors = getFloorList(resolvedMasterItem.floor);
      if (floors.length > 1) {
        setSelectedFloors([]);
        setActiveFloor(null);
        setFloorData({});
      } else {
        setSelectedFloors(floors);
        setActiveFloor(floors[0] || null);
        setFloorData({});
      }
    } else {
      setSelectedFloors([]);
      setActiveFloor(null);
      setFloorData({});
    }

    setPhotos([]);
    setSaving(false);
    setUploadingPhotos(false);
    setShowSignaturePad(false);
    setSignatureImage(null);
    setApplySignatureToAll(true);
    setError("");
    setIsInitialized(true);
  }, [open, resolvedMasterItem, project, userName, initialLogData, masterItems]);

  const updateFormField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
  };

  const handleToggleFloor = (floor) => {
    const crewMembers = getEffectiveCrew();
    setSelectedFloors((prev) => {
      const isCurrentlySelected = prev.includes(floor);
      let next;
      if (isCurrentlySelected) {
        next = prev.filter((f) => f !== floor);
        if (activeFloor === floor) {
          setActiveFloor(next[0] || null);
        }
      } else {
        next = [...prev, floor];
        if (!activeFloor) {
          setActiveFloor(floor);
        }
      }
      return next;
    });

    setFloorData((prev) => {
      if (prev[floor]) return prev;
      const initial = createInitialFloorState(
        crewMembers,
        form.hours_worked || ""
      );
      if (applySignatureToAll && signatureImage) {
        initial.signatureImage = signatureImage;
      }
      return {
        ...prev,
        [floor]: initial,
      };
    });
  };

  const handleSelectAllFloors = () => {
    const crewMembers = getEffectiveCrew();
    const floors = getFloorList(resolvedMasterItem?.floor);
    const validFloors = floors.filter((floor) => {
      const child = childItems.find(
        (c) => String(c.floor).trim().toLowerCase() === String(floor).trim().toLowerCase()
      );
      const floorRemaining = child
        ? Math.max(
            Number(child.planned_qty || 0) - Number(child.executed_qty || 0),
            0
          )
        : null;
      return floorRemaining === null || floorRemaining > 0;
    });

    setSelectedFloors(validFloors);
    if (!activeFloor || !validFloors.includes(activeFloor)) {
      setActiveFloor(validFloors[0] || null);
    }

    setFloorData((prev) => {
      const next = { ...prev };
      validFloors.forEach((fl) => {
        if (!next[fl]) {
          const initial = createInitialFloorState(
            crewMembers,
            form.hours_worked || ""
          );
          if (applySignatureToAll && signatureImage) {
            initial.signatureImage = signatureImage;
          }
          next[fl] = initial;
        }
      });
      return next;
    });
  };

  const handleDeselectAllFloors = () => {
    setSelectedFloors([]);
    setActiveFloor(null);
  };


  const updateActiveFloorField = (field, value) => {
    if (!activeFloor) return;
    setFloorData((prev) => {
      const current =
        prev[activeFloor] ||
        createInitialFloorState(
          getEffectiveCrew(),
          form.hours_worked
        );
      return {
        ...prev,
        [activeFloor]: {
          ...current,
          [field]: value,
        },
      };
    });
    if (error) setError("");
  };

  const handleExecutedChange = (value) => {
    if (isMultiFloor) {
      updateActiveFloorField("executed_today", value);
    } else {
      updateFormField("executed_today", value);
    }
  };

  const handleHoursChange = (value) => {
    if (isMultiFloor) {
      updateActiveFloorField("hours_worked", value);
    } else {
      updateFormField("hours_worked", value);
    }
  };

  const handleHasRestrictionChange = (value) => {
    if (isMultiFloor) {
      setFloorData((prev) => {
        const current =
          prev[activeFloor] ||
          createInitialFloorState(
            getEffectiveCrew(),
            form.hours_worked
          );
        return {
          ...prev,
          [activeFloor]: {
            ...current,
            has_restriction: value,
            is_zero_progress: value ? current.is_zero_progress : false,
            executed_today: (!value && current.is_zero_progress && current.executed_today === "0") ? "" : current.executed_today,
            hours_worked: (!value && current.is_zero_progress && current.hours_worked === "0") ? "" : current.hours_worked,
            workers: (!value && current.is_zero_progress)
              ? (current.workers || []).map((w) => ({
                  ...w,
                  hours: w.hours === "0" ? "" : w.hours,
                  executed: w.executed === "0" ? "" : w.executed,
                }))
              : current.workers,
          },
        };
      });
    } else {
      updateFormField("has_restriction", value);
      if (!value) {
        if (form.is_zero_progress) {
          updateFormField("is_zero_progress", false);
          if (form.executed_today === "0") updateFormField("executed_today", "");
          if (form.hours_worked === "0") updateFormField("hours_worked", "");
          setWorkers((prev) =>
            prev.map((w) => ({
              ...w,
              hours: w.hours === "0" ? "" : w.hours,
              executed: w.executed === "0" ? "" : w.executed,
            }))
          );
        }
      }
    }
  };

  const handleIsZeroProgressChange = (value) => {
    if (isMultiFloor) {
      setFloorData((prev) => {
        const current =
          prev[activeFloor] ||
          createInitialFloorState(
            getEffectiveCrew(),
            form.hours_worked
          );
        return {
          ...prev,
          [activeFloor]: {
            ...current,
            is_zero_progress: value,
            has_restriction: value ? true : current.has_restriction,
            executed_today: value ? "0" : (current.executed_today === "0" ? "" : current.executed_today),
            hours_worked: value ? "0" : (current.hours_worked === "0" ? "" : current.hours_worked),
            workers: value
              ? (current.workers || []).map((w) => ({
                  ...w,
                  hours: "0",
                  executed: "0",
                }))
              : (current.workers || []).map((w) => ({
                  ...w,
                  hours: w.hours === "0" ? "" : w.hours,
                  executed: w.executed === "0" ? "" : w.executed,
                })),
          },
        };
      });
    } else {
      updateFormField("is_zero_progress", value);
      if (value) {
        updateFormField("has_restriction", true);
        updateFormField("executed_today", "0");
        updateFormField("hours_worked", "0");
        setWorkers((prev) =>
          prev.map((w) => ({ ...w, hours: "0", executed: "0" }))
        );
      } else {
        if (form.executed_today === "0") updateFormField("executed_today", "");
        if (form.hours_worked === "0") updateFormField("hours_worked", "");
        setWorkers((prev) =>
          prev.map((w) => ({
            ...w,
            hours: w.hours === "0" ? "" : w.hours,
            executed: w.executed === "0" ? "" : w.executed,
          }))
        );
      }
    }
  };

  const handleRestrictionDetailChange = (value) => {
    if (isMultiFloor) {
      updateActiveFloorField("restriction_detail", value);
    } else {
      updateFormField("restriction_detail", value);
    }
  };

  const handleObservationsChange = (value) => {
    if (isMultiFloor) {
      updateActiveFloorField("observations", value);
    } else {
      updateFormField("observations", value);
    }
  };

  const addWorker = () => {
    if (isMultiFloor) {
      setFloorData((prev) => {
        const current =
          prev[activeFloor] ||
          createInitialFloorState(
            getEffectiveCrew(),
            form.hours_worked
          );
        return {
          ...prev,
          [activeFloor]: {
            ...current,
            workers: [...(current.workers || []), { ...EMPTY_WORKER }],
          },
        };
      });
    } else {
      setWorkers((prev) => [...prev, { ...EMPTY_WORKER }]);
    }
  };

  const removeWorker = (index) => {
    if (isMultiFloor) {
      setFloorData((prev) => {
        const current =
          prev[activeFloor] ||
          createInitialFloorState(
            getEffectiveCrew(),
            form.hours_worked
          );
        return {
          ...prev,
          [activeFloor]: {
            ...current,
            workers: (current.workers || []).filter((_, idx) => idx !== index),
          },
        };
      });
    } else {
      setWorkers((prev) => prev.filter((_, idx) => idx !== index));
    }
  };

  const updateWorker = (index, field, value) => {
    if (isMultiFloor) {
      setFloorData((prev) => {
        const current =
          prev[activeFloor] ||
          createInitialFloorState(
            getEffectiveCrew(),
            form.hours_worked
          );
        const nextWorkers = (current.workers || []).map((worker, idx) => {
          if (idx !== index) return worker;
          const updated = { ...worker, [field]: value };
          if (field === "name") {
            const projectWorker = currentProjectWorkers.find(
              (w) => w.name === value
            );
            if (projectWorker) {
              updated.role = projectWorker.role || "";
            }
          }
          return updated;
        });
        return {
          ...prev,
          [activeFloor]: {
            ...current,
            workers: nextWorkers,
          },
        };
      });
    } else {
      setWorkers((prev) =>
        prev.map((worker, idx) => {
          if (idx !== index) return worker;
          const updated = { ...worker, [field]: value };
          if (field === "name") {
            const projectWorker = currentProjectWorkers.find(
              (w) => w.name === value
            );
            if (projectWorker) {
              updated.role = projectWorker.role || "";
            }
          }
          return updated;
        })
      );
    }
  };

  const handlePhotoUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      setUploadingPhotos(true);
      setError("");

      const currentFloorData = isMultiFloor && activeFloor ? floorData[activeFloor] : null;
      const currentHasRestriction = isMultiFloor ? Boolean(currentFloorData?.has_restriction) : Boolean(form.has_restriction);
      const currentIsZero = isMultiFloor ? Boolean(currentFloorData?.is_zero_progress) : Boolean(form.is_zero_progress);
      const currentRestrictionDetail = isMultiFloor ? (currentFloorData?.restriction_detail || "") : (form.restriction_detail || "");
      const isBlocked = currentIsZero || currentHasRestriction;

      const currentTower = resolvedMasterItem?.tower ? `${resolvedMasterItem.tower} - ` : "";
      const currentSector = isMultiFloor && activeFloor ? activeFloor : (resolvedMasterItem?.floor || "Sector General");
      const currentDptos = resolvedMasterItem?.departments ? ` (Dptos: ${resolvedMasterItem.departments})` : "";
      const currentLoc = `${currentTower}${currentSector}${currentDptos}`;

      const currentAuthor = form.capataz_name || form.supervisor || userName || "Capataz en Faena";
      const currentProjectName = project?.name || resolvedMasterItem?.project || "Obra";
      const currentActivity = resolvedMasterItem?.activity || "";

      const uploadedList = [];
      for (const file of files) {
        let fileToUpload = file;
        let watermarkSummary = "";
        try {
          const stamped = await stampPhotoWatermark(file, {
            projectName: currentProjectName,
            location: currentLoc,
            author: currentAuthor,
            type: isBlocked ? "BLOQUEO" : "AVANCE",
            cause: currentRestrictionDetail,
            timestamp: new Date(),
            note: currentActivity,
          });
          fileToUpload = stamped.file;
          watermarkSummary = stamped.summaryText;
        } catch (stampErr) {
          console.warn("No se pudo estampar sello de agua, subiendo foto original:", stampErr);
        }

        const uploadedPhoto = await api.uploadPhoto(fileToUpload);
        uploadedList.push({
          url: uploadedPhoto.file_url,
          file_url: uploadedPhoto.file_url,
          description: watermarkSummary || "",
          file_name: uploadedPhoto.original_name || fileToUpload.name,
          filename: uploadedPhoto.filename,
          mimetype: uploadedPhoto.mimetype,
          size: uploadedPhoto.size,
          is_uploaded: true,
        });
      }

      if (isMultiFloor) {
        setFloorData((prev) => {
          const current =
            prev[activeFloor] ||
            createInitialFloorState(
              getEffectiveCrew(),
              form.hours_worked
            );
          return {
            ...prev,
            [activeFloor]: {
              ...current,
              photos: [...(current.photos || []), ...uploadedList],
            },
          };
        });
      } else {
        setPhotos((prev) => [...prev, ...uploadedList]);
      }
    } catch (error) {
      console.error("Error al subir foto:", error);
      setError(error.message || "Error al subir foto.");
    } finally {
      setUploadingPhotos(false);
      event.target.value = "";
    }
  };

  const removePhoto = async (index) => {
    const activePhotosList = isMultiFloor
      ? floorData[activeFloor]?.photos || []
      : photos;
    const photo = activePhotosList[index];

    if (photo?.id) {
      try {
        await api.delete(`/site-photos/${photo.id}`);
      } catch (err) {
        console.warn(
          "No se pudo eliminar foto existente de site_photos:",
          err.message
        );
      }
    } else if (photo?.is_uploaded && photo.filename) {
      try {
        await api.delete(`/upload/${photo.filename}`);
      } catch (err) {
        console.warn("No se pudo eliminar archivo temporal:", err.message);
      }
    }

    if (isMultiFloor) {
      setFloorData((prev) => {
        const current =
          prev[activeFloor] ||
          createInitialFloorState(
            getEffectiveCrew(),
            form.hours_worked
          );
        return {
          ...prev,
          [activeFloor]: {
            ...current,
            photos: (current.photos || []).filter((_, idx) => idx !== index),
          },
        };
      });
    } else {
      setPhotos((prev) => prev.filter((_, idx) => idx !== index));
    }
  };

  const updatePhotoDescription = (index, value) => {
    if (isMultiFloor) {
      setFloorData((prev) => {
        const current =
          prev[activeFloor] ||
          createInitialFloorState(
            getEffectiveCrew(),
            form.hours_worked
          );
        return {
          ...prev,
          [activeFloor]: {
            ...current,
            photos: (current.photos || []).map((photo, idx) =>
              idx === index ? { ...photo, description: value } : photo
            ),
          },
        };
      });
    } else {
      setPhotos((prev) =>
        prev.map((photo, idx) =>
          idx === index ? { ...photo, description: value } : photo
        )
      );
    }
  };

  const handleSaveSignature = (signature) => {
    setSignatureImage(signature);
    if (isMultiFloor) {
      if (applySignatureToAll) {
        setFloorData((prev) => {
          const next = { ...prev };
          selectedFloors.forEach((fl) => {
            const current =
              next[fl] ||
              createInitialFloorState(
                getEffectiveCrew(),
                form.hours_worked
              );
            next[fl] = { ...current, signatureImage: signature };
          });
          return next;
        });
      } else if (activeFloor) {
        updateActiveFloorField("signatureImage", signature);
      }
    }
    setShowSignaturePad(false);
  };

  const activeFloorData =
    isMultiFloor && activeFloor
      ? floorData[activeFloor] ||
        createInitialFloorState(
          getEffectiveCrew(),
          form.hours_worked
        )
      : null;

  const displayedExecuted = isMultiFloor
    ? activeFloorData?.executed_today ?? ""
    : form.executed_today;
  const displayedHours = isMultiFloor
    ? activeFloorData?.hours_worked ?? ""
    : form.hours_worked;
  const displayedHasRestriction = isMultiFloor
    ? Boolean(activeFloorData?.has_restriction)
    : Boolean(form.has_restriction);
  const displayedIsZeroProgress = isMultiFloor
    ? Boolean(activeFloorData?.is_zero_progress)
    : Boolean(form.is_zero_progress);
  const displayedRestrictionDetail = isMultiFloor
    ? activeFloorData?.restriction_detail ?? ""
    : form.restriction_detail;
  const displayedObservations = isMultiFloor
    ? activeFloorData?.observations ?? ""
    : form.observations;
  const displayedWorkers = isMultiFloor
    ? activeFloorData?.workers || []
    : workers;
  const displayedPhotos = isMultiFloor
    ? activeFloorData?.photos || []
    : photos;
  const displayedSignature = isMultiFloor
    ? activeFloorData?.signatureImage || signatureImage
    : signatureImage;

  const activeChild =
    isMultiFloor && activeFloor
      ? childItems.find(
          (c) => String(c.floor).trim().toLowerCase() === String(activeFloor).trim().toLowerCase()
        )
      : null;
  const activeFloorRemaining = activeChild
    ? Math.max(
        Number(activeChild.planned_qty || 0) -
          Number(activeChild.executed_qty || 0),
        0
      )
    : dynamicRemainingQty;

  const baseRemainingQty = dynamicRemainingQty;
  const remainingQty = isMultiFloor
    ? activeFloorRemaining
    : initialLogData
    ? baseRemainingQty + (Number(initialLogData.executed_today) || 0)
    : baseRemainingQty;

  const executedTodayQty = Number(displayedExecuted || 0);
  const crewWorkersList = buildCrewWorkers(displayedWorkers);
  const totalWorkersExecuted = crewWorkersList.reduce(
    (sum, w) => sum + (Number(w.executed) || 0),
    0
  );
  const isSupervisorFixed = Boolean(project?.supervisor);
  const isCapatazFixed = Boolean(project?.capataz);
  const isCrewNameFixed = Boolean(resolvedMasterItem?.crew_name);

  const isZeroProgress = Boolean(
    displayedIsZeroProgress ||
    (displayedHasRestriction &&
      displayedExecuted !== "" &&
      Number(displayedExecuted) === 0 &&
      displayedHours !== "" &&
      Number(displayedHours) === 0)
  );
  const hasWorkerExceedingToday =
    !isZeroProgress &&
    crewWorkersList.some((w) => (Number(w.executed) || 0) > executedTodayQty);
  const currentHoursLimit = isMultiFloor
    ? Number(displayedHours || 0)
    : Number(form.hours_worked || 0);
  const hasWorkerExceedingHours =
    !isZeroProgress &&
    currentHoursLimit > 0 &&
    crewWorkersList.some((w) => (Number(w.hours) || 0) > currentHoursLimit);

  const hasInvalidWorker = displayedWorkers.some((worker) => {
    const hasAnyValue =
      worker.name?.trim() ||
      worker.role?.trim() ||
      worker.hours ||
      worker.executed;

    return (
      hasAnyValue &&
      (!worker.name?.trim() ||
        !worker.role?.trim() ||
        (isZeroProgress
          ? (worker.hours !== "" && Number(worker.hours) < 0) ||
            (worker.executed !== "" && Number(worker.executed) < 0)
          : !worker.hours ||
            Number(worker.hours) <= 0 ||
            worker.executed === "" ||
            worker.executed === null ||
            worker.executed === undefined ||
            Number(worker.executed) < 0))
    );
  });

  const isFloorComplete = (fl) => {
    const fd = floorData[fl];
    if (!fd) return false;
    const zeroProg = Boolean(
      fd.is_zero_progress ||
      (fd.has_restriction &&
        fd.executed_today !== "" &&
        Number(fd.executed_today) === 0 &&
        fd.hours_worked !== "" &&
        Number(fd.hours_worked) === 0)
    );
    if (!zeroProg) {
      const floorExecVal = Number(fd.executed_today || 0);
      const floorHoursVal = Number(fd.hours_worked || 0);
      if (!fd.executed_today || floorExecVal <= 0) return false;
      if (!fd.hours_worked || floorHoursVal <= 0) return false;
      const cw = buildCrewWorkers(fd.workers || []);
      if (cw.length === 0) return false;
      if (cw.some((w) => (Number(w.executed) || 0) > floorExecVal)) return false;
      if (floorHoursVal > 0 && cw.some((w) => (Number(w.hours) || 0) > floorHoursVal)) return false;
      const hasInv = (fd.workers || []).some((w) => {
        const hasAny =
          w.name?.trim() || w.role?.trim() || w.hours || w.executed;
        return (
          hasAny &&
          (!w.name?.trim() ||
            !w.role?.trim() ||
            !w.hours ||
            Number(w.hours) <= 0 ||
            w.executed === "" ||
            w.executed === null ||
            w.executed === undefined ||
            Number(w.executed) < 0)
        );
      });
      if (hasInv) return false;

      const child = childItems.find(
        (c) => String(c.floor).trim().toLowerCase() === String(fl).trim().toLowerCase()
      );
      const floorRemaining = child
        ? Math.max(
            Number(child.planned_qty || 0) -
              Number(child.executed_qty || 0),
            0
          )
        : 999999;
      if (floorExecVal > floorRemaining) return false;
    } else {
      if (Number(fd.executed_today || 0) < 0) return false;
      if (Number(fd.hours_worked || 0) < 0) return false;
      const hasInv = (fd.workers || []).some((w) => {
        const hasAny =
          w.name?.trim() || w.role?.trim() || w.hours || w.executed;
        return (
          hasAny &&
          (!w.name?.trim() ||
            !w.role?.trim() ||
            (w.hours !== "" && Number(w.hours) < 0) ||
            (w.executed !== "" && Number(w.executed) < 0))
        );
      });
      if (hasInv) return false;
    }
    if (!fd.observations?.trim()) return false;
    if (fd.has_restriction && !fd.restriction_detail?.trim()) return false;
    if (REQUIRE_PHOTO && (!fd.photos || fd.photos.length === 0)) return false;
    const sig = fd.signatureImage || signatureImage;
    if (REQUIRE_SIGNATURE && !sig) return false;
    return true;
  };

  const getDailyGoalInfo = () => {
    if (!resolvedMasterItem || !displayedExecuted) return null;
    const remaining = isMultiFloor
      ? activeFloorRemaining
      : dynamicRemainingQty;
    if (remaining <= 0) return null;

    let dailyGoal;
    if (resolvedMasterItem.start_date && resolvedMasterItem.end_date) {
      const totalDays =
        differenceInCalendarDays(
          new Date(resolvedMasterItem.end_date),
          new Date(resolvedMasterItem.start_date)
        ) + 1;

      const daysPassed =
        differenceInCalendarDays(
          new Date(form.date),
          new Date(resolvedMasterItem.start_date)
        ) + 1;

      const daysLeft = Math.max(totalDays - daysPassed + 1, 1);
      dailyGoal = Math.ceil(remaining / daysLeft);
    } else {
      dailyGoal = Math.ceil(remaining / 5);
    }

    const todayQty = Number(displayedExecuted) || 0;

    return {
      dailyGoal,
      todayQty,
      remaining,
      planned:
        isMultiFloor && activeChild
          ? Number(activeChild.planned_qty || 0)
          : Number(resolvedMasterItem.planned_qty || 0),
      onTarget: todayQty >= dailyGoal,
    };
  };

  const goalInfo = getDailyGoalInfo();

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");

      if (!resolvedMasterItem && !initialLogData) {
        throw new Error("No hay ítem maestro asociado.");
      }
      if (!form.date) throw new Error("Debe ingresar la fecha del reporte.");
      if (!form.supervisor?.trim()) {
        throw new Error("Debe seleccionar un supervisor.");
      }
      if (!form.crew_name?.trim()) {
        throw new Error("Debe ingresar la cuadrilla.");
      }
      if (REQUIRE_CAPATAZ && !form.capataz_name?.trim()) {
        throw new Error("Debe ingresar el nombre del capataz.");
      }
      if (uploadingPhotos) {
        throw new Error("Espera a que terminen de subir las fotos.");
      }

      if (isMultiFloor) {
        if (selectedFloors.length === 0) {
          throw new Error(
            "Debe seleccionar al menos un piso para registrar el reporte."
          );
        }

        const compiledFloorData = {};
        let totalExecuted = 0;
        let maxHours = 0;

        for (const fl of selectedFloors) {
          const fd = floorData[fl];
          if (!fd) {
            throw new Error(`Faltan datos para el ${fl}.`);
          }
          const floorZeroProg = fd.has_restriction && fd.is_zero_progress;
          const floorExec = Number(fd.executed_today || 0);
          const floorHours = Number(fd.hours_worked || 0);

          if (!floorZeroProg) {
            if (!fd.executed_today || floorExec <= 0) {
              throw new Error(
                `Debe ingresar la cantidad ejecutada hoy para el ${fl}.`
              );
            }
            if (!fd.hours_worked || floorHours <= 0) {
              throw new Error(
                `Debe ingresar las horas trabajadas para el ${fl}.`
              );
            }

            const child = childItems.find(
              (c) => String(c.floor).trim().toLowerCase() === String(fl).trim().toLowerCase()
            );
            const floorRemaining = child
              ? Math.max(
                  Number(child.planned_qty || 0) -
                    Number(child.executed_qty || 0),
                  0
                )
              : 999999;

            if (floorExec > floorRemaining) {
              throw new Error(
                `La cantidad para el ${fl} (${floorExec}) supera el pendiente de ese piso (${floorRemaining}).`
              );
            }
          }

          if (!fd.observations?.trim()) {
            throw new Error(`Debe ingresar observaciones para el ${fl}.`);
          }
          if (fd.has_restriction && !fd.restriction_detail?.trim()) {
            throw new Error(
              `Debe ingresar el detalle de la restricción para el ${fl}.`
            );
          }

          const rawCrewWorkers = buildCrewWorkers(fd.workers || []);
          const crewWorkers = floorZeroProg
            ? rawCrewWorkers.map((w) => ({
                ...w,
                hours: 0,
                executed: 0,
                exclude_from_metrics: true,
              }))
            : rawCrewWorkers;

          if (!floorZeroProg && crewWorkers.length === 0) {
            throw new Error(
              `Debe agregar al menos una persona en personal presente para el ${fl}.`
            );
          }

          const hasExceedingExec = crewWorkers.some(
            (w) => (Number(w.executed) || 0) > floorExec
          );
          if (!floorZeroProg && hasExceedingExec) {
            throw new Error(
              `En el ${fl}, el ejecutado de cada integrante no puede superar la cantidad ejecutada hoy (${floorExec}).`
            );
          }

          const floorHoursLimit = Number(fd.hours_worked || 0);
          const hasExceedingHours = crewWorkers.some(
            (w) => (Number(w.hours) || 0) > floorHoursLimit
          );
          if (!floorZeroProg && floorHoursLimit > 0 && hasExceedingHours) {
            throw new Error(
              `En el ${fl}, las horas de cada integrante no pueden superar las horas trabajadas (${floorHoursLimit}h).`
            );
          }

          if (
            (fd.workers || []).some((worker) => {
              const hasAnyValue =
                worker.name?.trim() ||
                worker.role?.trim() ||
                worker.hours ||
                worker.executed;
              return (
                hasAnyValue &&
                (!worker.name?.trim() ||
                  !worker.role?.trim() ||
                  (floorZeroProg
                    ? (worker.hours !== "" && Number(worker.hours) < 0) ||
                      (worker.executed !== "" && Number(worker.executed) < 0)
                    : !worker.hours ||
                      Number(worker.hours) <= 0 ||
                      worker.executed === "" ||
                      worker.executed === null ||
                      worker.executed === undefined ||
                      Number(worker.executed) < 0))
              );
            })
          ) {
            throw new Error(
              `En el ${fl}, cada persona presente debe tener nombre, cargo, horas y ejecutado válidos.`
            );
          }

          const floorTotalHours = floorZeroProg
            ? 0
            : calculateTotalHours(fd.hours_worked, crewWorkers);
          if (floorTotalHours > 10) {
            throw new Error(
              `En el ${fl}, no se pueden registrar más de 10 horas en un día.`
            );
          }

          if (REQUIRE_PHOTO && (!fd.photos || fd.photos.length === 0)) {
            throw new Error(
              `Debe cargar al menos una foto del sitio para el ${fl}.`
            );
          }

          let floorSig = fd.signatureImage || signatureImage;
          if (REQUIRE_SIGNATURE && !floorSig) {
            throw new Error(`Debe dibujar la firma del capataz para el ${fl}.`);
          }

          if (floorSig && SERVER_URL && floorSig.startsWith(SERVER_URL)) {
            floorSig = floorSig.slice(SERVER_URL.length);
          }

          compiledFloorData[fl] = {
            executed_today: floorExec,
            hours_worked: floorTotalHours,
            has_restriction: Boolean(fd.has_restriction),
            is_zero_progress: floorZeroProg,
            restriction_detail: fd.restriction_detail || "",
            observations: fd.observations || "",
            crew_workers: crewWorkers,
            capataz_signature: floorSig,
            photos: (fd.photos || []).map((photo) => ({
              id: photo.id,
              file_url: photo.file_url || photo.url || "",
              url: photo.file_url || photo.url || "",
              description: photo.description || "",
              label: "reporte_diario",
              date: form.date,
              file_name: photo.file_name || "",
            })),
          };

          totalExecuted += floorExec;
          maxHours = Math.max(maxHours, floorTotalHours);
        }

        const allFloorPhotos = Object.values(compiledFloorData).flatMap(
          (f) => f.photos || []
        );

        let normalizedSignature = signatureImage;
        if (
          normalizedSignature &&
          SERVER_URL &&
          normalizedSignature.startsWith(SERVER_URL)
        ) {
          normalizedSignature = normalizedSignature.slice(SERVER_URL.length);
        }

        await onSave({
          ...form,
          crew_name:
            form.crew_name || resolvedMasterItem?.crew_name || "",
          executed_today: totalExecuted,
          hours_worked: maxHours,
          crew_workers: Object.values(compiledFloorData).flatMap((f) => f.crew_workers || []),
          capataz_signature: normalizedSignature,
          master_item_id: resolvedMasterItem?.id,
          project: resolvedMasterItem?.project || form.project || "",
          tower: resolvedMasterItem?.tower || "",
          floor: selectedFloors.join(", "),
          activity: resolvedMasterItem?.activity || "",
          photos: allFloorPhotos,
          floor_data: compiledFloorData,
        });

        hasSaved.current = true;
        if (resolvedMasterItem?.id) {
          localStorage.removeItem(`draft_daily_log_${resolvedMasterItem.id}`);
        }
        try {
          localStorage.removeItem("active_modal_session");
        } catch (e) {}
        onClose();
        return;
      }

      // Single floor mode
      const isZeroProgress = Boolean(
        form.is_zero_progress ||
        (form.has_restriction &&
          form.executed_today !== "" &&
          Number(form.executed_today) === 0 &&
          form.hours_worked !== "" &&
          Number(form.hours_worked) === 0)
      );
      if (!isZeroProgress) {
        if (!form.executed_today || Number(form.executed_today) <= 0) {
          throw new Error("Debe ingresar la cantidad ejecutada hoy.");
        }
        if (!form.hours_worked || Number(form.hours_worked) <= 0) {
          throw new Error("Debe ingresar las horas trabajadas.");
        }
      } else {
        if (Number(form.executed_today || 0) < 0) {
          throw new Error("La cantidad ejecutada no puede ser menor a 0.");
        }
        if (Number(form.hours_worked || 0) < 0) {
          throw new Error("Las horas trabajadas no pueden ser menores a 0.");
        }
      }
      if (!form.observations?.trim()) {
        throw new Error("Debe ingresar observaciones.");
      }
      if (form.has_restriction && !form.restriction_detail?.trim()) {
        throw new Error("Debe ingresar el detalle de la restriccion.");
      }

      const executedToday = Number(form.executed_today || 0);

      if (!isZeroProgress) {
        if (!initialLogData && remainingQty <= 0) {
          throw new Error("Este ítem ya alcanzó la cantidad planificada.");
        }

        if (executedToday > remainingQty) {
          throw new Error(
            `La cantidad ejecutada hoy no puede superar el pendiente (${remainingQty} ${
              resolvedMasterItem?.unit || "und"
            }).`
          );
        }
      }

      if (REQUIRE_PHOTO && !initialLogData && photos.length === 0) {
        throw new Error("Debe cargar al menos una foto del sitio.");
      }

      if (REQUIRE_SIGNATURE && !signatureImage) {
        throw new Error("Debe dibujar la firma del capataz.");
      }

      const rawCrewWorkers = buildCrewWorkers(workers);
      const crewWorkers = isZeroProgress
        ? rawCrewWorkers.map((w) => ({
            ...w,
            hours: 0,
            executed: 0,
            exclude_from_metrics: true,
          }))
        : rawCrewWorkers;

      if (!isZeroProgress && crewWorkers.length === 0) {
        throw new Error(
          "Debe agregar al menos una persona en personal presente."
        );
      }

      const hasWorkerExceedingToday = crewWorkers.some(
        (w) => (Number(w.executed) || 0) > executedToday
      );

      if (!isZeroProgress && hasWorkerExceedingToday) {
        throw new Error(
          `El ejecutado de cada integrante no puede superar la cantidad ejecutada hoy (${executedToday}).`
        );
      }

      const formHoursLimit = Number(form.hours_worked || 0);
      const hasWorkerExceedingHours = crewWorkers.some(
        (w) => (Number(w.hours) || 0) > formHoursLimit
      );

      if (!isZeroProgress && formHoursLimit > 0 && hasWorkerExceedingHours) {
        throw new Error(
          `Las horas de cada integrante no pueden superar las horas trabajadas (${formHoursLimit}h).`
        );
      }

      if (
        workers.some((worker) => {
          const hasAnyValue =
            worker.name?.trim() ||
            worker.role?.trim() ||
            worker.hours ||
            worker.executed;

          return (
            hasAnyValue &&
            (!worker.name?.trim() ||
              !worker.role?.trim() ||
              (isZeroProgress
                ? (worker.hours !== "" && Number(worker.hours) < 0) ||
                  (worker.executed !== "" && Number(worker.executed) < 0)
                : !worker.hours ||
                  Number(worker.hours) <= 0 ||
                  worker.executed === "" ||
                  worker.executed === null ||
                  worker.executed === undefined ||
                  Number(worker.executed) < 0))
          );
        })
      ) {
        throw new Error(
          isZeroProgress
            ? "Cada persona presente debe tener nombre, cargo, horas y ejecutado válidos (mínimo 0)."
            : "Cada persona presente debe tener nombre, cargo, horas y ejecutado."
        );
      }

      const totalHours = isZeroProgress
        ? 0
        : calculateTotalHours(form.hours_worked, crewWorkers);

      if (totalHours > 10) {
        throw new Error("No se pueden registrar más de 10 horas en un día.");
      }

      let normalizedSignature = signatureImage;
      if (
        normalizedSignature &&
        SERVER_URL &&
        normalizedSignature.startsWith(SERVER_URL)
      ) {
        normalizedSignature = normalizedSignature.slice(SERVER_URL.length);
      }

      await onSave({
        ...form,
        crew_name:
          form.crew_name ||
          resolvedMasterItem?.crew_name ||
          initialLogData?.crew_name ||
          "",
        executed_today: executedToday,
        hours_worked: totalHours,
        crew_workers: crewWorkers,
        is_zero_progress: Boolean(isZeroProgress),
        capataz_signature: normalizedSignature,
        master_item_id:
          resolvedMasterItem?.id || initialLogData?.master_item_id,
        project:
          resolvedMasterItem?.project ||
          initialLogData?.project ||
          form.project ||
          "",
        tower: resolvedMasterItem?.tower || initialLogData?.tower || "",
        floor: resolvedMasterItem?.floor || initialLogData?.floor || "",
        activity:
          resolvedMasterItem?.activity || initialLogData?.activity || "",
        photos: photos.map((photo) => ({
          id: photo.id,
          file_url: photo.file_url || photo.url || "",
          url: photo.file_url || photo.url || "",
          description: photo.description || "",
          label: "reporte_diario",
          date: form.date,
          file_name: photo.file_name || "",
        })),
      });

      hasSaved.current = true;
      if (resolvedMasterItem?.id) {
        localStorage.removeItem(`draft_daily_log_${resolvedMasterItem.id}`);
      }
      try {
        localStorage.removeItem("active_modal_session");
      } catch (e) {}
      onClose();
    } catch (error) {
      console.error("Error al guardar reporte:", error);
      setError(error.message || "Error al guardar reporte.");
    } finally {
      setSaving(false);
    }
  };

  const isSaveDisabled = isMultiFloor
    ? !form.date ||
      !form.supervisor?.trim() ||
      !form.crew_name?.trim() ||
      (REQUIRE_CAPATAZ && !form.capataz_name?.trim()) ||
      selectedFloors.length === 0 ||
      !selectedFloors.every((fl) => isFloorComplete(fl)) ||
      saving ||
      uploadingPhotos
    : !form.date ||
      !form.supervisor?.trim() ||
      !form.crew_name?.trim() ||
      (isZeroProgress
        ? Number(form.executed_today) < 0 || Number(form.hours_worked) < 0
        : !form.executed_today ||
          Number(form.executed_today) <= 0 ||
          !form.hours_worked ||
          Number(form.hours_worked) <= 0) ||
      !form.observations?.trim() ||
      (form.has_restriction && !form.restriction_detail?.trim()) ||
      (!isZeroProgress && buildCrewWorkers(workers).length === 0) ||
      hasInvalidWorker ||
      (!isZeroProgress && !initialLogData && remainingQty <= 0) ||
      (!isZeroProgress && executedTodayQty > remainingQty) ||
      hasWorkerExceedingToday ||
      hasWorkerExceedingHours ||
      saving ||
      uploadingPhotos ||
      (REQUIRE_PHOTO && !initialLogData && photos.length === 0) ||
      (REQUIRE_CAPATAZ && !form.capataz_name?.trim()) ||
      (REQUIRE_SIGNATURE && !signatureImage);

  const handleUserCancel = () => {
    try {
      localStorage.removeItem("active_modal_session");
    } catch (e) {}
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!uploadingPhotos && !saving && !value) {
          handleUserCancel();
        }
      }}
    >
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
          {uploadingPhotos && (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-2xl bg-white px-5 py-4 text-center shadow-lg">
        <p className="text-sm font-semibold">Subiendo imagen...</p>
        <p className="text-xs text-muted-foreground">
          Espera a que termine la carga antes de cerrar o guardar.
        </p>
      </div>
    </div>
  )}
        <DialogHeader className="border-b px-6 pb-4 pt-6">
          <DialogTitle>Reporte Diario</DialogTitle>
          {resolvedMasterItem && <ItemScopeSummary item={resolvedMasterItem} className="pt-1" />}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => updateFormField("date", e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs">Supervisor</Label>
              <Select
                value={form.supervisor}
                onValueChange={(v) => updateFormField("supervisor", v)}
                disabled={isSupervisorFixed}
              >
                <SelectTrigger disabled={isSupervisorFixed}>
                  <SelectValue placeholder="Seleccionar supervisor" />
                </SelectTrigger>
                <SelectContent>
                  {form.supervisor && !supervisors.some((u) => u.full_name === form.supervisor) && (
                    <SelectItem key={form.supervisor} value={form.supervisor}>
                      {form.supervisor}
                    </SelectItem>
                  )}
                  {supervisors.length === 0 && !form.supervisor ? (
                    <SelectItem value="__none_s__" disabled>
                      Sin supervisores registrados
                    </SelectItem>
                  ) : (
                    supervisors.map((u) => (
                      <SelectItem key={u.id} value={u.full_name}>
                        {u.full_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {isSupervisorFixed && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Supervisor fijado por la obra seleccionada.
                </p>
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs">Cuadrilla</Label>
            <Input
              value={form.crew_name}
              onChange={(e) => updateFormField("crew_name", e.target.value)}
              placeholder="Ej: Cuadrilla Eléctrica A"
              disabled={isCrewNameFixed}
            />

            {isCrewNameFixed && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Cuadrilla fijada por el ítem maestro.
              </p>
            )}
          </div>

          {/* Floor selection for items with multiple floors */}
          {resolvedMasterItem && getFloorList(resolvedMasterItem.floor).length > 1 && (
            <div className="space-y-3 border border-slate-200 rounded-xl p-4 bg-slate-50/70 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label className="text-xs font-bold text-slate-800 block">
                    Pisos a reportar *
                  </Label>
                  <p className="text-[11px] text-slate-500">
                    Selecciona los pisos en los que se avanzó hoy:
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={handleSelectAllFloors}
                  >
                    Seleccionar todos
                  </Button>
                  {selectedFloors.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2 text-slate-500 hover:text-slate-700"
                      onClick={handleDeselectAllFloors}
                    >
                      Limpiar
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {getFloorList(resolvedMasterItem.floor).map((floor) => {
                  const isChecked = selectedFloors.includes(floor);
                  const child = childItems.find((c) => c.floor === floor);
                  const floorRemaining = child
                    ? Math.max(
                        Number(child.planned_qty || 0) -
                          Number(child.executed_qty || 0),
                        0
                      )
                    : null;
                  const isCompleted =
                    floorRemaining !== null && floorRemaining <= 0;
                  const isComplete = isChecked && isFloorComplete(floor);

                  return (
                    <button
                      key={floor}
                      type="button"
                      disabled={isCompleted}
                      onClick={() => handleToggleFloor(floor)}
                      className={cn(
                        "p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all select-none",
                        isCompleted
                          ? "bg-slate-50 border-slate-200 text-slate-400 opacity-55 cursor-not-allowed"
                          : isChecked
                          ? "bg-white border-orange-500 shadow-xs ring-1 ring-orange-500/30 cursor-pointer hover:shadow-sm"
                          : "bg-white/60 border-slate-200 text-slate-600 cursor-pointer hover:bg-white hover:border-slate-300"
                      )}
                    >
                      <div
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-all",
                          isChecked
                            ? "border-orange-500 bg-orange-500 text-white"
                            : "border-slate-300 bg-white"
                        )}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={cn(
                              "text-xs font-bold leading-none truncate",
                              isChecked ? "text-slate-800" : "text-slate-600"
                            )}
                          >
                            {floor}
                          </span>
                          {isChecked && (
                            <span
                              className={cn(
                                "text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none shrink-0",
                                isComplete
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                              )}
                            >
                              {isComplete ? "Listo" : "Pendiente"}
                            </span>
                          )}
                        </div>
                        {floorRemaining !== null && (
                          <span
                            className={cn(
                              "text-[10px] font-mono leading-none mt-1",
                              isChecked
                                ? "text-orange-600 font-semibold"
                                : "text-slate-400"
                            )}
                          >
                            Pendiente: {floorRemaining}{" "}
                            {resolvedMasterItem?.unit || "und"}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isMultiFloor && selectedFloors.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
              <p className="text-sm font-semibold text-slate-700">
                Ningún piso seleccionado
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Selecciona arriba los pisos que se trabajaron hoy para ingresar las cantidades, trabajadores, observaciones, fotos y firma correspondientes a cada uno.
              </p>
            </div>
          )}

          {(!isMultiFloor || selectedFloors.length > 0) && (
            <>
              {isMultiFloor && selectedFloors.length > 0 && (
                <div className="space-y-3 pt-1">
                  {/* Floor Tabs Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {selectedFloors.map((floor) => {
                        const isActive = floor === activeFloor;
                        const isComplete = isFloorComplete(floor);
                        return (
                          <button
                            key={floor}
                            type="button"
                            onClick={() => setActiveFloor(floor)}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                              isActive
                                ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                            )}
                          >
                            <span>{floor}</span>
                            <span
                              className={cn(
                                "flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold",
                                isActive
                                  ? isComplete
                                    ? "bg-white text-orange-600"
                                    : "bg-white/30 text-white"
                                  : isComplete
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                              )}
                            >
                              {isComplete ? "✓" : "•"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Floor Banner */}
                  <div className="flex items-center justify-between bg-orange-50/70 border border-orange-200/80 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-600">
                        Reportando avance de:
                      </span>
                      <span className="font-extrabold text-orange-700 bg-white px-2 py-0.5 rounded border border-orange-200 shadow-xs">
                        {activeFloor}
                      </span>
                    </div>
                    {activeFloorRemaining !== null && (
                      <span className="text-slate-600">
                        Pendiente en este piso:{" "}
                        <b className="text-orange-700 font-mono">
                          {activeFloorRemaining} {resolvedMasterItem?.unit || "und"}
                        </b>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Card de Día sin avance / Paro de faena */}
              <div
                className={cn(
                  "rounded-xl border p-3.5 transition-all select-none",
                  isZeroProgress
                    ? "bg-amber-50/80 border-amber-300 ring-1 ring-amber-400/40 shadow-xs"
                    : "bg-slate-50/60 border-slate-200 hover:bg-slate-50"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        "p-1.5 rounded-lg shrink-0 mt-0.5",
                        isZeroProgress
                          ? "bg-amber-500 text-white"
                          : "bg-slate-200 text-slate-600"
                      )}
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`zero-prog-switch-${activeFloor || "single"}`}
                          className="text-xs font-bold text-slate-800 cursor-pointer"
                        >
                          ¿Día sin avance / Paro de actividad? (0 avance)
                        </Label>
                        {isZeroProgress && (
                          <span className="bg-amber-200/90 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                            Paro activo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Activa esta opción si por lluvia, falta de material, avería u otro motivo no hubo avance hoy. Se fijará en 0 el avance y las horas, protegiendo las métricas del personal.
                      </p>
                    </div>
                  </div>
                  <Switch
                    id={`zero-prog-switch-${activeFloor || "single"}`}
                    checked={isZeroProgress}
                    onCheckedChange={(checked) => handleIsZeroProgressChange(checked)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">
                    Ejecutado hoy {isMultiFloor ? `(${activeFloor})` : ""} *
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max={remainingQty || undefined}
                    value={displayedExecuted}
                    onChange={(e) => handleExecutedChange(e.target.value)}
                    disabled={isZeroProgress}
                    className={
                      isZeroProgress
                        ? "bg-amber-50/70 border-amber-300 text-amber-900 font-bold cursor-not-allowed"
                        : ""
                    }
                  />

                  {resolvedMasterItem && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {isZeroProgress
                        ? "0 fijado por paro de actividad (sin avance hoy)."
                        : isMultiFloor
                        ? `Pendiente de ${activeFloor}: ${remainingQty} ${
                            resolvedMasterItem?.unit || "und"
                          }.`
                        : `Máximo permitido: ${remainingQty} ${
                            resolvedMasterItem?.unit || "und"
                          }.`}
                    </p>
                  )}

                  {!isZeroProgress && goalInfo && (
                    <div
                      className={`mt-1.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
                        goalInfo.onTarget
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {goalInfo.onTarget ? (
                        <>
                          <TrendingUp className="h-3 w-3" />
                          <span>
                            Dentro de meta. Meta: {goalInfo.dailyGoal}{" "}
                            {resolvedMasterItem?.unit || "und"}/día
                          </span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="h-3 w-3" />
                          <span>
                            Bajo meta. Meta: {goalInfo.dailyGoal}{" "}
                            {resolvedMasterItem?.unit || "und"}/día
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-xs">
                    Horas trabajadas {isMultiFloor ? `(${activeFloor})` : ""} *
                  </Label>
                  <Input
                    type="number"
                    step="0.5"
                    placeholder={isZeroProgress ? "0" : "Se calcula del personal si se deja vacío"}
                    value={displayedHours}
                    onChange={(e) => handleHoursChange(e.target.value)}
                    disabled={isZeroProgress}
                    className={
                      isZeroProgress
                        ? "bg-amber-50/70 border-amber-300 text-amber-900 font-bold cursor-not-allowed"
                        : ""
                    }
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {isZeroProgress
                      ? "0 horas fijadas por paro de actividad."
                      : "Máximo recomendado: 10h/día."}
                  </p>
                </div>
              </div>

              {resolvedMasterItem && (
                <div className="flex flex-wrap gap-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <span>
                    <Target className="mr-0.5 inline h-3 w-3" />
                    Total {isMultiFloor ? `(${activeFloor})` : ""}:{" "}
                    <b>
                      {isMultiFloor && activeChild
                        ? activeChild.planned_qty
                        : resolvedMasterItem.planned_qty}{" "}
                      {resolvedMasterItem.unit || "und"}
                    </b>
                  </span>
                  <span>
                    Ejecutado acum.:{" "}
                    <b>
                      {isMultiFloor && activeChild
                        ? activeChild.executed_qty || 0
                        : resolvedMasterItem.executed_qty || 0}
                    </b>
                  </span>
                  <span>
                    Pendiente: <b>{remainingQty}</b>
                  </span>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold">
                    <Users className="h-3.5 w-3.5" />
                    Personal presente {isMultiFloor ? `(${activeFloor})` : ""}
                  </Label>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={addWorker}
                  >
                    <Plus className="h-3 w-3" />
                    Agregar
                  </Button>
                </div>

                {isZeroProgress && (
                  <div className="mb-2.5 rounded-lg border border-emerald-200 bg-emerald-50/80 p-2.5 text-xs text-emerald-800 flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-emerald-900 leading-tight">
                        Métricas de productividad protegidas (Paro de faena)
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        El personal registrado queda guardado como presente en faena, pero con 0 horas y 0 ejecutado. <b>No se penalizará ni afectará su promedio de rendimiento en las analíticas.</b>
                      </p>
                    </div>
                  </div>
                )}

                {displayedWorkers.length === 0 && (
                  <p className="py-2 text-xs italic text-muted-foreground">
                    Sin personal registrado. Puedes agregar trabajadores si lo
                    necesitas.
                  </p>
                )}

                <div className="space-y-2">
                  {displayedWorkers.map((worker, index) => {
                    const selectedOtherWorkerNames = new Set(
                      displayedWorkers
                        .filter((_, workerIdx) => workerIdx !== index)
                        .map((w) => w.name)
                        .filter(Boolean)
                    );
                    const availableWorkers = currentProjectWorkers.filter(
                      (worker) => !selectedOtherWorkerNames.has(worker.name)
                    );

                    return (
                      <div
                        key={index}
                        className="grid grid-cols-1 gap-2 rounded-md border border-border/60 p-2 sm:grid-cols-[minmax(140px,1.4fr)_minmax(120px,1fr)_96px_112px_32px] sm:items-center sm:border-0 sm:p-0"
                      >
                        <Select
                          value={worker.name}
                          onValueChange={(val) =>
                            updateWorker(index, "name", val)
                          }
                        >
                          <SelectTrigger className="h-8 flex-1 text-xs">
                            <SelectValue placeholder="Seleccionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            {worker.name &&
                              !currentProjectWorkers.some(
                                (w) => w.name === worker.name
                              ) && (
                                <SelectItem
                                  key={worker.name}
                                  value={worker.name}
                                >
                                  {worker.name}
                                </SelectItem>
                              )}
                            {currentProjectWorkers.length === 0 ? (
                              <SelectItem
                                value="__none_w__"
                                disabled
                                className="text-xs"
                              >
                                Sin personal registrado
                              </SelectItem>
                            ) : availableWorkers.length === 0 ? (
                              <SelectItem
                                value="__none_available_w__"
                                disabled
                                className="text-xs"
                              >
                                Sin personal disponible
                              </SelectItem>
                            ) : (
                              availableWorkers.map((w) => (
                                <SelectItem
                                  key={w.id}
                                  value={w.name}
                                  className="text-xs"
                                >
                                  {w.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>

                        <Input
                          value={worker.role}
                          readOnly
                          placeholder="Cargo (Automático)"
                          className="h-8 text-xs bg-muted/50 text-muted-foreground select-none"
                        />

                        <Input
                          type="number"
                          placeholder={isZeroProgress ? "0" : "Horas"}
                          className={cn(
                            "h-8 text-xs",
                            isZeroProgress && "bg-slate-100 text-slate-500 font-semibold cursor-not-allowed"
                          )}
                          disabled={isZeroProgress}
                          value={isZeroProgress ? "0" : worker.hours}
                          onChange={(e) =>
                            updateWorker(index, "hours", e.target.value)
                          }
                        />

                        <Input
                          type="number"
                          placeholder={isZeroProgress ? "0" : "Ejecutado"}
                          className={cn(
                            "h-8 text-xs",
                            isZeroProgress && "bg-slate-100 text-slate-500 font-semibold cursor-not-allowed"
                          )}
                          disabled={isZeroProgress}
                          value={isZeroProgress ? "0" : worker.executed}
                          onChange={(e) =>
                            updateWorker(index, "executed", e.target.value)
                          }
                        />

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 justify-self-end text-red-500 hover:text-red-700"
                          onClick={() => removeWorker(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}

                  {displayedWorkers.length > 0 && (
                    <p className="hidden text-[10px] text-muted-foreground sm:block">
                      Columnas: Nombre / Cargo / Horas / Ejecutado
                    </p>
                  )}

                  {hasWorkerExceedingToday && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      El ejecutado de cada integrante no puede superar el ejecutado {isMultiFloor ? `de ${activeFloor}` : "total"} ({executedTodayQty}).
                    </div>
                  )}
                  {hasWorkerExceedingHours && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Las horas de algún integrante superan las horas trabajadas {isMultiFloor ? `de ${activeFloor}` : ""} ({currentHoursLimit}h).
                    </div>
                  )}
                </div>
              </div>

              <div
                className={cn(
                  "space-y-3 rounded-xl border p-3.5 transition-all",
                  isZeroProgress || displayedHasRestriction
                    ? "bg-rose-50/40 border-rose-200"
                    : "bg-muted/20 border-border"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`has-restriction-${activeFloor || "single"}`}
                      checked={displayedHasRestriction}
                      disabled={isZeroProgress}
                      onCheckedChange={handleHasRestrictionChange}
                    />
                    <Label
                      htmlFor={`has-restriction-${activeFloor || "single"}`}
                      className="text-xs font-semibold cursor-pointer"
                    >
                      ¿Tiene restricción? {isMultiFloor ? `(${activeFloor})` : ""}
                    </Label>
                  </div>
                  {isZeroProgress && (
                    <span className="text-[11px] text-rose-600 font-medium">
                      Obligatorio por paro de faena
                    </span>
                  )}
                </div>

                {displayedHasRestriction && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-rose-900">
                        Detalle del motivo o restricción *
                      </Label>
                      <span className="text-[10px] text-muted-foreground">
                        Explica la causa del paro o restricción
                      </span>
                    </div>

                    {/* Botones de causas rápidas de respaldo contractual */}
                    <div className="space-y-1.5 rounded-lg border border-rose-200/60 bg-rose-50/50 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-rose-900 flex items-center gap-1">
                          🛡️ Respaldo Contractual Rápido
                        </span>
                        <span className="text-[10px] text-rose-600">
                          Toca una causa para rellenar
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          "Falta de frente civil / losa no entregada",
                          "Interferencia de otra especialidad / sector bloqueado",
                          "Sin energía eléctrica de faena o corte de agua",
                          "Planos no aprobados / pendiente resolución RFI",
                          "Falta de materiales o quiebre de stock proveedor",
                          "Clima adverso / lluvia o humedad no permitida",
                        ].map((cause) => (
                          <button
                            key={cause}
                            type="button"
                            onClick={() => {
                              const current = displayedRestrictionDetail || "";
                              if (!current.trim()) {
                                handleRestrictionDetailChange(cause);
                              } else if (!current.includes(cause)) {
                                handleRestrictionDetailChange(`${current.trim()}; ${cause}`);
                              }
                            }}
                            className="inline-flex items-center rounded-md border border-rose-300 bg-white px-2 py-1 text-[11px] font-medium text-rose-800 shadow-2xs hover:bg-rose-100 hover:border-rose-400 transition-colors cursor-pointer"
                          >
                            + {cause}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Textarea
                      value={displayedRestrictionDetail}
                      onChange={(e) =>
                        handleRestrictionDetailChange(e.target.value)
                      }
                      className="h-20 bg-white border-rose-200 focus-visible:ring-rose-400 text-xs"
                      placeholder="Explica qué impidió el avance (ej: Lluvia intensa, falta de materiales o camión mixer, falla mecánica de grúa, etc.)..."
                    />
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs">
                  Observaciones {isMultiFloor ? `(${activeFloor})` : ""}
                </Label>
                <Textarea
                  value={displayedObservations}
                  onChange={(e) => handleObservationsChange(e.target.value)}
                  className="h-16"
                  placeholder={`Observaciones del reporte${isMultiFloor ? ` para ${activeFloor}` : ""}...`}
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold">
                      <Camera className="h-3.5 w-3.5" />
                      Fotos del reporte {isMultiFloor ? `(${activeFloor})` : ""}{" "}
                      {REQUIRE_PHOTO ? (
                        <span className="text-destructive">*</span>
                      ) : (
                        <span className="text-muted-foreground">(opcional)</span>
                      )}
                    </Label>
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 font-medium">
                      🛡️ Sello legal indeleble
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={uploadingPhotos}
                    >
                      <Camera className="h-3 w-3" />
                      Cámara
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhotos}
                    >
                      <Plus className="h-3 w-3" />
                      {uploadingPhotos ? "Subiendo..." : "Galería"}
                    </Button>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />

                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </div>

                {REQUIRE_PHOTO && displayedPhotos.length === 0 && (
                  <p className="text-xs font-medium italic text-destructive/70">
                    Obligatorio cargar al menos una foto para {isMultiFloor ? activeFloor : "este reporte"}.
                  </p>
                )}

                {displayedPhotos.length > 0 && (
                  <Accordion type="single" collapsible className="space-y-2">
                    {displayedPhotos.map((photo, index) => (
                      <AccordionItem
                        key={index}
                        value={`photo-${index}`}
                        className="overflow-hidden rounded-lg border border-border"
                      >
                        <div className="flex items-center gap-2 pr-2">
                          <AccordionTrigger className="flex-1 px-3 py-2 hover:no-underline">
                            <div className="flex items-center gap-2 text-left">
                              <img
                                src={getPhotoSrc(photo)}
                                alt={photo.description || "foto"}
                                className="h-10 w-10 shrink-0 rounded-md object-cover"
                              />
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold">
                                    Foto {index + 1}
                                  </span>
                                  {photo.description?.includes("[BLOQUEO]") && (
                                    <span className="bg-rose-100 text-rose-700 text-[9px] font-bold px-1.5 py-0.2 rounded border border-rose-300">
                                      BLOQUEO
                                    </span>
                                  )}
                                  {photo.description?.includes("[AVANCE]") && (
                                    <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-1.5 py-0.2 rounded border border-emerald-300">
                                      SELLADA
                                    </span>
                                  )}
                                </div>
                                <span className="max-w-[220px] truncate text-[10px] text-muted-foreground" title={photo.description}>
                                  {photo.description || "Sin descripción"}
                                </span>
                              </div>
                            </div>
                          </AccordionTrigger>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removePhoto(index);
                            }}
                            className="shrink-0 rounded-full p-1.5 text-red-500 hover:bg-red-50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <AccordionContent className="px-3 pb-3">
                          <img
                            src={getPhotoSrc(photo)}
                            alt={photo.description || "foto"}
                            className="max-h-72 w-full rounded-lg border border-border bg-black/5 object-contain"
                          />

                          <Input
                            type="text"
                            placeholder="Descripción (opcional)"
                            value={photo.description}
                            onChange={(e) =>
                              updatePhotoDescription(index, e.target.value)
                            }
                            className="mt-2 h-8 text-xs"
                          />
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="block text-xs font-semibold">
                    Validación del Capataz{" "}
                    {!REQUIRE_CAPATAZ && (
                      <span className="text-muted-foreground">(opcional)</span>
                    )}
                  </Label>
                </div>

                <div>
                  <Label className="text-xs">Nombre del capataz</Label>

                  <Select
                    value={form.capataz_name}
                    onValueChange={(v) => updateFormField("capataz_name", v)}
                    disabled={isCapatazFixed}
                  >
                    <SelectTrigger disabled={isCapatazFixed}>
                      <SelectValue placeholder="Seleccionar capataz" />
                    </SelectTrigger>

                    <SelectContent>
                      {form.capataz_name &&
                        !capataces.some((u) => u.full_name === form.capataz_name) && (
                          <SelectItem
                            key={form.capataz_name}
                            value={form.capataz_name}
                          >
                            {form.capataz_name}
                          </SelectItem>
                        )}
                      {capataces.length === 0 && !form.capataz_name ? (
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

                  {isCapatazFixed && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Capataz fijado por la obra seleccionada.
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-xs">
                    Firma del capataz{" "}
                    {REQUIRE_SIGNATURE ? (
                      <span className="text-destructive">*</span>
                    ) : (
                      <span className="text-muted-foreground">(opcional)</span>
                    )}
                  </Label>

                  {!showSignaturePad ? (
                    <>
                      {displayedSignature ? (
                        <div className="flex items-end gap-2">
                          <img
                            src={displayedSignature}
                            alt="firma"
                            className="h-16 rounded-lg border border-border bg-white p-2"
                          />

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowSignaturePad(true)}
                          >
                            Cambiar firma
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full gap-2"
                          onClick={() => setShowSignaturePad(true)}
                        >
                          <PenTool className="h-4 w-4" />
                          Dibujar firma
                        </Button>
                      )}
                    </>
                  ) : (
                    <SignaturePad
                      onSave={(signature) => handleSaveSignature(signature)}
                      onCancel={() => setShowSignaturePad(false)}
                    />
                  )}
                </div>

                <p className="text-[10px] italic text-muted-foreground">
                  La firma se guardará como archivo PNG asociado al reporte diario.
                  No aparecerá en la galería fotográfica del ítem.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={handleUserCancel} disabled={saving || uploadingPhotos}>
            Cancelar
          </Button>

          <Button onClick={handleSave} disabled={isSaveDisabled}>
            {saving
              ? "Guardando..."
              : uploadingPhotos
                ? "Subiendo fotos..."
                : "Guardar Reporte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}