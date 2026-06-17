'use strict';

const bcrypt            = require('bcrypt');
const multer            = require('multer');
const ExcelJS           = require('exceljs');
const { getPool, sql }  = require('../config/database');
const User       = require('../models/User');
const Client     = require('../models/Client');
const Project    = require('../models/Project');
const Task       = require('../models/Task');
const TimeEntry  = require('../models/TimeEntry');

const SALT_ROUNDS = 10;

/* multer – memory storage (max 10 MB) */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            || file.originalname.toLowerCase().endsWith('.xlsx');
    cb(ok ? null : new Error('Solo se aceptan archivos .xlsx'), ok);
  },
});

/* ─── Users ─── */
const UsersController = {
  async index(req, res) {
    const PAGE_SIZE = 10;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const ALLOWED = ['name', 'email', 'role', 'active', 'created_at'];
    const sort = ALLOWED.includes(req.query.sort) ? req.query.sort : 'name';
    const dir  = req.query.dir === 'desc' ? 'desc' : 'asc';
    const q    = (req.query.q || '').trim();
    const { rows: users, total } = await User.findPaged({ page, pageSize: PAGE_SIZE, sort, dir, q });
    const totalPages = Math.ceil(total / PAGE_SIZE);
    res.render('admin/users/index', {
      title: 'Manage Users', users,
      page, totalPages, total, sort, dir, q,
      success: req.flash('success'), error: req.flash('error'),
      user: req.session.user,
    });
  },

  async showNew(req, res) {
    const allProjects = await Project.findAll(true);
    res.render('admin/users/form', {
      title: 'Nuevo Usuario', item: null, allProjects, assignedIds: [],
      error: req.flash('error'), user: req.session.user,
    });
  },

  async create(req, res) {
    const { name, email, password, role, custom_id, labor_rate, billable_rate } = req.body;
    const projectIds = [].concat(req.body.project_ids || []).map(Number).filter(Boolean);
    try {
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      const newId = await User.create({ name, email: email.trim().toLowerCase(), password: hash, role, custom_id, labor_rate, billable_rate });
      if (projectIds.length) await User.setProjects(newId, projectIds);
      req.flash('success', 'Usuario creado.');
      res.redirect('/admin/users');
    } catch (err) {
      console.error(err);
      req.flash('error', 'No se pudo crear el usuario. El email puede ya existir.');
      res.redirect('/admin/users/new');
    }
  },

  async showEdit(req, res) {
    const id = parseInt(req.params.id, 10);
    const [item, allProjects, assignedProjects] = await Promise.all([
      User.findById(id),
      Project.findAll(true),
      User.getProjects(id),
    ]);
    if (!item) { req.flash('error', 'Usuario no encontrado.'); return res.redirect('/admin/users'); }
    const assignedIds = assignedProjects.map(p => p.id);
    res.render('admin/users/form', {
      title: 'Editar Usuario', item, allProjects, assignedIds,
      error: req.flash('error'), user: req.session.user,
    });
  },

  async update(req, res) {
    const id = parseInt(req.params.id, 10);
    const { name, email, role, active, password, custom_id, labor_rate, billable_rate } = req.body;
    const projectIds = [].concat(req.body.project_ids || []).map(Number).filter(Boolean);
    try {
      await User.update(id, { name, email: email.trim().toLowerCase(), role, active: active ? 1 : 0, custom_id, labor_rate, billable_rate });
      if (password && password.trim()) {
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        await User.updatePassword(id, hash);
      }
      await User.setProjects(id, projectIds);
      req.flash('success', 'Usuario actualizado.');
      res.redirect('/admin/users');
    } catch (err) {
      console.error(err);
      req.flash('error', 'No se pudo actualizar el usuario.');
      res.redirect(`/admin/users/${id}/edit`);
    }
  },
};

