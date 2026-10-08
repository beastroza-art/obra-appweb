const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const router = express.Router();

const uploadsDir = path.join(__dirname, "..", "uploads");
const signaturesDir = path.join(uploadsDir, "signatures");
const thumbsDir = path.join(uploadsDir, "thumbs");

[uploadsDir, signaturesDir, thumbsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Guardamos en memoria (buffer) en vez de a disco directo, así sharp
// procesa la imagen ANTES de escribirla. Nada de fotos gigantes sin tocar.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("Solo se permiten imágenes JPG, PNG o WEBP"), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    // 15 MB de ENTRADA es más que suficiente para cualquier foto de celular.
    // (Antes esto estaba en 100 GB por error de escritura, lo cual permitía
    // que archivos gigantes llegaran hasta el disco sin ningún control.)
    fileSize: 15 * 1024 * 1024,
  },
});

// Subida normal de fotos: se procesan con sharp y se guardan ya
// comprimidas + redimensionadas, más un thumbnail para las grillas.
router.post("/", (req, res) => {
  upload.single("photo")(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            error: "La imagen no puede pesar más de 15 MB",
          });
        }

        return res.status(400).json({
          error: err.message,
        });
      }

      return res.status(400).json({
        error: err.message || "Error subiendo imagen",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "No se recibió ninguna imagen",
      });
    }

    try {
      const baseName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const filename = `${baseName}.webp`;
      const thumbFilename = `${baseName}_thumb.webp`;

      // Imagen principal: máximo 1600px de lado más largo, WebP calidad 80.
      // .rotate() sin argumentos corrige la orientación EXIF (fotos de
      // celular que salen giradas si no se hace esto).
      await sharp(req.file.buffer)
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(path.join(uploadsDir, filename));

      // Thumbnail para grillas/galerías: 400px, esto es lo que debería
      // usar PhotoGallery.jsx en vez de la imagen completa.
      await sharp(req.file.buffer)
        .rotate()
        .resize(400, 400, { fit: "cover" })
        .webp({ quality: 70 })
        .toFile(path.join(thumbsDir, thumbFilename));

      return res.status(201).json({
        filename,
        original_name: req.file.originalname,
        mimetype: "image/webp",
        file_url: `/uploads/${filename}`,
        thumb_url: `/uploads/thumbs/${thumbFilename}`,
      });
    } catch (processErr) {
      console.error("Error procesando imagen:", processErr);
      return res.status(500).json({
        error: "No se pudo procesar la imagen",
      });
    }
  });
});

// Subida de firma en base64 como PNG transparente (sin cambios: las firmas
// ya son livianas, y necesitan mantenerse en PNG por la transparencia)
router.post("/signature", (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({
        error: "No se recibió la firma.",
      });
    }

    if (!imageBase64.startsWith("data:image/")) {
      return res.status(400).json({
        error: "La firma debe venir en formato PNG base64.",
      });
    }

    const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+_-]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    if (!buffer.length) {
      return res.status(400).json({
        error: "La firma está vacía.",
      });
    }

    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({
        error: "La firma no puede pesar más de 2 MB.",
      });
    }

    const fileName = `firma-${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}.png`;

    const filePath = path.join(signaturesDir, fileName);

    fs.writeFile(filePath, buffer, (err) => {
      if (err) {
        console.error("Error guardando firma:", err);

        return res.status(500).json({
          error: "No se pudo guardar la firma.",
        });
      }

      return res.status(201).json({
        filename: fileName,
        original_name: fileName,
        mimetype: "image/png",
        size: buffer.length,
        file_url: `/uploads/signatures/${fileName}`,
      });
    });
  } catch (error) {
    console.error("Error procesando firma:", error);

    return res.status(500).json({
      error: "Error procesando firma.",
    });
  }
});

// Eliminar foto normal. Ahora también intenta borrar su thumbnail asociado.
router.delete("/:filename", (req, res) => {
  const { filename } = req.params;

  const safeName = path.basename(filename);
  const filePath = path.join(uploadsDir, safeName);

  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      return res.status(500).json({
        error: "No se pudo eliminar el archivo",
      });
    }

    // Intento best-effort de borrar el thumbnail correspondiente
    // (mismo baseName + "_thumb.webp"). Si no existe, no pasa nada.
    const ext = path.extname(safeName);
    const baseName = path.basename(safeName, ext);
    const thumbPath = path.join(thumbsDir, `${baseName}_thumb.webp`);
    fs.unlink(thumbPath, () => {});

    return res.json({
      message: "Archivo eliminado",
      filename: safeName,
    });
  });
});

module.exports = router;