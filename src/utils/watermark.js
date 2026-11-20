/**
 * Optimizador y Procesador de Fotos de Faena
 * 
 * Comprime y redimensiona fotos pesadas de cámaras móviles (de 10MB+ a ~400KB),
 * garantizando subidas instantáneas en faenas con conectividad 3G/4G,
 * manteniendo la fotografía 100% limpia sin banners ni textos superpuestos.
 */

export async function stampPhotoWatermark(imageFile, metadata = {}) {
  const {
    maxDimension = 1600,
  } = metadata;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Error al leer el archivo de imagen."));

    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo cargar la imagen para procesar."));
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

          // 2. Crear Canvas para redimensionar y comprimir limpiamente
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          // Dibujar la foto original escalada limpia (sin ningún banner ni texto superpuesto)
          ctx.drawImage(img, 0, 0, width, height);

          // 3. Convertir a Blob/File JPEG comprimido
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Error al procesar la imagen."));
                return;
              }

              const safeOriginalName = imageFile.name ? imageFile.name.replace(/\.[^/.]+$/, "") : "foto";
              const newFileName = `${safeOriginalName}_${Date.now()}.jpg`;

              const cleanFile = new File([blob], newFileName, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });

              const previewUrl = URL.createObjectURL(blob);

              resolve({
                file: cleanFile,
                previewUrl,
                summaryText: "",
              });
            },
            "image/jpeg",
            0.88 // Calidad óptima y peso liviano (~400KB)
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