/* ─── Clients ─── */
const ClientsController = {
  async index(req, res) {
    const PAGE_SIZE = 10;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const ALLOWED = ['name', 'custom_id', 'contact_person', 'email', 'phone', 'active', 'created_at'];
    const sort = ALLOWED.includes(req.query.sort) ? req.query.sort : 'name';
    const dir  = req.query.dir === 'desc' ? 'desc' : 'asc';
    const q    = (req.query.q || '').trim();
    const { rows: clients, total } = await Client.findPaged({ page, pageSize: PAGE_SIZE, sort, dir, q });
    const totalPages = Math.ceil(total / PAGE_SIZE);
    res.render('admin/clients/index', {
      title: 'Manage Clients', clients,
      page, totalPages, total, sort, dir, q,
      success: req.flash('success'), error: req.flash('error'),
      user: req.session.user,
    });
  },

  showNew(req, res) {
    res.render('admin/clients/form', {
      title: 'New Client', item: null,
      error: req.flash('error'), user: req.session.user,
    });
  },

  async create(req, res) {
    const { name, description, custom_id, contact_person, email, phone, address, tax_name, tax_percentage, tax_number } = req.body;
    try {
      await Client.create({ name, description, custom_id, contact_person, email, phone, address, tax_name, tax_percentage, tax_number });
      req.flash('success', 'Client created.');
      res.redirect('/admin/clients');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not create client.');
      res.redirect('/admin/clients/new');
    }
  },

  async showEdit(req, res) {
    const item = await Client.findById(parseInt(req.params.id, 10));
    if (!item) { req.flash('error', 'Client not found.'); return res.redirect('/admin/clients'); }
    res.render('admin/clients/form', {
      title: 'Edit Client', item,
      error: req.flash('error'), user: req.session.user,
    });
  },

  async update(req, res) {
    const id = parseInt(req.params.id, 10);
    const { name, description, active, custom_id, contact_person, email, phone, address, tax_name, tax_percentage, tax_number } = req.body;
    try {
      await Client.update(id, { name, description, active: active ? 1 : 0, custom_id, contact_person, email, phone, address, tax_name, tax_percentage, tax_number });
      req.flash('success', 'Client updated.');
      res.redirect('/admin/clients');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not update client.');
      res.redirect(`/admin/clients/${id}/edit`);
    }
  },

  async delete(req, res) {
    try {
      await Client.delete(parseInt(req.params.id, 10));
      req.flash('success', 'Client deactivated.');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not deactivate client.');
    }
    res.redirect('/admin/clients');
  },
};

/* ─── Projects ─── */
const ProjectsController = {
  async index(req, res) {
    const PAGE_SIZE = 10;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const ALLOWED = ['name', 'client_name', 'custom_id', 'active', 'created_at', 'flat_fee', 'total_hours'];
    const sort = ALLOWED.includes(req.query.sort) ? req.query.sort : 'name';
    const dir  = req.query.dir === 'desc' ? 'desc' : 'asc';
    const q    = (req.query.q || '').trim();
    const { rows: projects, total } = await Project.findPaged({ page, pageSize: PAGE_SIZE, sort, dir, q });
    const totalPages = Math.ceil(total / PAGE_SIZE);
    res.render('admin/projects/index', {
      title: 'Manage Projects', projects,
      page, totalPages, total, sort, dir, q,
      success: req.flash('success'), error: req.flash('error'),
      user: req.session.user,
    });
  },

  async showNew(req, res) {
    const [clients, allTasks] = await Promise.all([Client.findAll(true), Task.findAll(true)]);
    res.render('admin/projects/form', {
      title: 'Nuevo Proyecto', item: null, clients,
      allUsers: [], assignedIds: [], allTasks, assignedTaskIds: [], loggedHours: 0,
      error: req.flash('error'), user: req.session.user,
    });
  },

  async create(req, res) {
    const { name, description, client_id, custom_id, budget_spent_pct, flat_fee, billable_amount } = req.body;
    const userIds = [].concat(req.body.user_ids || []).map(Number).filter(Boolean);
    try {
      const newId = await Project.create({ name, description, client_id: parseInt(client_id, 10), custom_id, budget_spent_pct, flat_fee, billable_amount });
      if (userIds.length) await Project.setUsers(newId, userIds);
      req.flash('success', 'Proyecto creado.');
      res.redirect('/admin/projects');
    } catch (err) {
      console.error(err);
      req.flash('error', 'No se pudo crear el proyecto.');
      res.redirect('/admin/projects/new');
    }
  },

  async showEdit(req, res) {
    const id = parseInt(req.params.id, 10);
    const [item, clients, assignedUsers, loggedHours, assignedTasks, allTasks] = await Promise.all([
      Project.findById(id),
      Client.findAll(true),
      Project.getUsers(id),
      Project.getLoggedHours(id),
      Project.getTasks(id),
      Task.findAll(true),
    ]);
    if (!item) { req.flash('error', 'Proyecto no encontrado.'); return res.redirect('/admin/projects'); }
    const allUsers    = await User.findAll();
    const assignedUserIds = assignedUsers.map(u => u.id);
    const assignedTaskIds = assignedTasks.map(t => t.id);
    res.render('admin/projects/form', {
      title: 'Editar Proyecto', item, clients, allUsers, assignedIds: assignedUserIds,
      allTasks, assignedTaskIds, loggedHours,
      error: req.flash('error'), user: req.session.user,
    });
  },

  async update(req, res) {
    const id = parseInt(req.params.id, 10);
    const { name, description, client_id, active, custom_id, budget_spent_pct, flat_fee, billable_amount } = req.body;
    const userIds = [].concat(req.body.user_ids || []).map(Number).filter(Boolean);
    const taskIds = [].concat(req.body.task_ids || []).map(Number).filter(Boolean);
    try {
      await Project.update(id, { name, description, client_id: parseInt(client_id, 10), active: active ? 1 : 0, custom_id, budget_spent_pct, flat_fee, billable_amount });
      await Project.setUsers(id, userIds);
      await Project.setTasks(id, taskIds);
      req.flash('success', 'Proyecto actualizado.');
      res.redirect('/admin/projects');
    } catch (err) {
      console.error(err);
      req.flash('error', 'No se pudo actualizar el proyecto.');
      res.redirect(`/admin/projects/${id}/edit`);
    }
  },

  async delete(req, res) {
    try {
      await Project.delete(parseInt(req.params.id, 10));
      req.flash('success', 'Project deactivated.');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not deactivate project.');
    }
    res.redirect('/admin/projects');
  },
};

