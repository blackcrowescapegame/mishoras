'use strict';

const bcrypt     = require('bcrypt');
const User       = require('../models/User');
const Client     = require('../models/Client');
const Project    = require('../models/Project');
const Task       = require('../models/Task');
const TimeEntry  = require('../models/TimeEntry');

const SALT_ROUNDS = 10;

/* ─── Users ─── */
const UsersController = {
  async index(req, res) {
    const users = await User.findAll();
    res.render('admin/users/index', {
      title: 'Manage Users', users,
      success: req.flash('success'), error: req.flash('error'),
      user: req.session.user,
    });
  },

  showNew(req, res) {
    res.render('admin/users/form', {
      title: 'New User', item: null,
      error: req.flash('error'), user: req.session.user,
    });
  },

  async create(req, res) {
    const { name, email, password, role } = req.body;
    try {
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await User.create({ name, email: email.trim().toLowerCase(), password: hash, role });
      req.flash('success', 'User created.');
      res.redirect('/admin/users');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not create user. Email may already exist.');
      res.redirect('/admin/users/new');
    }
  },

  async showEdit(req, res) {
    const item = await User.findById(parseInt(req.params.id, 10));
    if (!item) { req.flash('error', 'User not found.'); return res.redirect('/admin/users'); }
    res.render('admin/users/form', {
      title: 'Edit User', item,
      error: req.flash('error'), user: req.session.user,
    });
  },

  async update(req, res) {
    const id = parseInt(req.params.id, 10);
    const { name, email, role, active, password } = req.body;
    try {
      await User.update(id, { name, email: email.trim().toLowerCase(), role, active: active ? 1 : 0 });
      if (password && password.trim()) {
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        await User.updatePassword(id, hash);
      }
      req.flash('success', 'User updated.');
      res.redirect('/admin/users');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not update user.');
      res.redirect(`/admin/users/${id}/edit`);
    }
  },
};

/* ─── Clients ─── */
const ClientsController = {
  async index(req, res) {
    const clients = await Client.findAll();
    res.render('admin/clients/index', {
      title: 'Manage Clients', clients,
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
    const { name, description } = req.body;
    try {
      await Client.create({ name, description });
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
    const { name, description, active } = req.body;
    try {
      await Client.update(id, { name, description, active: active ? 1 : 0 });
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
    const projects = await Project.findAll();
    res.render('admin/projects/index', {
      title: 'Manage Projects', projects,
      success: req.flash('success'), error: req.flash('error'),
      user: req.session.user,
    });
  },

  async showNew(req, res) {
    const clients = await Client.findAll(true);
    res.render('admin/projects/form', {
      title: 'New Project', item: null, clients,
      error: req.flash('error'), user: req.session.user,
    });
  },

  async create(req, res) {
    const { name, description, client_id } = req.body;
    try {
      await Project.create({ name, description, client_id: parseInt(client_id, 10) });
      req.flash('success', 'Project created.');
      res.redirect('/admin/projects');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not create project.');
      res.redirect('/admin/projects/new');
    }
  },

  async showEdit(req, res) {
    const item    = await Project.findById(parseInt(req.params.id, 10));
    const clients = await Client.findAll(true);
    if (!item) { req.flash('error', 'Project not found.'); return res.redirect('/admin/projects'); }
    res.render('admin/projects/form', {
      title: 'Edit Project', item, clients,
      error: req.flash('error'), user: req.session.user,
    });
  },

  async update(req, res) {
    const id = parseInt(req.params.id, 10);
    const { name, description, client_id, active } = req.body;
    try {
      await Project.update(id, { name, description, client_id: parseInt(client_id, 10), active: active ? 1 : 0 });
      req.flash('success', 'Project updated.');
      res.redirect('/admin/projects');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not update project.');
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
    const tasks = await Task.findAll();
    res.render('admin/tasks/index', {
      title: 'Manage Tasks', tasks,
      success: req.flash('success'), error: req.flash('error'),
      user: req.session.user,
    });
  },

  async showNew(req, res) {
    const projects = await Project.findAll(true);
    res.render('admin/tasks/form', {
      title: 'New Task', item: null, projects,
      error: req.flash('error'), user: req.session.user,
    });
  },

  async create(req, res) {
    const { name, description, project_id } = req.body;
    try {
      await Task.create({ name, description, project_id: parseInt(project_id, 10) });
      req.flash('success', 'Task created.');
      res.redirect('/admin/tasks');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not create task.');
      res.redirect('/admin/tasks/new');
    }
  },

  async showEdit(req, res) {
    const item     = await Task.findById(parseInt(req.params.id, 10));
    const projects = await Project.findAll(true);
    if (!item) { req.flash('error', 'Task not found.'); return res.redirect('/admin/tasks'); }
    res.render('admin/tasks/form', {
      title: 'Edit Task', item, projects,
      error: req.flash('error'), user: req.session.user,
    });
  },

  async update(req, res) {
    const id = parseInt(req.params.id, 10);
    const { name, description, project_id, active } = req.body;
    try {
      await Task.update(id, { name, description, project_id: parseInt(project_id, 10), active: active ? 1 : 0 });
      req.flash('success', 'Task updated.');
      res.redirect('/admin/tasks');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not update task.');
      res.redirect(`/admin/tasks/${id}/edit`);
    }
  },

  async delete(req, res) {
    try {
      await Task.delete(parseInt(req.params.id, 10));
      req.flash('success', 'Task deactivated.');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not deactivate task.');
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

module.exports = { UsersController, ClientsController, ProjectsController, TasksController, ReportsController };
