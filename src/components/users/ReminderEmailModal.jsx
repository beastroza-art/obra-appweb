import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Zap,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

export default function ReminderEmailModal({ open, onOpenChange }) {
  const { user } = useAuth();

  // Tipo de plantilla
  const [selectedType, setSelectedType] = useState("activities"); // 'activities' | 'monday'

  // Auditoría y selección de destinatarios
  const [auditData, setAuditData] = useState(null);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [copyToAdmin, setCopyToAdmin] = useState(true);

  // Estados de envío y alertas
  const [isSending, setIsSending] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [batchSummary, setBatchSummary] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Vista previa
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Cargar lista de destinatarios y su estado en tiempo real
  const fetchAuditData = async () => {
    setIsLoadingAudit(true);
    try {
      const res = await api.get("/reminders/recipients-audit");
      setAuditData(res);

      // Por defecto marcar a los que tienen alertas o faenas pendientes
      if (Array.isArray(res?.workers)) {
        const initialSelected = new Set(
          res.workers
            .filter((w) => w.shouldSend && w.email && w.email.includes("@"))
            .map((w) => w.id)
        );
        // Si ninguno tiene alertas, seleccionar todos los que tengan correo
        if (initialSelected.size === 0) {
          res.workers.forEach((w) => {
            if (w.email && w.email.includes("@")) initialSelected.add(w.id);
          });
        }
        setSelectedUserIds(initialSelected);
      }
    } catch (err) {
      console.error("Error al auditar destinatarios:", err);
      setErrorMessage("No se pudo cargar la lista de trabajadores de terreno.");
    } finally {
      setIsLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (open) {
      setResultMessage(null);
      setErrorMessage(null);
      setBatchSummary(null);
      fetchAuditData();
    }
  }, [open]);

  // Manejo de selección individual
  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  // Seleccionar todos los trabajadores con correo
  const handleSelectAll = () => {
    if (!auditData?.workers) return;
    const all = new Set(
      auditData.workers
        .filter((w) => w.email && w.email.includes("@"))
        .map((w) => w.id)
    );
    setSelectedUserIds(all);
  };

  // Seleccionar solo los que tienen alertas (atrasos, por vencer o firmas pendientes)
  const handleSelectOnlyAlerts = () => {
    if (!auditData?.workers) return;
    const onlyAlerts = new Set(
      auditData.workers
        .filter((w) => w.shouldSend && w.email && w.email.includes("@"))
        .map((w) => w.id)
    );
    setSelectedUserIds(onlyAlerts);
  };

  // Desmarcar todos
  const handleDeselectAll = () => {
    setSelectedUserIds(new Set());
  };

  // Ejecutar el disparo masivo real en vivo a los seleccionados
  const handleTriggerSend = async () => {
    const count = selectedUserIds.size;
    if (count === 0) {
      setErrorMessage("Por favor selecciona al menos a un trabajador de la lista.");
      return;
    }

    const confirmText = `¿Confirmas disparar el envío real en vivo a los ${count} trabajadores seleccionados ahora mismo?`;
    if (!window.confirm(confirmText)) return;

    setIsSending(true);
    setResultMessage(null);
    setErrorMessage(null);
    setBatchSummary(null);

    try {
      const res = await api.post("/reminders/trigger-now", {
        type: selectedType,
        userIds: Array.from(selectedUserIds),
        copyToAdmin,
      });

      if (res?.success) {
        setResultMessage(res.message);
        setBatchSummary(res.summary);
        fetchAuditData(); // refrescar estados
      } else {
        setErrorMessage(res?.error || "Error al disparar el lote de correos.");
      }
    } catch (err) {
      setErrorMessage(err.message || "Error al conectar con el servidor.");
    } finally {
      setIsSending(false);
    }
  };

  // Cargar vista previa del HTML
  const handleLoadPreview = async (typeToPreview = selectedType) => {
    setIsLoadingPreview(true);
    setShowPreview(true);
    try {
      const res = await fetch(`/api/reminders/preview?type=${typeToPreview}`, {
        headers: { "x-user-email": user?.email || "" },
      });
      const html = await res.text();
      setPreviewHtml(html);
    } catch (err) {
      setPreviewHtml(`<div style="color: red; padding: 20px;">Error al cargar vista previa: ${err.message}</div>`);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-4">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center text-red-700 shadow-sm">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900">
                  Disparo Real en Vivo de Correos a Terreno
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Selecciona la plantilla y marca exactamente a qué capataces y supervisores enviar el correo.
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] gap-1 py-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              SMTP Gmail Conectado
            </Badge>
          </div>
        </DialogHeader>

        {/* Notificaciones */}
        {resultMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-xs text-emerald-800 animate-in fade-in mt-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-900">¡Envíos completados con éxito!</p>
              <p className="mt-0.5">{resultMessage}</p>
              {batchSummary && (
                <div className="mt-1.5 pt-1.5 border-t border-emerald-200 text-[11px]">
                  <strong>Resumen: </strong>
                  {batchSummary.sent} correos entregados exitosamente de {batchSummary.total} procesados.
                  {copyToAdmin && user?.email && (
                    <span className="block mt-0.5 text-emerald-700">
                      ✉️ Se envió una copia de confirmación a tu correo ({user.email}).
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800 animate-in fade-in mt-1">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Atención</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        <div className="space-y-4 pt-1">
          {/* PASO 1: SELECCIÓN DE PLANTILLA */}
          <div>
            <Label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              1. Selecciona la Plantilla de Correo a Enviar:
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1.5">
              <button
                type="button"
                onClick={() => setSelectedType("activities")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selectedType === "activities"
                    ? "border-red-500 bg-red-50/70 ring-2 ring-red-400/20 shadow-sm"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-900">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  Alerta de Actividades y Firmas Pendientes
                </div>
                <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                  Incluye faenas atrasadas con días exactos, faenas por vencer y firmas pendientes de capataz en reportes diarios (Lunes a Viernes 08:30 AM).
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedType("monday")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selectedType === "monday"
                    ? "border-amber-500 bg-amber-50/70 ring-2 ring-amber-400/20 shadow-sm"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                  <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
                  Recordatorio Semanal de Lunes
                </div>
                <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                  Aviso motivacional de inicio de semana, resumen de obras asignadas y recordatorio de carga de avances y cuadrillas (Lunes 08:00 AM).
                </p>
              </button>
            </div>
          </div>

          {/* PASO 2: TABLA DE DESTINATARIOS CON CHECKBOXES */}
          <div className="border rounded-xl p-3.5 bg-white shadow-sm space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <Label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                  2. Elige a Quiénes Enviar el Correo (Destinatarios de Terreno):
                </Label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Marca o desmarca los trabajadores que recibirán este correo en sus bandejas reales.
                </p>
              </div>

              {/* Botones de selección rápida y contador */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs px-2.5 py-1 font-bold bg-slate-100 text-slate-800 border">
                  {selectedUserIds.size} de {auditData?.total || 0} seleccionados
                </Badge>

                <div className="flex items-center gap-1 text-[11px]">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] px-2"
                    onClick={handleSelectAll}
                  >
                    Marcar Todos
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] px-2 text-red-700 bg-red-50/60 hover:bg-red-100 border-red-200"
                    onClick={handleSelectOnlyAlerts}
                    title="Marca únicamente a los trabajadores que tienen atrasos, faenas por vencer o firmas pendientes"
                  >
                    Solo con Alertas ({auditData?.willSendCount || 0})
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] px-2 text-slate-500"
                    onClick={handleDeselectAll}
                  >
                    Desmarcar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-slate-500"
                    onClick={fetchAuditData}
                    disabled={isLoadingAudit}
                    title="Actualizar datos desde la base de datos"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAudit ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            </div>

            {/* Tabla con scroll y checkboxes */}
            <div className="max-h-72 overflow-y-auto border rounded-lg">
              <table className="w-full text-[11.5px] text-left border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold sticky top-0 border-b z-10">
                  <tr>
                    <th className="p-2.5 w-10 text-center">
                      <span className="sr-only">Seleccionar</span>
                    </th>
                    <th className="p-2.5">Trabajador (Capataz / Supervisor)</th>
                    <th className="p-2.5">Obras Asignadas</th>
                    <th className="p-2.5 text-center">Atrasadas</th>
                    <th className="p-2.5 text-center">Por Vencer</th>
                    <th className="p-2.5 text-center">Firmas Pendientes</th>
                    <th className="p-2.5 text-right">Diagnóstico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingAudit ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1.5" />
                        Analizando faenas, atrasos y firmas pendientes en la base de datos...
                      </td>
                    </tr>
                  ) : auditData?.workers?.length > 0 ? (
                    auditData.workers.map((w) => {
                      const isSelected = selectedUserIds.has(w.id);
                      const hasEmail = w.email && w.email.includes("@");

                      return (
                        <tr
                          key={w.id}
                          onClick={() => hasEmail && toggleUserSelection(w.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-red-50/50 hover:bg-red-50/80"
                              : "hover:bg-slate-50/70 opacity-75"
                          }`}
                        >
                          <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!hasEmail}
                              onChange={() => toggleUserSelection(w.id)}
                              className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-2.5">
                            <span className="font-semibold text-slate-900 block">{w.fullName}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {w.role} · {w.email || "Sin correo"}
                            </span>
                          </td>
                          <td className="p-2.5 max-w-[160px] truncate text-slate-600" title={w.projects.join(", ")}>
                            {w.projects.length > 0 ? w.projects.join(", ") : "—"}
                          </td>
                          <td className="p-2.5 text-center">
                            {w.overdueCount > 0 ? (
                              <span className="font-bold text-red-600 bg-red-100/70 px-1.5 py-0.5 rounded text-[11px]">
                                {w.overdueCount}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            {w.upcomingCount > 0 ? (
                              <span className="font-bold text-amber-600 bg-amber-100/70 px-1.5 py-0.5 rounded text-[11px]">
                                {w.upcomingCount}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            {w.unsignedLogsCount > 0 ? (
                              <span className="font-bold text-orange-600 bg-orange-100/70 px-1.5 py-0.5 rounded text-[11px]">
                                ✍️ {w.unsignedLogsCount}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                w.shouldSend
                                  ? "bg-red-50 text-red-700 border-red-200 font-semibold"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              {w.statusText}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-slate-500">
                        No se encontraron trabajadores registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Opción de copia al Administrador */}
            <div className="pt-1 flex items-center justify-between flex-wrap gap-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={copyToAdmin}
                  onChange={(e) => setCopyToAdmin(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                />
                <span>
                  Enviarme una copia con el <strong>Resumen Ejecutivo de Obras</strong> a mi correo (<strong>{user?.email || "Admin"}</strong>)
                </span>
              </label>

              <span className="text-[11px] text-slate-500">
                * Los correos a terreno se enviarán de forma individual con la información de cada obra.
              </span>
            </div>
          </div>

          {/* VISTA PREVIA DEL CORREO (OPCIONAL) */}
          {showPreview && (
            <div className="border rounded-xl p-3 bg-slate-50 space-y-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-primary" />
                  Previsualización del Diseño del Correo:
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-slate-500"
                  onClick={() => setShowPreview(false)}
                >
                  Cerrar vista previa
                </Button>
              </div>

              {isLoadingPreview ? (
                <div className="h-64 flex items-center justify-center bg-white rounded border">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="bg-white rounded-lg border overflow-hidden shadow-inner">
                  <iframe
                    title="Email Preview"
                    srcDoc={previewHtml}
                    className="w-full h-80 border-0"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-3 border-t mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => handleLoadPreview(selectedType)}
            disabled={isLoadingPreview}
          >
            <Eye className="w-3.5 h-3.5 text-slate-600" />
            {showPreview ? "Recargar Vista Previa" : "Previsualizar Diseño"}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>

            <Button
              type="button"
              size="sm"
              className="text-xs gap-1.5 font-bold shadow-sm disabled:opacity-50 text-white bg-red-600 hover:bg-red-700"
              onClick={handleTriggerSend}
              disabled={isSending || selectedUserIds.size === 0}
            >
              {isSending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Enviando correos...
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  Disparar Envío Real a {selectedUserIds.size} Seleccionados
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
