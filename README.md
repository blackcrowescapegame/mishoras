# Mishoras – Sistema de Registro de Horas

Aplicación web para registrar y gestionar horas trabajadas por proyecto, con panel de administración completo y exportación de reportes.

---

## Índice

1. [Stack tecnológico](#stack-tecnológico)
2. [Arquitectura](#arquitectura)
3. [Modelo de datos](#modelo-de-datos)
4. [Roles y permisos](#roles-y-permisos)
5. [Funcionalidades](#funcionalidades)
6. [Endpoints de la API](#endpoints-de-la-api)
7. [Seguridad](#seguridad)
8. [Puesta en marcha](#puesta-en-marcha)
9. [Variables de entorno](#variables-de-entorno)
10. [Estructura del proyecto](#estructura-del-proyecto)

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Servidor | Node.js ≥ 18, Express 5 |
| Plantillas | EJS (server-side rendering) |
| Base de datos | Azure SQL / SQL Server vía `mssql` (tedious) |
| UI | Bootstrap 5 + Bootstrap Icons |
| Autenticación | Sesiones con `express-session`, contraseñas con `bcrypt` |
| Protección CSRF | `csrf-csrf` (double-submit cookie) |
| Exportación | `exceljs` (Excel), `pdfkit` (PDF) |
| Importación | `multer` (carga de archivos) |
| Dev | `nodemon` |

---

## Arquitectura

El sistema sigue el patrón **MVC** (Modelo–Vista–Controlador) sobre Express 5:

```
Solicitud HTTP
    │
    ▼
Middleware global (sesión, CSRF, flash, method-override)
    │
    ▼
Router  (/auth  /hours  /admin)
    │
    ▼
Middleware de autorización (requireLogin / requireAdmin)
    │
    ▼
Controlador  (lógica de negocio)
    │
    ▼
Modelo  (acceso a Azure SQL mediante pool de conexiones)
    │
    ▼
Vista EJS  (respuesta HTML renderizada en servidor)
```

### Flujo de autenticación

1. El usuario envía credenciales al endpoint `POST /auth/login`.
2. El controlador verifica la contraseña con `bcrypt.compare`.
3. Si es válida, se crea la sesión (`req.session.userId`, `req.session.userRole`).
4. Las rutas protegidas aplican `requireLogin`; las de administración aplican además `requireAdmin`.
5. El cierre de sesión destruye la sesión en `POST /auth/logout`.

---

## Modelo de datos

### Diagrama de entidades

```
users ──────────────────────────────────────────────┐
  id, name, email, password (bcrypt), role, active  │
                                                     │
clients ──────────────────┐                          │
  id, name, description,  │                          │
  active                  │                          │
                          ▼                          │
projects ─────────────── client_id                  │
  id, name, description,                             │
  client_id, active                                  │
       │                                             │
       ▼                                             │
tasks                                                │
  id, name, description,                             │
  project_id, active                                 │
       │                                             │
       └─────────────────────────────────────────────┤
                                                     ▼
time_entries ──────── user_id, project_id, task_id (nullable)
  id, entry_date, hours (0 < h ≤ 24),
  description, created_at, updated_at
```

### Tablas

| Tabla | Descripción |
|---|---|
| `users` | Usuarios del sistema (roles: `admin` / `user`) |
| `clients` | Clientes a los que pertenecen los proyectos |
| `projects` | Proyectos vinculados a un cliente |
| `tasks` | Tareas opcionales dentro de un proyecto |
| `time_entries` | Registros de horas: usuario, proyecto, tarea, fecha y horas |

---

## Roles y permisos

| Acción | `user` | `admin` |
|---|:---:|:---:|
| Ver y registrar sus propias horas | ✔ | ✔ |
| Editar / eliminar sus propias entradas | ✔ | ✔ |
| Ver vista semanal y detallada | ✔ | ✔ |
| Descargar PDF / Excel de sus horas | ✔ | ✔ |
| Ver horas de **otros** usuarios | ✗ | ✔ |
| Gestionar usuarios, clientes, proyectos, tareas | ✗ | ✔ |
| Ver reportes globales | ✗ | ✔ |
| Importar datos desde archivos | ✗ | ✔ |

---

## Funcionalidades

### Perfil de usuario

- **Vista semanal** (`/hours`): tabla de entrada por proyecto/tarea para cada día de la semana (Lun–Vie). Guardado masivo con auto-save.
- **Vista detallada** (`/hours/detailed`): listado filtrable por preset de fechas (hoy, esta semana, este mes, mes pasado, este año, rango personalizado).
- **Exportación**: descarga la vista detallada en **Excel** o **PDF**.
- **Gestión de entradas individuales**: crear, editar y eliminar registros.
- **Perfil**: actualizar nombre/email y cambiar contraseña.

### Panel de administración

- **Dashboard** (`/admin`): vista general de acceso rápido.
- **Usuarios**: crear, editar, activar/desactivar y asignar rol (`admin`/`user`).
- **Clientes**: CRUD completo con activación/desactivación.
- **Proyectos**: CRUD vinculado a cliente, con activación/desactivación.
- **Tareas**: CRUD vinculado a proyecto, con activación/desactivación.
- **Reportes** (`/admin/reports`): horas trabajadas por usuario, agrupadas por cliente y proyecto; filtrable por rango de fechas y usuario.
- **Importación** (`/admin/import`): carga masiva de entradas de tiempo y otras entidades desde archivos (Excel/CSV) mediante `multer`.

---

## Endpoints de la API

> Todos los formularios incluyen token CSRF. Las rutas marcadas con 🔒 requieren sesión activa; las marcadas con 👑 requieren rol `admin`.

### Autenticación — `/auth`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/auth/login` | Formulario de inicio de sesión |
| `POST` | `/auth/login` | Procesar login |
| `POST` | `/auth/logout` | Cerrar sesión 🔒 |
| `GET` | `/auth/profile` | Ver perfil del usuario 🔒 |
| `POST` | `/auth/profile` | Actualizar nombre/email 🔒 |
| `POST` | `/auth/profile/password` | Cambiar contraseña 🔒 |

### Horas — `/hours` 🔒

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/hours` | Vista semanal de registro de horas |
| `POST` | `/hours/weekly` | Guardar semana completa (bulk) |
| `GET` | `/hours/dashboard` | Dashboard de horas del usuario |
| `POST` | `/hours/dashboard/pdf` | Descargar dashboard en PDF |
| `GET` | `/hours/detailed` | Vista detallada con filtros |
| `GET` | `/hours/detailed/excel` | Exportar vista detallada a Excel |
| `GET` | `/hours/detailed/pdf` | Exportar vista detallada a PDF |
| `POST` | `/hours` | Crear entrada individual |
| `GET` | `/hours/:id/edit` | Formulario de edición de entrada |
| `PUT` | `/hours/:id` | Actualizar entrada |
| `DELETE` | `/hours/:id` | Eliminar entrada |
| `GET` | `/hours/api/tasks/:projectId` | **AJAX** – Tareas por proyecto |
| `POST` | `/hours/api/autosave` | **AJAX** – Auto-guardar entrada individual |

### Administración — `/admin` 🔒 👑

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/admin` | Dashboard de administración |
| `GET` | `/admin/users` | Listado de usuarios |
| `GET` | `/admin/users/new` | Formulario de nuevo usuario |
| `POST` | `/admin/users` | Crear usuario |
| `GET` | `/admin/users/:id/edit` | Formulario de edición |
| `PUT` | `/admin/users/:id` | Actualizar usuario |
| `GET` | `/admin/clients` | Listado de clientes |
| `GET` | `/admin/clients/new` | Formulario de nuevo cliente |
| `POST` | `/admin/clients` | Crear cliente |
| `GET` | `/admin/clients/:id/edit` | Formulario de edición |
| `PUT` | `/admin/clients/:id` | Actualizar cliente |
| `DELETE` | `/admin/clients/:id` | Eliminar cliente |
| `GET` | `/admin/projects` | Listado de proyectos |
| `GET` | `/admin/projects/new` | Formulario de nuevo proyecto |
| `POST` | `/admin/projects` | Crear proyecto |
| `GET` | `/admin/projects/:id/edit` | Formulario de edición |
| `PUT` | `/admin/projects/:id` | Actualizar proyecto |
| `DELETE` | `/admin/projects/:id` | Eliminar proyecto |
| `GET` | `/admin/tasks` | Listado de tareas |
| `GET` | `/admin/tasks/new` | Formulario de nueva tarea |
| `POST` | `/admin/tasks` | Crear tarea |
| `GET` | `/admin/tasks/:id/edit` | Formulario de edición |
| `PUT` | `/admin/tasks/:id` | Actualizar tarea |
| `DELETE` | `/admin/tasks/:id` | Eliminar tarea |
| `GET` | `/admin/reports` | Reporte global de horas |
| `GET` | `/admin/import` | Formulario de importación |
| `POST` | `/admin/import/time-entries` | Importar entradas de tiempo desde archivo |
| `POST` | `/admin/import/:type` | Importar otro tipo de entidad desde archivo |

---

## Seguridad

- **Contraseñas** hasheadas con `bcrypt` (factor de costo 10).
- **Protección CSRF** mediante double-submit cookie (`csrf-csrf`). En producción se usa la cookie `__Host-x-csrf-token` (prefijo `__Host-` fuerza `Secure` + sin dominio).
- **Sesiones** con `httpOnly: true`, `sameSite: 'strict'` y `secure: true` en producción. Duración máxima de 8 horas.
- **Autorización** por middleware: `requireLogin` para usuarios autenticados y `requireAdmin` para operaciones administrativas.
- **Errores**: páginas de error personalizadas para 403, 404 y 500 sin exposición de stack traces al usuario final.
- **Parámetros SQL** siempre enviados como parámetros tipados de `mssql` para prevenir inyección SQL.

---

## Puesta en marcha

### 1. Prerrequisitos

- Node.js ≥ 18
- Base de datos Azure SQL o SQL Server accesible desde el entorno

### 2. Clonar e instalar dependencias

```bash
git clone <url-del-repositorio>
cd mishoras
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con las credenciales de la base de datos y SESSION_SECRET
```

### 4. Crear el esquema de base de datos

Ejecutar `db/schema.sql` en la base de datos (Azure Data Studio, `sqlcmd`, portal de Azure o similar). El script es **idempotente**: sólo crea tablas y el usuario administrador semilla si no existen.

Credenciales de administrador por defecto — **cambiar tras el primer inicio de sesión**:

| Campo | Valor |
|---|---|
| Email | `admin@mishoras.local` |
| Contraseña | `Admin@1234` |

### 5. Iniciar el servidor

```bash
npm start       # producción
npm run dev     # desarrollo con recarga automática (nodemon)
```

Abrir en el navegador: `http://localhost:3000`

---

## Variables de entorno

| Variable | Descripción | Requerida |
|---|---|:---:|
| `SESSION_SECRET` | Clave secreta para firmar la sesión y los tokens CSRF | ✔ |
| `DB_SERVER` | Host del servidor SQL (p. ej. `mi-server.database.windows.net`) | ✔ |
| `DB_PORT` | Puerto SQL Server (por defecto `1433`) | |
| `DB_DATABASE` | Nombre de la base de datos | ✔ |
| `DB_USER` | Usuario de la base de datos | ✔ |
| `DB_PASSWORD` | Contraseña de la base de datos | ✔ |
| `DB_ENCRYPT` | Cifrar conexión (`true`/`false`, por defecto `true`) | |
| `DB_TRUST_SERVER_CERT` | Confiar en certificado auto-firmado (`true`/`false`) | |
| `PORT` | Puerto del servidor HTTP (por defecto `3000`) | |
| `NODE_ENV` | Entorno (`production` activa cookies seguras) | |

---

## Estructura del proyecto

```
mishoras/
├── app.js                        # Punto de entrada – configuración de Express
├── package.json
├── .env                          # Variables de entorno (no versionar)
│
├── config/
│   └── database.js               # Pool de conexiones mssql
│
├── db/
│   └── schema.sql                # DDL idempotente + usuario semilla
│
├── middleware/
│   └── auth.js                   # Guardias requireLogin / requireAdmin
│
├── models/                       # Capa de acceso a datos (consultas parametrizadas)
│   ├── User.js
│   ├── Client.js
│   ├── Project.js
│   ├── Task.js
│   └── TimeEntry.js
│
├── routes/                       # Definición de rutas
│   ├── auth.js
│   ├── hours.js
│   └── admin.js
│
├── controllers/                  # Lógica de negocio
│   ├── authController.js
│   ├── hoursController.js        # Incluye exportación PDF/Excel
│   └── adminController.js        # Incluye importación de archivos
│
├── views/                        # Plantillas EJS
│   ├── partials/                 # header, footer, alerts, csrf
│   ├── auth/                     # login, profile
│   ├── hours/                    # index (semanal), dashboard, detailed, form
│   ├── admin/
│   │   ├── dashboard.ejs
│   │   ├── users/
│   │   ├── clients/
│   │   ├── projects/
│   │   ├── tasks/
│   │   ├── reports/
│   │   └── import/
│   ├── 403.ejs
│   ├── 404.ejs
│   └── 500.ejs
│
└── public/                       # Archivos estáticos
    ├── css/style.css
    └── js/main.js
```
