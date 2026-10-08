import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Camera, X, Trash2, CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/PermissionsContext";
import { getImageUrl } from "@/utils/imageUrl"; // 1. Importamos la función

const CONFIRM_WORD = "BORRAR";

// 2. Modificamos getPhotoSrc para usar getImageUrl en lugar de SERVER_URL
function getPhotoSrc(photo) {
  if (!photo) return "";
  const rawUrl = photo.thumb_url || photo.file_url || photo.url || "";
  return getImageUrl(rawUrl);
}

function DeleteConfirmModal({ onConfirm, onCancel, deleting }) {
  const [step, setStep] = useState(1);
  const [inputWord, setInputWord] = useState("");

  const handleDelete = () => {
    if (inputWord.trim().toUpperCase() === CONFIRM_WORD) onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl">
        {step === 1 ? (
          <>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="mb-1 text-base font-semibold">¿Eliminar esta foto?</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Esta acción es permanente y no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onCancel} disabled={deleting}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-red-600 text-white hover:bg-red-700"
                onClick={() => setStep(2)}
                disabled={deleting}
              >
                Borrar
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="mb-1 text-base font-semibold">Confirmación final</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Escribe{" "}
              <span className="font-mono font-bold text-red-600">{CONFIRM_WORD}</span>{" "}
              para eliminar permanentemente esta foto.
            </p>
            <Input
              value={inputWord}
              onChange={(e) => setInputWord(e.target.value)}
              placeholder={CONFIRM_WORD}
              className="mb-4 font-mono"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleDelete()}
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onCancel} disabled={deleting}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                onClick={handleDelete}
                disabled={inputWord.trim().toUpperCase() !== CONFIRM_WORD || deleting}
              >
                {deleting ? "Borrando..." : "Eliminar definitivamente"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PhotoCard({ photo, onPreview, onDelete, canDelete }) {
  return (
    <div className="group relative overflow-hidden rounded-lg border">
      <button type="button" className="w-full text-left" onClick={() => onPreview(photo)}>
        <img
          src={getPhotoSrc(photo)}
          alt={photo.description || "Foto de obra"}
          className="h-32 w-full object-cover transition-transform group-hover:scale-105"
        />
      </button>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        {photo.description && (
          <p className="truncate text-[10px] text-white/90">{photo.description}</p>
        )}
      </div>

      {canDelete && (
        <button
          type="button"
          className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onDelete(photo); }}
          title="Eliminar foto"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export default function PhotoGallery({ photos = [], onPhotoAdded }) {
  const { canDelete } = usePermissions();
  const [preview, setPreview] = useState(null);
  const [photoToDelete, setPhotoToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!canDelete || !photoToDelete) return;
    try {
      setDeleting(true);
      await api.delete(`/site-photos/${photoToDelete.id}`);
      onPhotoAdded?.();
      setPhotoToDelete(null);
    } catch (error) {
      console.error("Error al eliminar foto:", error);
      alert(error.message || "No se pudo eliminar la foto.");
    } finally {
      setDeleting(false);
    }
  };

  // Agrupar por daily_log_id
  const grouped = {};
  const ungrouped = [];

  photos.forEach((photo) => {
    if (photo.daily_log_id) {
      if (!grouped[photo.daily_log_id]) {
        grouped[photo.daily_log_id] = { date: photo.date, photos: [] };
      }
      grouped[photo.daily_log_id].photos.push(photo);
    } else {
      ungrouped.push(photo);
    }
  });

  const sortedGroups = Object.entries(grouped).sort(
    ([, a], [, b]) => (b.date || "").localeCompare(a.date || "")
  );

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Camera className="h-4 w-4 text-accent" />
            Registro Fotográfico
            {photos.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {photos.length} foto{photos.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent>
          {photos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin fotografías registradas. Las fotos se agregan desde los reportes diarios.
            </p>
          ) : (
            <div className="space-y-6">
              {sortedGroups.map(([logId, group]) => (
                <div key={logId}>
                  <div className="mb-3 flex items-center gap-2 border-b pb-2">
                    <CalendarDays className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      Reporte del {group.date || "Sin fecha"}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {group.photos.length} foto{group.photos.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                    {group.photos.map((photo) => (
                      <PhotoCard
                        key={photo.id}
                        photo={photo}
                        onPreview={setPreview}
                        onDelete={setPhotoToDelete}
                        canDelete={canDelete}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {ungrouped.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-2 border-b pb-2">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground">
                      Sin reporte asociado
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {ungrouped.length} foto{ungrouped.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                    {ungrouped.map((photo) => (
                      <PhotoCard
                        key={photo.id}
                        photo={photo}
                        onPreview={setPreview}
                        onDelete={setPhotoToDelete}
                        canDelete={canDelete}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreview(null)}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setPreview(null); }}
          >
            <X className="h-5 w-5" />
          </Button>
          <img
            src={getImageUrl(preview.file_url || preview.url || "")}
            alt={preview.description || "Vista previa"}
            className="max-h-[85vh] max-w-full rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {photoToDelete && canDelete && (
        <DeleteConfirmModal
          onConfirm={handleDeleteConfirm}
          onCancel={() => setPhotoToDelete(null)}
          deleting={deleting}
        />
      )}
    </>
  );
}
