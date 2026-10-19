/**
 * Motor de Sello de Agua Legal y Técnico para Fotos de Faena
 * 
 * Imprime directamente sobre los píxeles de la fotografía (vía Canvas):
 * - Nombre de la Obra
 * - Ubicación exacta (Torre, Piso, Depto, Subterráneo, Exterior o Recinto Libre)
 * - Tipo de registro (AVANCE DE TRABAJO vs FRENTE BLOQUEADO / NO LIBERADO)
 * - Causa de bloqueo / interferencia (si aplica)
 * - Fecha y Hora exacta (formato local)
 * - Responsable / Capataz que tomó el registro
 * 
 * Además, comprime y redimensiona fotos pesadas de cámaras móviles (de 10MB+ a ~400KB),
 * garantizando subidas instantáneas en faenas con conectividad 3G/4G.
 */

export async function stampPhotoWatermark(imageFile, metadata = {}) {
  const {
    projectName = "Obra Sin Nombre",
    location = "Sector General",
    author = "Capataz en Faena",
    type = "AVANCE", // 'AVANCE' | 'BLOQUEO'
    cause = "",      // Motivo de restricción si es BLOQUEO
    timestamp = new Date(),
    note = "",
    maxDimension = 1600,
  } = metadata;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Error al leer el archivo de imagen."));

    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo cargar la imagen para estampar sello."));
      img.onload = () => {
        try {
          // 1. Calcular dimensiones optimizadas manteniendo proporción
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          // 2. Crear Canvas
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          // Dibujar la foto original escalada
          ctx.drawImage(img, 0, 0, width, height);

          // 3. Preparar parámetros de diseño del Sello según resolución
          const isBloqueo = type === "BLOQUEO";
          const baseFontSize = Math.max(14, Math.round(width * 0.022));
          const padding = Math.round(baseFontSize * 0.9);
          const lineHeight = Math.round(baseFontSize * 1.35);

          // Contar líneas requeridas
          let linesCount = 3;
          if (isBloqueo && cause) linesCount += 1;
          if (note) linesCount += 1;

          const bannerHeight = Math.round(padding * 2 + linesCount * lineHeight);

          // 4. Dibujar Franja de Fondo en la parte inferior
          ctx.save();
          if (isBloqueo) {
            // Fondo rojo oscuro técnico para destacar interferencias
            ctx.fillStyle = "rgba(127, 29, 29, 0.92)";
          } else {
            // Fondo carbón oscuro con leve transparencia para avances
            ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
          }
          ctx.fillRect(0, height - bannerHeight, width, bannerHeight);

          // Borde superior de acento en el banner
          ctx.fillStyle = isBloqueo ? "#ef4444" : "#f97316";
          ctx.fillRect(0, height - bannerHeight, width, Math.max(3, Math.round(baseFontSize * 0.18)));

          // 5. Configurar Textos
          const dateStr = timestamp instanceof Date
            ? timestamp.toLocaleString("es-CL", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            : String(timestamp);

          let currentY = height - bannerHeight + padding + Math.round(baseFontSize * 0.85);
          const startX = padding;

          // Línea 1: Badge de Tipo + Nombre de la Obra
          ctx.font = `bold ${baseFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          
          // Badge
          if (isBloqueo) {
            ctx.fillStyle = "#fecaca";
            ctx.fillText("● [FRENTE BLOQUEADO / RESTRICCIÓN]", startX, currentY);
          } else {
            ctx.fillStyle = "#86efac";
            ctx.fillText("● [AVANCE DE ACTIVIDAD REGISTRADO]", startX, currentY);
          }

          // Obra a la derecha o continuando
          ctx.fillStyle = "#ffffff";
          const typeBadgeWidth = isBloqueo ? baseFontSize * 18 : baseFontSize * 18;
          ctx.fillText(`|  OBRA: ${projectName}`, Math.min(width - 300, startX + typeBadgeWidth), currentY);

          // Línea 2: Ubicación exacta
          currentY += lineHeight;
          ctx.font = `600 ${Math.round(baseFontSize * 0.92)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.fillStyle = "#f8fafc";
          ctx.fillText(`UBICACIÓN: ${location}`, startX, currentY);

          // Línea 3: Fecha / Hora y Responsable
          currentY += lineHeight;
          ctx.font = `normal ${Math.round(baseFontSize * 0.85)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.fillStyle = "#cbd5e1";
          ctx.fillText(`FECHA Y HORA: ${dateStr}   |   REGISTRADO POR: ${author}`, startX, currentY);

          // Línea 4: Motivo de restricción (si aplica)
          if (isBloqueo && cause) {
            currentY += lineHeight;
            ctx.font = `bold ${Math.round(baseFontSize * 0.92)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
            ctx.fillStyle = "#fca5a5";
            ctx.fillText(`MOTIVO DEL BLOQUEO: ${cause}`, startX, currentY);
          }

          // Línea 5: Observación adicional (si aplica)
          if (note) {
            currentY += lineHeight;
            ctx.font = `italic ${Math.round(baseFontSize * 0.82)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
            ctx.fillStyle = "#e2e8f0";
            const truncatedNote = note.length > 90 ? note.slice(0, 87) + "..." : note;
            ctx.fillText(`OBSERVACIÓN: "${truncatedNote}"`, startX, currentY);
          }

          // Marca de agua sutil en la esquina inferior derecha
          ctx.font = `bold ${Math.round(baseFontSize * 0.7)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          ctx.textAlign = "right";
          ctx.fillText("CONTROL DE AVANCE • RESPALDO LEGAL FAENA", width - padding, height - Math.round(padding * 0.6));

          ctx.restore();

          // 6. Convertir a Blob/File JPEG comprimido
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Error al generar el archivo con sello de agua."));
                return;
              }

              const safeOriginalName = imageFile.name ? imageFile.name.replace(/\.[^/.]+$/, "") : "foto";
              const prefix = isBloqueo ? "BLOQUEO" : "AVANCE";
              const newFileName = `${prefix}_${safeOriginalName}_${Date.now()}.jpg`;

              const watermarkedFile = new File([blob], newFileName, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });

              const previewUrl = URL.createObjectURL(blob);
              const summaryText = `[${prefix}] ${projectName} | ${location} | ${dateStr} | ${author}${cause ? ` | ${cause}` : ""}`;

              resolve({
                file: watermarkedFile,
                previewUrl,
                summaryText,
              });
            },
            "image/jpeg",
            0.88 // Excelente balance entre calidad legal y peso liviano
          );
        } catch (err) {
          reject(err);
        }
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(imageFile);
  });
}
