# Mishoras – Hour Logging System

A web application for logging and managing hours worked on projects.

## Tech Stack

- **Node.js** · **Express 5**
- **EJS** (server-side templates)
- **Azure SQL** via `mssql` / tedious
- **Bootstrap 5** (+ Bootstrap Icons)

## Features

### User profile
- Log hours worked on a project (by date or quantity)
- Optionally associate a task
- Edit and delete own entries
- Filter entries by date range

### Admin profile
- **Users** – Create, edit, activate/deactivate users and set their role
- **Clients** – CRUD management
- **Projects** – CRUD, linked to clients
- **Tasks** – CRUD, linked to projects
- **Reports** – Hours worked per user, grouped by client and project, filterable by date range and user

## Getting started

### 1. Prerequisites

- Node.js ≥ 18
- An Azure SQL database (or SQL Server) reachable from your environment

### 2. Clone & install

```bash
git clone <repo-url>
cd mishoras
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your database credentials and a strong SESSION_SECRET
```

### 4. Create the database schema

Run `db/schema.sql` against your Azure SQL database (e.g. using Azure Data Studio, sqlcmd, or the Azure portal Query editor). The script is idempotent – it only creates tables and the seed admin user if they don't already exist.

Default admin credentials (change immediately after first login):
- **Email:** `admin@mishoras.local`
- **Password:** `Admin@1234`

### 5. Start the server

```bash
npm start       # production
npm run dev     # development (nodemon)
```

Navigate to `http://localhost:3000`.

## Project structure

```
mishoras/
├── app.js                  # Express app entry point
├── config/database.js      # mssql connection pool
├── db/schema.sql           # Database schema + seed
├── models/                 # DB access layer (User, Client, Project, Task, TimeEntry)
├── middleware/auth.js      # requireLogin / requireAdmin guards
├── routes/                 # auth, hours, admin
├── controllers/            # authController, hoursController, adminController
├── views/                  # EJS templates
│   ├── partials/           # header, footer, alerts
│   ├── auth/               # login
│   ├── hours/              # index, form
│   └── admin/              # dashboard, users, clients, projects, tasks, reports
└── public/                 # Static CSS / JS
```
