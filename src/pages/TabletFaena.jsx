import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { stampPhotoWatermark } from "@/utils/watermark";
import {
  Building2,
  Car,
  Trees,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Trash2,
  Layers,
  MapPin,
  Clock,
  User,
  ShieldAlert,
  Loader2,
  Plus,
  ArrowRight,
  Maximize2,
  X,
  FileText,
  Calendar,
  Sparkles,
  Flame,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const COMMON_ACTIVITIES = [
  "Tuberías y Cajas en Losa (Hormigón)",
  "Canalización y Cajas en Muros",
  "Alambrado y Cableado Eléctrico",
  "Montaje de Tableros Eléctricos",
  "Instalación de Artefactos y Luminarias",
  "Corrientes Débiles / Citofonía / CCTV",
  "Bandejas Portaconductores",
  "Alumbrado y Postes Exteriores",
  "Alimentadores y Subalimentadores",
];

const BLOCKAGE_REASONS = [
  { id: "losa_descimbre", label: "Losa no descimbrada por Constructora", icon: "🏗️" },
  { id: "enfierradura", label: "Enfierradura / Malla incompleta", icon: "🧱" },
  { id: "moldajes", label: "Falta de moldaje o trazado de muros", icon: "🛑" },
  { id: "inundacion", label: "Inundación / Aguas lluvias acumuladas", icon: "💧" },
  { id: "interferencia", label: "Interferencia Sanitario / Climatización", icon: "⚠️" },
  { id: "tabiqueria", label: "Falta de tabiquería / yeso-cartón", icon: "🚪" },
  { id: "materiales", label: "Falta de suministro o material de cliente", icon: "📦" },
  { id: "otro", label: "Otro impedimento de obra civil", icon: "📝" },
];

const STAGES = [
  { label: "Iniciado (25%)", value: "Iniciado (25%)", pct: 25 },
  { label: "En Progreso (50%)", value: "En Progreso (50%)", pct: 50 },
  { label: "Avanzado (75%)", value: "Avanzado (75%)", pct: 75 },
  { label: "Terminado / Listo Hormigón (100%)", value: "Terminado (100%)", pct: 100 },
];

function safeParse(val, fallback = []) {
  if (!val) return fallback;
  if (Array.isArray(val)) return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

export default function TabletFaena() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  // 1. Fetch available projects
  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects"),
  });

  // Selected project state
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      // Prioritize project assigned to user if viewer/capataz
      let defaultProj = projects[0];
      if (user?.allowed_projects && user.allowed_projects.length > 0) {
        const found = projects.find(p => String(p.id) === String(user.allowed_projects[0]) || p.name === user.allowed_projects[0]);
        if (found) defaultProj = found;
      }
      setSelectedProjectId(defaultProj.id);
    }
  }, [projects, selectedProjectId, user]);

  const activeProject = projects.find(p => p.id === selectedProjectId) || projects[0] || null;

  // Parsed project structure
  const projectFloors = safeParse(activeProject?.floors, []);
  const projectDepartments = safeParse(activeProject?.departments, {});
  const projectSubterraneos = safeParse(activeProject?.subterraneos, []);
  const projectExteriores = safeParse(activeProject?.exteriores, []);
  const projectAreasComunes = safeParse(activeProject?.areas_comunes, []);

  // 2. Location Selection State
  const [zoneType, setZoneType] = useState("torre"); // 'torre' | 'subterraneo' | 'exterior' | 'comun' | 'libre'
  const [selectedTower, setSelectedTower] = useState("Torre 1");
  const [selectedFloor, setSelectedFloor] = useState("");
  const [selectedDepto, setSelectedDepto] = useState("");
  const [selectedSubterraneo, setSelectedSubterraneo] = useState("");
  const [selectedExterior, setSelectedExterior] = useState("");
  const [selectedAreaComun, setSelectedAreaComun] = useState("");
  const [recintoLibre, setRecintoLibre] = useState("");

  // Default floor when switching to torre
  useEffect(() => {
    if (zoneType === "torre" && projectFloors.length > 0 && !selectedFloor) {
      setSelectedFloor(projectFloors[0]);
    }
  }, [zoneType, projectFloors, selectedFloor]);

  // Compute active location string
  const activeLocationStr = (() => {
    if (zoneType === "torre") {
      let loc = `${selectedTower || "Torre 1"} • ${selectedFloor || "Piso no seleccionado"}`;
      if (selectedDepto) loc += ` • Depto ${selectedDepto}`;
      return loc;
    }
    if (zoneType === "subterraneo") {
      return selectedSubterraneo || "Subterráneo general";
    }
    if (zoneType === "exterior") {
      return selectedExterior || "Zona Exterior";
    }
    if (zoneType === "comun") {
      return selectedAreaComun || "Sala Técnica / Común";
    }
    if (zoneType === "libre") {
      return recintoLibre.trim() || "Recinto sin especificar";
    }
    return "Ubicación General";
  })();

  // 3. Primary Mode: 🟢 Avance vs 🔴 Bloqueo
  const [mode, setMode] = useState("avance"); // 'avance' | 'bloqueo'

  // Form Fields for Avance
  const [activity, setActivity] = useState(COMMON_ACTIVITIES[0]);
  const [customActivity, setCustomActivity] = useState("");
  const [stage, setStage] = useState(STAGES[1].value);
  const [crewCount, setCrewCount] = useState(2);
  const [hoursWorked, setHoursWorked] = useState(8);

  // Form Fields for Bloqueo
  const [blockageReason, setBlockageReason] = useState(BLOCKAGE_REASONS[0].label);
  const [hoursLost, setHoursLost] = useState(4);

  // Common Fields
  const [observations, setObservations] = useState("");
  const [stampedPhotos, setStampedPhotos] = useState([]); // array of { file, previewUrl, summaryText, file_url }
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [previewModalImg, setPreviewModalImg] = useState(null);

  // 4. Fetch Recent Logs for Active Project
  const { data: recentLogs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["daily-logs-project", activeProject?.id, activeProject?.name],
    queryFn: async () => {
      if (!activeProject?.name) return [];
      const logs = await api.get("/daily-logs");
      return logs
        .filter(l => String(l.project).trim().toLowerCase() === String(activeProject.name).trim().toLowerCase())
        .slice(0, 10);
    },
    enabled: Boolean(activeProject?.name),
  });

  // Photo Capture & Client-Side Watermarking
  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingPhoto(true);

      const metadata = {
        projectName: activeProject?.name || "Obra Faena",
        location: activeLocationStr,
        author: user?.full_name || "Capataz Faena",
        type: mode === "bloqueo" ? "BLOQUEO" : "AVANCE",
        cause: mode === "bloqueo" ? blockageReason : "",
        note: observations.trim(),
        timestamp: new Date(),
      };

      // Stamp watermark directly into pixels
      const stamped = await stampPhotoWatermark(file, metadata);

      // Upload stamped photo to backend
      const formData = new FormData();
      formData.append("photo", stamped.file);

      const uploadRes = await api.post("/upload", formData);

      const newPhotoEntry = {
        file: stamped.file,
        previewUrl: stamped.previewUrl,
        summaryText: stamped.summaryText,
        file_url: uploadRes.file_url,
        thumb_url: uploadRes.thumb_url,
        photo_type: mode === "bloqueo" ? "bloqueo" : "avance",
        watermark_text: stamped.summaryText,
      };

      setStampedPhotos(prev => [...prev, newPhotoEntry]);
    } catch (err) {
      console.error("Error al procesar foto con sello:", err);
      alert("Error procesando foto con sello: " + (err.message || "Error desconocido"));
    } finally {
      setIsProcessingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = (index) => {
    setStampedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Submit Handler
  const handleSubmit = async () => {
    if (!activeProject) {
      alert("Debe seleccionar una obra.");
      return;
    }

    if (mode === "bloqueo" && stampedPhotos.length === 0) {
      const confirmNoPhoto = window.confirm(
        "ADVERTENCIA: Para un Frente Bloqueado por Constructora es altamente recomendable adjuntar la foto con sello como respaldo legal.\n¿Deseas registrarlo de todas formas?"
      );
      if (!confirmNoPhoto) return;
    }

    try {
      setSubmitting(true);

      const chosenActivity = activity === "__custom__" ? customActivity.trim() || "Actividad Personalizada" : activity;

      const payload = {
        project: activeProject.name,
        log_type: mode,
        zone_type: zoneType,
        tower: selectedTower || "Torre 1",
        floor: zoneType === "torre" ? selectedFloor : (zoneType === "subterraneo" ? selectedSubterraneo : (zoneType === "exterior" ? selectedExterior : selectedAreaComun)),
        recinto_libre: zoneType === "libre" ? recintoLibre : (zoneType === "torre" && selectedDepto ? `Depto ${selectedDepto}` : ""),
        activity: chosenActivity,
        stage_reached: mode === "avance" ? stage : "",
        cause_category: mode === "bloqueo" ? blockageReason : "",
        hours_lost: mode === "bloqueo" ? Number(hoursLost) : 0,
        hours_worked: mode === "avance" ? Number(hoursWorked) : 0,
        executed_today: mode === "avance" ? (stage.includes("100") ? 100 : 25) : 0,
        crew_name: `Cuadrilla (${crewCount} electricistas)`,
        crew_workers: Array.from({ length: crewCount }, (_, i) => ({
          name: `Operario ${i + 1}`,
          role: "Electricista Faena",
          hours: Number(hoursWorked) || 8,
          executed: 1,
        })),
        supervisor: activeProject.supervisor || "Supervisor",
        capataz_name: user?.full_name || "Capataz",
        observations: observations.trim(),
        photos: stampedPhotos.map(p => ({
          file_url: p.file_url,
          description: observations.trim() || (mode === "bloqueo" ? blockageReason : "Avance registrado"),
          label: mode === "bloqueo" ? "restriccion" : "avance",
          photo_type: p.photo_type,
          watermark_text: p.watermark_text,
          date: new Date().toISOString().split("T")[0],
        })),
        date: new Date().toISOString().split("T")[0],
      };

      await api.post("/daily-logs/faena", payload);

      setFeedbackMsg({
        type: mode,
        title: mode === "avance" ? "¡Avance Registrado con Éxito!" : "¡Frente Bloqueado Notificado!",
        detail: `${activeLocationStr} • ${mode === "avance" ? stage : blockageReason}`,
      });

      // Reset specific inputs
      setStampedPhotos([]);
      setObservations("");
      if (mode === "bloqueo") {
        setHoursLost(4);
      }

      refetchLogs();
      queryClient.invalidateQueries(["daily-logs"]);
      queryClient.invalidateQueries(["master-items"]);
      queryClient.invalidateQueries(["restrictions"]);

      setTimeout(() => {
        setFeedbackMsg(null);
      }, 5000);
    } catch (err) {
      console.error("Error al guardar reporte de faena:", err);
      alert("Error al guardar: " + (err.message || "Error desconocido"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-3 sm:p-5 md:p-6 pb-24 font-inter selection:bg-orange-500 selection:text-white">
      {/* Top Banner: Tablet Header */}
      <div className="max-w-4xl mx-auto space-y-4">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800/90 border border-slate-700/80 p-3.5 sm:p-4 rounded-2xl shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
              <Flame className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-widest font-black text-orange-400">
                  Modo Tablet Faena
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  En Línea
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-black text-white leading-tight">
                Control de Avance & Respaldos Legales
              </h1>
            </div>
          </div>

          {/* Project selector dropdown */}
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
            <select
              value={selectedProjectId || ""}
              onChange={(e) => setSelectedProjectId(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.client ? `(${p.client})` : ""}
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* Success / Feedback Toast Alert */}
        {feedbackMsg && (
          <div className={cn(
            "p-4 rounded-2xl border shadow-2xl flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-300",
            feedbackMsg.type === "avance"
              ? "bg-emerald-950/90 border-emerald-500/80 text-emerald-100"
              : "bg-red-950/90 border-red-500/80 text-red-100"
          )}>
            <div className="flex items-center gap-3">
              {feedbackMsg.type === "avance" ? (
                <CheckCircle2 className="h-7 w-7 text-emerald-400 shrink-0" />
              ) : (
                <ShieldAlert className="h-7 w-7 text-red-400 shrink-0" />
              )}
              <div>
                <p className="text-sm font-extrabold">{feedbackMsg.title}</p>
                <p className="text-xs opacity-90">{feedbackMsg.detail}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFeedbackMsg(null)}
              className="h-8 text-xs font-bold"
            >
              Cerrar
            </Button>
          </div>
        )}

        {/* PASO 1: SELECTOR DE UBICACIÓN FÍSICA (Touch First) */}
        <section className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-xl space-y-3.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-orange-400" />
              1. ¿En qué sector estás operando?
            </Label>
            <span className="text-[11px] font-bold text-slate-400">
              Toca para cambiar de frente
            </span>
          </div>

          {/* 5 Macro-zone Selector Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { id: "torre", label: "Torre y Pisos", icon: Layers, color: "text-orange-400" },
              { id: "subterraneo", label: "Subterráneo", icon: Car, color: "text-blue-400" },
              { id: "exterior", label: "Exteriores", icon: Trees, color: "text-emerald-400" },
              { id: "comun", label: "Salas Técnicas", icon: Zap, color: "text-amber-400" },
              { id: "libre", label: "Recinto Libre", icon: Plus, color: "text-purple-400" },
            ].map((z) => {
              const Icon = z.icon;
              const isActive = zoneType === z.id;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setZoneType(z.id)}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition-all gap-1.5 min-h-[64px]",
                    isActive
                      ? "bg-slate-700 border-orange-500 text-white shadow-lg shadow-orange-500/10 ring-2 ring-orange-500/30"
                      : "bg-slate-900/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  )}
                >
                  <Icon className={cn("h-5 w-5", z.color)} />
                  <span>{z.label}</span>
                </button>
              );
            })}
          </div>

          {/* Sub-selector depending on zone */}
          <div className="pt-2 border-t border-slate-750">
            {/* Case 1: Torre */}
            {zoneType === "torre" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-400 mb-1.5 block">
                      Selecciona el Piso:
                    </Label>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-slate-900/80 rounded-xl border border-slate-700/60">
                      {projectFloors.length === 0 ? (
                        <p className="text-xs text-slate-500 p-2">Sin pisos configurados en esta obra.</p>
                      ) : (
                        projectFloors.map((fl) => (
                          <button
                            key={fl}
                            type="button"
                            onClick={() => {
                              setSelectedFloor(fl);
                              setSelectedDepto("");
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                              selectedFloor === fl
                                ? "bg-orange-500 text-white shadow-md"
                                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                            )}
                          >
                            {fl}
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Deptos for selected floor */}
                  <div>
                    <Label className="text-xs text-slate-400 mb-1.5 block">
                      Depto específico (Opcional):
                    </Label>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-slate-900/80 rounded-xl border border-slate-700/60">
                      <button
                        type="button"
                        onClick={() => setSelectedDepto("")}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                          !selectedDepto
                            ? "bg-orange-500 text-white"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        )}
                      >
                        Piso Completo / Pasillo
                      </button>
                      {(projectDepartments[selectedFloor] || []).map((dep) => (
                        <button
                          key={dep}
                          type="button"
                          onClick={() => setSelectedDepto(dep)}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                            selectedDepto === dep
                              ? "bg-orange-500 text-white"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          )}
                        >
                          Dpto {dep}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Case 2: Subterráneos */}
            {zoneType === "subterraneo" && (
              <div className="space-y-2">
                <Label className="text-xs text-slate-400 block">
                  Nivel Subterráneo / Estacionamiento:
                </Label>
                <div className="flex flex-wrap gap-2">
                  {projectSubterraneos.length === 0 ? (
                    <p className="text-xs text-slate-500">No hay subterráneos creados en esta obra. Puedes usar Recinto Libre.</p>
                  ) : (
                    projectSubterraneos.map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setSelectedSubterraneo(sub)}
                        className={cn(
                          "px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5",
                          selectedSubterraneo === sub
                            ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20"
                            : "bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800"
                        )}
                      >
                        <Car className="h-3.5 w-3.5" />
                        <span>{sub}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Case 3: Exteriores */}
            {zoneType === "exterior" && (
              <div className="space-y-2">
                <Label className="text-xs text-slate-400 block">
                  Frente Exterior / Urbanización:
                </Label>
                <div className="flex flex-wrap gap-2">
                  {projectExteriores.length === 0 ? (
                    <p className="text-xs text-slate-500">No hay frentes exteriores registrados en esta obra.</p>
                  ) : (
                    projectExteriores.map((ext) => (
                      <button
                        key={ext}
                        type="button"
                        onClick={() => setSelectedExterior(ext)}
                        className={cn(
                          "px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5",
                          selectedExterior === ext
                            ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                            : "bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800"
                        )}
                      >
                        <Trees className="h-3.5 w-3.5" />
                        <span>{ext}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Case 4: Salas Técnicas */}
            {zoneType === "comun" && (
              <div className="space-y-2">
                <Label className="text-xs text-slate-400 block">
                  Sala Técnica o Recinto Central:
                </Label>
                <div className="flex flex-wrap gap-2">
                  {projectAreasComunes.length === 0 ? (
                    <p className="text-xs text-slate-500">No hay salas técnicas configuradas en esta obra.</p>
                  ) : (
                    projectAreasComunes.map((com) => (
                      <button
                        key={com}
                        type="button"
                        onClick={() => setSelectedAreaComun(com)}
                        className={cn(
                          "px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5",
                          selectedAreaComun === com
                            ? "bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-500/20"
                            : "bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800"
                        )}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        <span>{com}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Case 5: Recinto Libre */}
            {zoneType === "libre" && (
              <div className="space-y-2">
                <Label className="text-xs text-slate-400 block">
                  Escribe el sector o recinto no registrado (Nunca te quedes bloqueado):
                </Label>
                <Input
                  value={recintoLibre}
                  onChange={(e) => setRecintoLibre(e.target.value)}
                  placeholder="Ej: Shaft Poniente Piso 18 / Rampa Entrada Vehicular"
                  className="bg-slate-900 border-slate-700 text-white font-bold text-sm h-11"
                />
              </div>
            )}
          </div>

          {/* Active Location Display Pill */}
          <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-slate-400">Frente Activo:</span>
              <span className="text-xs sm:text-sm font-black text-white">{activeLocationStr}</span>
            </div>
            <span className="text-[11px] font-bold text-orange-400 uppercase tracking-wider">
              {activeProject?.name}
            </span>
          </div>
        </section>

        {/* PASO 2: LOS DOS GRANDES BOTONES DE FAENA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {/* Botón 1: 🟢 REPORTAR AVANCE */}
          <button
            type="button"
            onClick={() => setMode("avance")}
            className={cn(
              "p-5 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between min-h-[140px]",
              mode === "avance"
                ? "bg-gradient-to-br from-emerald-950/80 to-slate-900 border-emerald-500 shadow-2xl shadow-emerald-500/20 ring-2 ring-emerald-500/40"
                : "bg-slate-800/70 border-slate-700/70 opacity-60 hover:opacity-90"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              {mode === "avance" && (
                <Badge className="bg-emerald-500 text-slate-950 font-black text-[10px]">
                  SELECCIONADO
                </Badge>
              )}
            </div>
            <div className="mt-3">
              <h2 className="text-lg font-black text-white leading-tight">
                🟢 Reportar Avance de Trabajo
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Registra hitos terminados, cuadrilla presente y foto con sello de agua legal.
              </p>
            </div>
          </button>

          {/* Botón 2: 🔴 FRENTE BLOQUEADO */}
          <button
            type="button"
            onClick={() => setMode("bloqueo")}
            className={cn(
              "p-5 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between min-h-[140px]",
              mode === "bloqueo"
                ? "bg-gradient-to-br from-red-950/90 to-slate-900 border-red-500 shadow-2xl shadow-red-500/20 ring-2 ring-red-500/40"
                : "bg-slate-800/70 border-slate-700/70 opacity-60 hover:opacity-90"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="h-12 w-12 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                <ShieldAlert className="h-7 w-7 text-red-400" />
              </div>
              {mode === "bloqueo" && (
                <Badge className="bg-red-500 text-white font-black text-[10px]">
                  DEFENSA CONTRACTUAL
                </Badge>
              )}
            </div>
            <div className="mt-3">
              <h2 className="text-lg font-black text-white leading-tight">
                🔴 Frente Bloqueado / Restricción
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Genera respaldo legal inmediato si la constructora no tiene el frente liberado.
              </p>
            </div>
          </button>
        </div>

        {/* PASO 3: DETALLE DEL REPORTE SEGÚN EL MODO ELEGIDO */}
        <section className={cn(
          "p-4 sm:p-5 rounded-2xl border shadow-2xl space-y-4 transition-all",
          mode === "avance"
            ? "bg-slate-800/90 border-emerald-500/50"
            : "bg-slate-800/90 border-red-500/50"
        )}>
          {/* MODO AVANCE */}
          {mode === "avance" && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-bold text-slate-300 mb-1.5 block">
                  Actividad ejecutada hoy:
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_ACTIVITIES.map((act) => (
                    <button
                      key={act}
                      type="button"
                      onClick={() => setActivity(act)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all text-left",
                        activity === act
                          ? "bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-500/20"
                          : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700"
                      )}
                    >
                      {act}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setActivity("__custom__")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                      activity === "__custom__"
                        ? "bg-emerald-600 border-emerald-500 text-white"
                        : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700"
                    )}
                  >
                    + Otra actividad
                  </button>
                </div>

                {activity === "__custom__" && (
                  <Input
                    value={customActivity}
                    onChange={(e) => setCustomActivity(e.target.value)}
                    placeholder="Escribe la actividad específica"
                    className="mt-2 bg-slate-900 border-slate-700 text-white font-bold"
                  />
                )}
              </div>

              {/* Hito de avance alcanzado */}
              <div>
                <Label className="text-xs font-bold text-slate-300 mb-1.5 block">
                  Hito o estado de avance alcanzado:
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {STAGES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStage(s.value)}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs font-extrabold transition-all text-center flex flex-col items-center justify-center gap-1",
                        stage === s.value
                          ? "bg-emerald-600 border-emerald-400 text-white shadow-md"
                          : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700"
                      )}
                    >
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cuadrilla rápida */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-700/60">
                <div className="flex items-center justify-between p-3 bg-slate-900/80 rounded-xl border border-slate-700/60">
                  <span className="text-xs font-bold text-slate-300">Personal en el frente:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCrewCount(prev => Math.max(1, prev - 1))}
                      className="h-8 w-8 rounded-lg bg-slate-800 text-white font-black text-sm hover:bg-slate-700"
                    >
                      -
                    </button>
                    <span className="text-sm font-black text-emerald-400 w-8 text-center">{crewCount}</span>
                    <button
                      type="button"
                      onClick={() => setCrewCount(prev => prev + 1)}
                      className="h-8 w-8 rounded-lg bg-slate-800 text-white font-black text-sm hover:bg-slate-700"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-900/80 rounded-xl border border-slate-700/60">
                  <span className="text-xs font-bold text-slate-300">Horas trabajadas:</span>
                  <div className="flex items-center gap-1.5">
                    {[4, 8, 9].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setHoursWorked(h)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all",
                          hoursWorked === h
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        )}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MODO BLOQUEO */}
          {mode === "bloqueo" && (
            <div className="space-y-4">
              <div className="p-3 bg-red-950/70 border border-red-500/50 rounded-xl text-red-200">
                <p className="text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  Registro de Interferencia / Paralización por Constructora
                </p>
                <p className="text-[11px] text-red-300 mt-1 leading-relaxed">
                  Este registro y su fotografía sellada quedarán acreditados con hora exacta para presentar al Administrador de Obra e ITO ante cualquier reclamo de plazos.
                </p>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-300 mb-1.5 block">
                  Causa principal del impedimento:
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {BLOCKAGE_REASONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setBlockageReason(r.label)}
                      className={cn(
                        "p-3 rounded-xl border text-xs font-bold transition-all text-left flex items-center gap-2.5",
                        blockageReason === r.label
                          ? "bg-red-950 border-red-500 text-white shadow-lg shadow-red-500/20 ring-1 ring-red-500"
                          : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-750"
                      )}
                    >
                      <span className="text-lg">{r.icon}</span>
                      <span>{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-900/80 rounded-xl border border-slate-700/60">
                <span className="text-xs font-bold text-slate-300">Horas detenidas de cuadrilla:</span>
                <div className="flex items-center gap-1.5">
                  {[2, 4, 8].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHoursLost(h)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all",
                        hoursLost === h
                          ? "bg-red-600 text-white shadow-md shadow-red-600/30"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      )}
                    >
                      {h} horas
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* OBSERVACIONES / NOTA RÁPIDA */}
          <div>
            <Label className="text-xs font-bold text-slate-300 mb-1.5 block">
              Observación o detalle para el Libro de Obras:
            </Label>
            <Textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder={mode === "bloqueo" ? "Ej: Constructora no terminó el descimbre de alzaprimas en zona oriente..." : "Ej: Trabajo completado sin novedades, listo para revisión de ITO..."}
              className="bg-slate-900 border-slate-700 text-white text-xs min-h-[70px]"
            />
          </div>

          {/* SECCIÓN FOTOGRAFÍA CON SELLO INDELEBLE */}
          <div className="pt-2 border-t border-slate-750 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Camera className="h-4 w-4 text-orange-400" />
                Fotografía de Respaldo con Sello de Agua Automático
              </Label>
              <span className="text-[10.5px] text-slate-400 font-semibold">
                Sello indeleble con fecha, hora y frente
              </span>
            </div>

            {/* Input file escondido que dispara la cámara nativa de la tablet */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={fileInputRef}
              onChange={handlePhotoCapture}
              className="hidden"
            />

            <div className="flex flex-col sm:flex-row gap-3 items-stretch">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingPhoto}
                className={cn(
                  "flex-1 p-4 rounded-xl border-2 border-dashed flex items-center justify-center gap-2.5 font-black text-sm transition-all min-h-[58px]",
                  mode === "bloqueo"
                    ? "border-red-500/60 bg-red-950/20 text-red-300 hover:bg-red-950/40"
                    : "border-emerald-500/60 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-950/40"
                )}
              >
                {isProcessingPhoto ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Estampando Sello Legal...</span>
                  </>
                ) : (
                  <>
                    <Camera className="h-5 w-5" />
                    <span>Tomar Foto con Sello Indeleble</span>
                  </>
                )}
              </button>
            </div>

            {/* Galería de Fotos Selladas */}
            {stampedPhotos.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {stampedPhotos.map((p, idx) => (
                  <div
                    key={idx}
                    className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900 group shadow-lg"
                  >
                    <img
                      src={p.previewUrl}
                      alt="Foto Sellada"
                      className="w-full h-44 object-cover cursor-pointer"
                      onClick={() => setPreviewModalImg(p.previewUrl)}
                    />
                    <div className="p-2 bg-slate-950/90 text-[10px] text-slate-300 border-t border-slate-800 flex items-center justify-between">
                      <span className="truncate pr-2 font-semibold">
                        {p.summaryText}
                      </span>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewModalImg(p.previewUrl)}
                          className="p-1 hover:text-white"
                          title="Ampliar"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className="p-1 hover:text-red-400"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* BOTÓN FINAL DE GUARDAR */}
          <div className="pt-3">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || isProcessingPhoto}
              className={cn(
                "w-full h-14 rounded-2xl text-base font-black shadow-2xl flex items-center justify-center gap-2 transition-all",
                mode === "avance"
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/30"
                  : "bg-red-600 hover:bg-red-500 text-white shadow-red-500/30"
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span>Guardando en Servidor Local...</span>
                </>
              ) : mode === "avance" ? (
                <>
                  <CheckCircle2 className="h-6 w-6" />
                  <span>GUARDAR AVANCE DE FAENA</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-6 w-6" />
                  <span>REGISTRAR FRENTE BLOQUEADO</span>
                </>
              )}
            </Button>
          </div>
        </section>

        {/* FEED DE REGISTROS RECIENTES DE HOY EN ESTA OBRA */}
        <section className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-orange-400" />
              Últimos registros en {activeProject?.name}
            </Label>
            <span className="text-[11px] text-slate-400 font-bold">
              {recentLogs.length} reportes
            </span>
          </div>

          {recentLogs.length === 0 ? (
            <div className="border border-dashed border-slate-700/80 rounded-xl p-5 text-center text-xs text-slate-500">
              No hay reportes registrados hoy para esta obra. Comienza reportando arriba.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {recentLogs.map((log) => {
                const isBlock = log.log_type === "bloqueo" || log.has_restriction;
                return (
                  <div
                    key={log.id}
                    className={cn(
                      "p-3 rounded-xl border flex items-center justify-between text-xs transition-all",
                      isBlock
                        ? "bg-red-950/30 border-red-500/40 text-red-200"
                        : "bg-slate-900/60 border-slate-700/60 text-slate-200"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                        isBlock ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"
                      )}>
                        {isBlock ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white">{log.floor || log.recinto_libre || "General"}</span>
                          <span className="text-[10px] text-slate-400">• {log.date}</span>
                          {isBlock && (
                            <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[9px] py-0 px-1.5">
                              Bloqueo
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          {log.activity} {log.stage_reached ? `(${log.stage_reached})` : ""}
                          {log.cause_category ? ` - Causa: ${log.cause_category}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold shrink-0">
                      Por: {log.capataz_name || "Capataz"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Modal para ver foto ampliada */}
      {previewModalImg && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewModalImg(null)}
        >
          <div className="relative max-w-3xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-700">
            <button
              onClick={() => setPreviewModalImg(null)}
              className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center z-10 hover:bg-black"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={previewModalImg}
              alt="Foto Ampliada con Sello"
              className="w-full max-h-[80vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