/* ─── Tasks ─── */
const TasksController = {
  async index(req, res) {
    const PAGE_SIZE = 10;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const ALLOWED = ['name', 'active', 'hourly_rate', 'billable_by_default', 'created_at'];
    const sort = ALLOWED.includes(req.query.sort) ? req.query.sort : 'name';
    const dir  = req.query.dir === 'desc' ? 'desc' : 'asc';
    const q    = (req.query.q || '').trim();
    const { rows: tasks, total } = await Task.findPaged({ page, pageSize: PAGE_SIZE, sort, dir, q });
    const totalPages = Math.ceil(total / PAGE_SIZE);
    res.render('admin/tasks/index', {
      title: 'Manage Tasks', tasks,
      page, totalPages, total, sort, dir, q,
      success: req.flash('success'), error: req.flash('error'),
      user: req.session.user,
    });
  },

  async showNew(req, res) {
    const allProjects = await Project.findAll(true);
    res.render('admin/tasks/form', {
      title: 'Nueva Tarea', item: null, allProjects, assignedIds: [],
      error: req.flash('error'), user: req.session.user,
    });
  },

  async create(req, res) {
    const { name, description, hourly_rate, billable_by_default, add_to_new_projects } = req.body;
    const projectIds = [].concat(req.body.project_ids || []).map(Number).filter(Boolean);
    try {
      const newId = await Task.create({ name, description, hourly_rate, billable_by_default, add_to_new_projects });
      if (projectIds.length) await Task.setProjects(newId, projectIds);
      req.flash('success', 'Tarea creada.');
      res.redirect('/admin/tasks');
    } catch (err) {
      console.error(err);
      req.flash('error', 'No se pudo crear la tarea.');
      res.redirect('/admin/tasks/new');
    }
  },

  async showEdit(req, res) {
    const id = parseInt(req.params.id, 10);
    const [item, allProjects, assignedProjects] = await Promise.all([
      Task.findById(id),
      Project.findAll(true),
      Task.getProjects(id),
    ]);
    if (!item) { req.flash('error', 'Tarea no encontrada.'); return res.redirect('/admin/tasks'); }
    const assignedIds = assignedProjects.map(p => p.id);
    res.render('admin/tasks/form', {
      title: 'Editar Tarea', item, allProjects, assignedIds,
      error: req.flash('error'), user: req.session.user,
    });
  },

  async update(req, res) {
    const id = parseInt(req.params.id, 10);
    const { name, description, active, hourly_rate, billable_by_default, add_to_new_projects } = req.body;
    const projectIds = [].concat(req.body.project_ids || []).map(Number).filter(Boolean);
    try {
      await Task.update(id, { name, description, active: active ? 1 : 0, hourly_rate, billable_by_default, add_to_new_projects });
      await Task.setProjects(id, projectIds);
      req.flash('success', 'Tarea actualizada.');
      res.redirect('/admin/tasks');
    } catch (err) {
      console.error(err);
      req.flash('error', 'No se pudo actualizar la tarea.');
      res.redirect(`/admin/tasks/${id}/edit`);
    }
  },

  async delete(req, res) {
    try {
      await Task.delete(parseInt(req.params.id, 10));
      req.flash('success', 'Tarea desactivada.');
    } catch (err) {
      console.error(err);
      req.flash('error', 'No se pudo desactivar la tarea.');
    }
    res.redirect('/admin/tasks');
  },
};

