const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
require("dotenv").config();

const initDatabase = require("./db/init");
const db = require("./db/connection");

const projectsRoutes = require("./routes/projects.routes");
const masterItemsRoutes = require("./routes/masterItems.routes");
const dailyLogsRoutes = require("./routes/dailyLogs.routes");
const sitePhotosRoutes = require("./routes/sitePhotos.routes");
const auditLogsRoutes = require("./routes/auditlogs.routes");
const uploadRoutes = require("./routes/upload.routes");
const projectWorkersRoutes = require("./routes/projectWorkers.routes");
const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const exportEmailRoutes = require("./routes/exportEmail.routes");
const activitiesRoutes = require("./routes/activities.routes");
const remindersRoutes = require("./routes/reminders.routes");
const { initReminderCronJobs } = require("./services/reminderEmail.service");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware para PNA (Private Network Access):
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  next();
});

// Configuración de CORS
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-user-email"],
    credentials: true,
  })
);

app.use(express.json({ limit: "25mb" }));

// Cache-Control y cabeceras CORS explícitas para imágenes en /uploads
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "30d",
    etag: true,
    immutable: true,
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

initDatabase();
initReminderCronJobs();

app.get("/", (req, res) => {
  res.json({
    message: "Backend funcionando correctamente",
    project: "Control de Obras",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/master-items", masterItemsRoutes);
app.use("/api/daily-logs", dailyLogsRoutes);
app.use("/api/site-photos", sitePhotosRoutes);
app.use("/api/audit-logs", auditLogsRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/project-workers", projectWorkersRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/export-email", exportEmailRoutes);
app.use("/api/activities", activitiesRoutes);
app.use("/api/reminders", remindersRoutes);

app.delete('/api/reset-data', (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM daily_logs')
    db.run('DELETE FROM site_photos')
    db.run('DELETE FROM audit_logs')
    db.run('DELETE FROM master_items')
    db.run('DELETE FROM project_workers')
    db.run('DELETE FROM projects', function(err) {
      if (err) return res.status(500).json({ error: err.message })
      res.json({ message: 'Datos eliminados correctamente' })
    })
  })
})

app.use((req, res) => {
  res.status(404).json({
    error: "Ruta no encontrada",
    path: req.originalUrl,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo y disponible en http://0.0.0.0:${PORT}`);
});