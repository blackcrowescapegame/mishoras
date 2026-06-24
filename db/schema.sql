-- =====================================================
-- mishoras – Database Schema (Azure SQL / SQL Server)
-- =====================================================

-- Users
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'users')
CREATE TABLE users (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(120)  NOT NULL,
    email       NVARCHAR(254)  NOT NULL UNIQUE,
    password    NVARCHAR(255)  NOT NULL,  -- bcrypt hash
    role        NVARCHAR(20)   NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
    active      BIT            NOT NULL DEFAULT 1,
    created_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Clients
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'clients')
CREATE TABLE clients (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(120)  NOT NULL,
    description NVARCHAR(500),
    active      BIT            NOT NULL DEFAULT 1,
    created_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Projects
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'projects')
CREATE TABLE projects (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(120)  NOT NULL,
    description NVARCHAR(500),
    client_id   INT            NOT NULL REFERENCES clients(id),
    active      BIT            NOT NULL DEFAULT 1,
    created_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Tasks
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'tasks')
CREATE TABLE tasks (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(120)  NOT NULL,
    description NVARCHAR(500),
    project_id  INT            NOT NULL REFERENCES projects(id),
    active      BIT            NOT NULL DEFAULT 1,
    created_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Time Entries
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'time_entries')
CREATE TABLE time_entries (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    user_id     INT            NOT NULL REFERENCES users(id),
    project_id  INT            NOT NULL REFERENCES projects(id),
    task_id     INT            REFERENCES tasks(id),
    entry_date  DATE           NOT NULL,
    hours       DECIMAL(5,2)   NOT NULL CHECK (hours > 0 AND hours <= 24),
    description NVARCHAR(500),
    created_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

-- =====================================================
-- Migrations
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='projects' AND COLUMN_NAME='hours_budget')
  ALTER TABLE projects ADD hours_budget DECIMAL(8,2) NULL;

-- =====================================================
-- Seed: default admin user  (password: Admin@1234)
-- Sessions (connect-mssql-v2 persistent session store)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Sessions')
CREATE TABLE Sessions (
    sid        NVARCHAR(255)  NOT NULL PRIMARY KEY,
    session    NVARCHAR(MAX)  NOT NULL,
    expires    DATETIME       NOT NULL
);

-- =====================================================
IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@mishoras.local')
INSERT INTO users (name, email, password, role)
VALUES (
    N'Administrator',
    N'admin@mishoras.local',
    N'$2b$10$EwLi0V8wuWc2KZ0PT2QIMeQkQT1iET02xKg6h1lWIBk0R9sQVyLIS',  -- Admin@1234
    N'admin'
);