/* ─── Reports ─── */
const ReportsController = {
  async index(req, res) {
    const { from, to, user_id } = req.query;
    try {
      const [rows, summary, users] = await Promise.all([
        TimeEntry.reportByClientProject({ from, to, userId: user_id ? parseInt(user_id, 10) : null }),
        TimeEntry.reportSummaryByUser({ from, to }),
        User.findAll(),
      ]);

      // Group rows by client > project > user
      const grouped = {};
      for (const row of rows) {
        if (!grouped[row.client_id]) {
          grouped[row.client_id] = { name: row.client_name, projects: {} };
        }
        const proj = grouped[row.client_id].projects;
        if (!proj[row.project_id]) {
          proj[row.project_id] = { name: row.project_name, users: [] };
        }
        proj[row.project_id].users.push({ id: row.user_id, name: row.user_name, hours: parseFloat(row.total_hours) });
      }

      res.render('admin/reports/index', {
        title: 'Reports', grouped, summary, users,
        from: from || '', to: to || '', selectedUser: user_id || '',
        success: req.flash('success'), error: req.flash('error'),
        user: req.session.user,
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not generate report.');
      res.redirect('/admin');
    }
  },
};

/* ─── Import / Reset ─── */
const ImportController = {
  async show(req, res) {
    const pool = await getPool();
    const usersRes = await pool.request().query('SELECT id, name, active FROM users ORDER BY name');
    res.render('admin/import/index', {
      title: 'Importar datos',
      users: usersRes.recordset,
      success: req.flash('success'),
      error: req.flash('error'),
      importErrors: req.flash('importErrors'),
      user: req.session.user,
    });
  },

  async importFile(req, res) {
    const { type } = req.params;
    const VALID_TYPES = ['clients', 'projects', 'tasks', 'users'];
    if (!VALID_TYPES.includes(type)) {
      req.flash('error', 'Tipo de importación no válido.');
      return res.redirect('/admin/import');
    }
    if (!req.file) {
      req.flash('error', 'No se seleccionó ningún archivo.');
      return res.redirect('/admin/import');
    }

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error('El archivo no contiene hojas.');

      // Build header index (case-insensitive, trim)
      const headers = {};
      sheet.getRow(1).eachCell((cell, col) => {
        const key = cell.value?.toString().trim().toLowerCase();
        if (key) headers[key] = col;
      });

      const get = (row, ...aliases) => {
        for (const alias of aliases) {
          const col = headers[alias];
          if (col !== undefined) {
            const v = row.getCell(col).value;
            if (v !== null && v !== undefined) return v.toString().trim();
          }
        }
        return null;
      };

      const pool = await getPool();
      let imported = 0;
      const rowErrors = [];

      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        if (!row.hasValues) continue;

        try {
          if (type === 'clients') {
            const name           = get(row, 'nombre', 'name');
            const description    = get(row, 'descripcion', 'descripción', 'description') || null;
            const custom_id      = get(row, 'id personalizado', 'custom id', 'custom_id', 'codigo', 'código') || null;
            const contact_person = get(row, 'contacto', 'contact person', 'contact_person', 'persona de contacto') || null;
            const email          = get(row, 'email', 'correo') || null;
            const phone          = get(row, 'telefono', 'teléfono', 'phone') || null;
            const address        = get(row, 'direccion', 'dirección', 'address') || null;
            const tax_name       = get(row, 'impuesto', 'tax name', 'tax_name', 'nombre impuesto') || null;
            const tax_pct_raw    = get(row, 'porcentaje impuesto', 'tax percentage', 'tax_percentage', 'porcentaje');
            const tax_percentage = tax_pct_raw != null ? parseFloat(tax_pct_raw) : null;
            const tax_number     = get(row, 'numero impuesto', 'número impuesto', 'tax number', 'tax_number', 'ruc', 'nit', 'rif') || null;
            if (!name) { rowErrors.push(`Fila ${i}: columna "nombre" requerida.`); continue; }
            await pool.request()
              .input('name',           sql.NVarChar, name)
              .input('desc',           sql.NVarChar, description)
              .input('custom_id',      sql.NVarChar, custom_id)
              .input('contact_person', sql.NVarChar, contact_person)
              .input('email',          sql.NVarChar, email)
              .input('phone',          sql.NVarChar, phone)
              .input('address',        sql.NVarChar, address)
              .input('tax_name',       sql.NVarChar, tax_name)
              .input('tax_percentage', sql.Decimal,  isNaN(tax_percentage) ? null : tax_percentage)
              .input('tax_number',     sql.NVarChar, tax_number)
              .query(`IF NOT EXISTS (SELECT 1 FROM clients WHERE name = @name)
                      INSERT INTO clients (name, description, custom_id, contact_person, email, phone, address, tax_name, tax_percentage, tax_number)
                      VALUES (@name, @desc, @custom_id, @contact_person, @email, @phone, @address, @tax_name, @tax_percentage, @tax_number)`);
            imported++;

          } else if (type === 'projects') {
            const name            = get(row, 'project', 'nombre', 'name');
            const clientName      = get(row, 'client', 'cliente');
            const custom_id       = get(row, 'custom id', 'custom_id', 'id personalizado') || null;
            const description     = get(row, 'descripcion', 'descripción', 'description') || null;
            const budget_spent_pct= get(row, 'budget spent in %', 'budget_spent_pct', 'presupuesto %');
            const flat_fee        = get(row, 'project flat fee', 'flat_fee', 'tarifa fija');
            const billable_amount = get(row, 'billable amount', 'billable_amount', 'monto facturable');
            const total_hours     = get(row, 'total hours', 'total_hours', 'horas totales');
            const statusRaw       = get(row, 'status', 'estado') || 'active';
            const active          = statusRaw.toLowerCase() === 'active' ? 1 : 0;
            const toNum = v => (v !== null && v !== undefined && v !== '') ? parseFloat(v) : null;
            if (!name || !clientName) { rowErrors.push(`Fila ${i}: columnas "PROJECT" y "CLIENT" requeridas.`); continue; }
            const cr = await pool.request()
              .input('cn', sql.NVarChar, clientName)
              .query('SELECT id FROM clients WHERE name = @cn');
            if (!cr.recordset.length) { rowErrors.push(`Fila ${i}: cliente "${clientName}" no encontrado.`); continue; }
            const cid = cr.recordset[0].id;
            await pool.request()
              .input('name',             sql.NVarChar, name)
              .input('desc',             sql.NVarChar, description)
              .input('cid',              sql.Int,      cid)
              .input('custom_id',        sql.NVarChar, custom_id)
              .input('budget_spent_pct', sql.Decimal,  toNum(budget_spent_pct))
              .input('flat_fee',         sql.Decimal,  toNum(flat_fee))
              .input('billable_amount',  sql.Decimal,  toNum(billable_amount))
              .input('total_hours',      sql.Decimal,  toNum(total_hours))
              .input('active',           sql.Bit,      active)
              .query(`IF NOT EXISTS (SELECT 1 FROM projects WHERE name = @name AND client_id = @cid)
                      INSERT INTO projects (name, description, client_id, custom_id, budget_spent_pct, flat_fee, billable_amount, total_hours, active)
                      VALUES (@name, @desc, @cid, @custom_id, @budget_spent_pct, @flat_fee, @billable_amount, @total_hours, @active)`);
            imported++;

          } else if (type === 'tasks') {
            const name               = get(row, 'name', 'nombre');
            const description        = get(row, 'description', 'descripcion', 'descripción') || null;
            const hourly_rate        = get(row, 'hourly rate', 'hourly_rate') || null;
            const billable_by_default= get(row, 'billable by default', 'billable_by_default') || 'true';
            const add_to_new_projects= get(row, 'add to new projects', 'add_to_new_projects') || 'false';
            const statusRaw          = get(row, 'status', 'estado') || 'active';
            const active             = statusRaw.toLowerCase() === 'active' ? 1 : 0;
            const toBit = v => (String(v).toLowerCase() === 'true' || v === '1') ? 1 : 0;
            const toNum = v => (v !== null && v !== '') ? parseFloat(v) : null;

            if (!name) { rowErrors.push(`Fila ${i}: columna "NAME" requerida.`); continue; }

            await pool.request()
              .input('name',                sql.NVarChar, name)
              .input('desc',                sql.NVarChar, description)
              .input('hourly_rate',         sql.Decimal,  toNum(hourly_rate))
              .input('billable_by_default', sql.Bit,      toBit(billable_by_default))
              .input('add_to_new_projects', sql.Bit,      toBit(add_to_new_projects))
              .input('active',              sql.Bit,      active)
              .query(`IF NOT EXISTS (SELECT 1 FROM tasks WHERE name = @name)
                      INSERT INTO tasks (name, description, hourly_rate, billable_by_default, add_to_new_projects, active)
                      VALUES (@name, @desc, @hourly_rate, @billable_by_default, @add_to_new_projects, @active)`);
            imported++;

          } else if (type === 'users') {
            const name         = get(row, 'name', 'nombre');
            const email        = (get(row, 'email', 'correo') || '').toLowerCase().trim();
            const roleRaw      = (get(row, 'role', 'rol') || 'Normal');
            const statusRaw    = (get(row, 'status', 'estado') || 'Active');
            const custom_id    = get(row, 'custom id', 'custom_id') || null;
            const labor_rate   = get(row, 'labor rate', 'labor_rate') || null;
            const billable_rate= get(row, 'billable rate', 'billable_rate') || null;
            const projectsRaw  = get(row, 'projects', 'proyectos') || '';

            if (!name || !email) { rowErrors.push(`Fila ${i}: NAME y EMAIL son requeridos.`); continue; }

            // Map role: Normal → user, Admin → admin
            const role   = roleRaw.toLowerCase() === 'admin' ? 'admin' : 'user';
            const active = statusRaw.toLowerCase() === 'active' ? 1 : 0;

            // Default password for all imported users
            const DEFAULT_PASSWORD = 'MisHoras123';
            const hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

            // Insert user if not exists, get their id either way
            await pool.request()
              .input('name',          sql.NVarChar, name)
              .input('email',         sql.NVarChar, email)
              .input('password',      sql.NVarChar, hash)
              .input('role',          sql.NVarChar, role)
              .input('active',        sql.Bit,      active)
              .input('custom_id',     sql.NVarChar, custom_id)
              .input('labor_rate',    sql.Decimal,  labor_rate   != null && labor_rate   !== '' ? parseFloat(labor_rate)   : null)
              .input('billable_rate', sql.Decimal,  billable_rate!= null && billable_rate!== '' ? parseFloat(billable_rate): null)
              .query(`IF NOT EXISTS (SELECT 1 FROM users WHERE email = @email)
                      INSERT INTO users (name, email, password, role, active, custom_id, labor_rate, billable_rate)
                      VALUES (@name, @email, @password, @role, @active, @custom_id, @labor_rate, @billable_rate)`);

            const ur = await pool.request()
              .input('email', sql.NVarChar, email)
              .query('SELECT id FROM users WHERE email = @email');
            const userId = ur.recordset[0]?.id;

            // Parse and link projects — format: "Client - Project, Client - Project, ..."
            if (userId && projectsRaw.trim()) {
              const projectEntries = projectsRaw.split(',').map(s => s.trim()).filter(Boolean);
              for (const entry of projectEntries) {
                const dashIdx = entry.indexOf(' - ');
                if (dashIdx === -1) continue;
                const projectName = entry.slice(dashIdx + 3).trim();
                const pr = await pool.request()
                  .input('pname', sql.NVarChar, projectName)
                  .query('SELECT id FROM projects WHERE name = @pname AND active = 1');
                if (pr.recordset.length) {
                  await pool.request()
                    .input('uid', sql.Int, userId)
                    .input('pid', sql.Int, pr.recordset[0].id)
                    .query(`IF NOT EXISTS (SELECT 1 FROM user_projects WHERE user_id=@uid AND project_id=@pid)
                            INSERT INTO user_projects (user_id, project_id) VALUES (@uid, @pid)`);
                }
              }
            }
            imported++;
          }
        } catch (rowErr) {
          rowErrors.push(`Fila ${i}: ${rowErr.message}`);
        }
      }

      if (rowErrors.length) {
        req.flash('importErrors', rowErrors);
        req.flash('error', `${imported} registros importados con ${rowErrors.length} error(es). Revise el detalle abajo.`);
      } else {
        req.flash('success', `${imported} registros de "${type}" importados correctamente.`);
      }
    } catch (err) {
      console.error(err);
      req.flash('error', 'Error al procesar el archivo: ' + err.message);
    }
    res.redirect('/admin/import');
  },

  async importTimeEntries(req, res) {
    if (!req.file) {
      req.flash('error', 'No se seleccionó ningún archivo.');
      return res.redirect('/admin/import');
    }
    const defaultUserId = req.body.user_id ? parseInt(req.body.user_id, 10) : null;

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error('El archivo no contiene hojas.');

      // Auto-detect header row
      const HEADER_ANCHORS = ['client', 'project', 'cliente', 'proyecto'];
      let headerRowNum = 1;
      for (let r = 1; r <= Math.min(20, sheet.rowCount); r++) {
        const rowVals = [];
        sheet.getRow(r).eachCell(cell => {
          rowVals.push(cell.value?.toString().trim().toLowerCase() || '');
        });
        if (HEADER_ANCHORS.some(a => rowVals.includes(a))) { headerRowNum = r; break; }
      }

      const headers = {};
      sheet.getRow(headerRowNum).eachCell((cell, col) => {
        const key = cell.value?.toString().trim().toLowerCase();
        if (key) headers[key] = col;
      });
      const DATA_START_ROW = headerRowNum + 1;

      const getCellText = (v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'object' && 'result' in v) v = v.result;
        if (typeof v === 'object' && v !== null && Array.isArray(v.richText))
          return v.richText.map(r => r.text || '').join('').trim() || null;
        if (v instanceof Date) return v.toISOString();
        const s = v.toString().trim();
        return s || null;
      };

      const get = (row, ...aliases) => {
        for (const alias of aliases) {
          const col = headers[alias];
          if (col !== undefined) {
            const s = getCellText(row.getCell(col).value);
            if (s !== null) return s;
          }
        }
        return null;
      };

      // Like get() but only returns values that look like a number/duration (start with digit).
      // Prevents picking up description text from mismatched column aliases.
      const getDuration = (row) => {
        const ALIASES = ['duration', 'duración', 'duracion', 'total hours', 'horas totales', 'hours', 'horas', 'time', 'tiempo'];
        for (const alias of ALIASES) {
          const col = headers[alias];
          if (col === undefined) continue;
          const s = getCellText(row.getCell(col).value);
          if (s !== null && /^\d/.test(s.trim())) return s;
        }
        return null;
      };

      const parseDate = (raw) => {
        if (!raw) return null;
        if (raw instanceof Date) {
          if (isNaN(raw.getTime())) return null;
          return raw.toISOString().slice(0, 10);
        }
        const s = raw.toString().trim();
        if (!s) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
        const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
        const m2 = s.match(/(?:\w+,?\s+)?(\d{1,2})\s+([A-Za-z]{3,}),?\s+(\d{4})/);
        if (m2) {
          const mon = MONTHS[m2[2].toLowerCase().slice(0, 3)];
          if (mon) return `${m2[3]}-${String(mon).padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
        }
        if (/^\d{5}$/.test(s)) {
          const d = new Date(Date.UTC(1899, 11, 30) + parseInt(s, 10) * 86400000);
          if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        }
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        return null;
      };

      const parseDuration = (raw) => {
        if (!raw) return null;
        const s = raw.toString().trim();
        if (s.includes(':')) {
          const [h, m] = s.split(':').map(n => parseInt(n, 10) || 0);
          return h + m / 60;
        }
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      };

      const pool = await getPool();

      // ── Pre-load existing clients, projects, tasks and users into Maps ──────
      const clientMap  = new Map(); // "name" → id
      const projectMap = new Map(); // "clientId:name" → id
      const taskMap    = new Map(); // "name" → id
      const userMap    = new Map(); // "name" → id

      const [clientsRes, projectsRes, tasksRes, usersRes] = await Promise.all([
        pool.request().query('SELECT id, name FROM clients'),
        pool.request().query('SELECT id, name, client_id FROM projects'),
        pool.request().query('SELECT id, name FROM tasks'),
        pool.request().query('SELECT id, name FROM users'),
      ]);
      for (const c of clientsRes.recordset)  clientMap.set(c.name, c.id);
      for (const p of projectsRes.recordset) projectMap.set(`${p.client_id}:${p.name}`, p.id);
      for (const t of tasksRes.recordset)    taskMap.set(t.name, t.id);
      for (const u of usersRes.recordset)    userMap.set(u.name, u.id);

      // ── Helpers using caches (only hit DB on cache miss) ─────────────────────
      const getOrCreateClient = async (name) => {
        if (clientMap.has(name)) return clientMap.get(name);
        const r = await pool.request().input('n', sql.NVarChar, name)
          .query('INSERT INTO clients (name) OUTPUT INSERTED.id VALUES (@n)');
        const id = r.recordset[0].id;
        clientMap.set(name, id);
        return id;
      };

      const getOrCreateProject = async (name, clientId) => {
        const key = `${clientId}:${name}`;
        if (projectMap.has(key)) return projectMap.get(key);
        const r = await pool.request().input('n', sql.NVarChar, name).input('cid', sql.Int, clientId)
          .query('INSERT INTO projects (name, client_id) OUTPUT INSERTED.id VALUES (@n, @cid)');
        const id = r.recordset[0].id;
        projectMap.set(key, id);
        return id;
      };

      const getOrCreateTask = async (name) => {
        if (!name) return null;
        if (taskMap.has(name)) return taskMap.get(name);
        const r = await pool.request().input('n', sql.NVarChar, name)
          .query('INSERT INTO tasks (name) OUTPUT INSERTED.id VALUES (@n)');
        const id = r.recordset[0].id;
        taskMap.set(name, id);
        return id;
      };

      // ── Parse all rows, build entry list and relationship sets ───────────────
      const hasUserCol = ('user' in headers) || ('usuario' in headers);
      const entries        = []; // rows to bulk-insert
      const userProjects   = new Set(); // "uid:pid"
      const projectTasks   = new Set(); // "pid:tid"
      let currentDate      = null;
      const rowErrors      = [];

      for (let i = DATA_START_ROW; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        if (!row.hasValues) continue;
        try {
          const dateRaw       = get(row, 'date', 'fecha');
          const firstCellRaw  = getCellText(row.getCell(1).value);
          const parsedDateRaw = parseDate(dateRaw) || parseDate(firstCellRaw);
          // Group-header row: first cell is a valid date
          if (parsedDateRaw) { currentDate = parsedDateRaw; continue; }

          const clientName    = get(row, 'client', 'cliente');
          const projectName   = get(row, 'project', 'proyecto');
          const durRaw        = getDuration(row);

          // Skip silently: description rows, separators, subtotal rows, not-billable 0h rows.
          // A valid time entry always has client + project + numeric duration.
          if (!clientName || !projectName || !durRaw) continue;

          const taskName      = get(row, 'task', 'tarea') || null;
          const description   = get(row, 'description', 'descripcion', 'descripción', 'note', 'notes', 'notas') || null;
          const userName      = hasUserCol ? get(row, 'user', 'usuario') : null;

          const entryDate = currentDate;
          if (!entryDate) { rowErrors.push(`Fila ${i}: fecha requerida (no hay cabecera de fecha anterior).`); continue; }

          const hours = parseDuration(durRaw);
          if (hours === null || hours <= 0) continue;

          let userId = defaultUserId;
          if (hasUserCol && userName) {
            if (!userMap.has(userName)) { rowErrors.push(`Fila ${i}: usuario "${userName}" no encontrado.`); continue; }
            userId = userMap.get(userName);
          }
          if (!userId) { rowErrors.push(`Fila ${i}: no se pudo determinar el usuario.`); continue; }

          const clientId  = await getOrCreateClient(clientName);
          const projectId = await getOrCreateProject(projectName, clientId);
          const taskId    = taskName ? await getOrCreateTask(taskName) : null;

          if (taskId)  projectTasks.add(`${projectId}:${taskId}`);
          userProjects.add(`${userId}:${projectId}`);

          entries.push({ userId, projectId, taskId: taskId || null, entryDate, hours: Math.round(hours * 100) / 100, description });
        } catch (rowErr) {
          rowErrors.push(`Fila ${i}: ${rowErr.message}`);
        }
      }

      // ── Batch-insert relationships ───────────────────────────────────────────
      for (const key of projectTasks) {
        const [pid, tid] = key.split(':').map(Number);
        await pool.request().input('pid', sql.Int, pid).input('tid', sql.Int, tid)
          .query(`IF NOT EXISTS (SELECT 1 FROM project_tasks WHERE project_id=@pid AND task_id=@tid)
                  INSERT INTO project_tasks (project_id, task_id) VALUES (@pid, @tid)`);
      }
      for (const key of userProjects) {
        const [uid, pid] = key.split(':').map(Number);
        await pool.request().input('uid', sql.Int, uid).input('pid', sql.Int, pid)
          .query(`IF NOT EXISTS (SELECT 1 FROM user_projects WHERE user_id=@uid AND project_id=@pid)
                  INSERT INTO user_projects (user_id, project_id) VALUES (@uid, @pid)`);
      }

      // ── Bulk-insert time_entries ─────────────────────────────────────────────
      if (entries.length) {
        const table = new sql.Table('time_entries');
        table.create = false;
        table.columns.add('user_id',     sql.Int,          { nullable: false });
        table.columns.add('project_id',  sql.Int,          { nullable: false });
        table.columns.add('task_id',     sql.Int,          { nullable: true  });
        table.columns.add('entry_date',  sql.Date,         { nullable: false });
        table.columns.add('hours',       sql.Decimal(5,2), { nullable: false });
        table.columns.add('description', sql.NVarChar(500),{ nullable: true  });
        for (const e of entries)
          table.rows.add(e.userId, e.projectId, e.taskId, e.entryDate, e.hours, e.description);
        await pool.request().bulk(table);
      }

      const imported = entries.length;
      if (rowErrors.length) {
        req.flash('importErrors', rowErrors);
        req.flash('error', `${imported} entradas importadas con ${rowErrors.length} error(es). Revise el detalle.`);
      } else {
        req.flash('success', `${imported} entradas de tiempo importadas correctamente.`);
      }
    } catch (err) {
      console.error(err);
      req.flash('error', 'Error al procesar el archivo: ' + err.message);
    }
    res.redirect('/admin/import');
  },
};

module.exports = { UsersController, ClientsController, ProjectsController, TasksController, ReportsController, ImportController, upload };

