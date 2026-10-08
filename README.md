# Obras AppWeb 🏗️

Sistema web integral de control, planificación, seguimiento y gestión de obras de construcción y montaje eléctrico.

## 🚀 Características Principales

- **Dashboard Principal**: Indicadores clave de desempeño (KPIs), avance global y por piso/sector, calendario de eventos y filtros dinámicos.
- **Plan Maestro (Master Plan)**: Planificación y control de partidas, asignación de cuadrillas, cubicaciones programadas vs. ejecutadas.
- **Vista 3D**: Visualización esquemática e interactiva tridimensional de los avances por piso y vertical.
- **Control Diario (Daily Logs)**: Registro diario de avances, horas hombre, asignación de cuadrillas con firmas digitales y registro fotográfico.
- **Restricciones y Bloqueos**: Gestión y seguimiento de impedimentos que afectan la continuidad operacional en terreno.
- **Productividad y Rendimientos**: Análisis gráfico de rendimiento del personal y cuadrillas.
- **Gestión de Personal (Workers)**: Registro de trabajadores, roles, traslados entre obras y asignación de cuadrillas.
- **Control de Acceso y Usuarios**: Roles jerárquicos (Administrador, Supervisor, Visualizador) con restricción por proyectos asignados.
- **Exportación de Reportes**: Generación de informes ejecutivos en formato Excel y PDF.

## 🛠️ Arquitectura y Tecnologías

### Frontend
- **Framework**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Estilos**: [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/)
- **Visualización 3D**: [Three.js](https://threejs.org/)
- **Gráficos**: [Recharts](https://recharts.org/)
- **Iconos**: [Lucide React](https://lucide.react)

### Backend
- **Runtime**: [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/)
- **Base de Datos**: [SQLite](https://www.sqlite.org/) (`backend/database.sqlite`)
- **Autenticación**: Hashing seguro con `bcrypt`
- **Subida de Archivos**: `multer` con procesamiento en `sharp`

---

## 💻 Puesta en Marcha

### 1. Requisitos Previos
- Node.js versión 18 o superior.

### 2. Iniciar el Servidor Backend (API)
Abre un terminal en la raíz del proyecto y ejecuta:
```bash
npm run backend
# O en modo desarrollo con auto-recarga:
npm run backend:dev
```
*El backend se ejecutará en http://localhost:3001*

### 3. Iniciar el Servidor Frontend (Vite)
En otro terminal en la raíz del proyecto ejecuta:
```bash
npm run dev
```
*El frontend estará disponible en http://localhost:5173 (con proxy integrado a la API en el puerto 3001)*

---

## 📂 Estructura del Proyecto

```text
obras-appweb/
├── backend/
│   ├── db/              # Esquema SQLite, migraciones e inicialización
│   ├── routes/          # Rutas de la API REST (proyectos, avances, usuarios...)
│   ├── services/        # Servicios de correo, notificaciones y automatizaciones
│   ├── uploads/         # Almacenamiento local de fotos y firmas
│   └── server.js        # Punto de entrada de Express
├── src/
│   ├── components/      # Componentes UI, layout, dashboard y formularios
│   ├── constants/       # Catálogo de partidas y configuración
│   ├── hooks/          # Custom React hooks
│   ├── lib/             # Cliente API, contextos de Auth, Permisos y Filtros
│   ├── pages/           # Vistas principales (Dashboard, 3D, Master Plan, etc.)
│   └── utils/           # Generación de reportes PDF, Excel y cálculos
├── package.json         # Configuración del frontend y scripts principales
└── vite.config.js       # Configuración de Vite y proxy reverso
```
