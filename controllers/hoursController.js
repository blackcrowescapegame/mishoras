'use strict';

const TimeEntry = require('../models/TimeEntry');
const Project   = require('../models/Project');
const Task      = require('../models/Task');

const HoursController = {
  async index(req, res) {
    const { from, to } = req.query;
    try {
      const entries = await TimeEntry.findByUser(req.session.userId, { from, to });
      const totalHours = entries.reduce((sum, e) => sum + parseFloat(e.hours), 0);
      res.render('hours/index', {
        title: 'My Hours',
        entries,
        totalHours: totalHours.toFixed(2),
        from: from || '',
        to: to || '',
        success: req.flash('success'),
        error: req.flash('error'),
        user: req.session.user,
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not load entries.');
      res.redirect('/');
    }
  },

  async showNew(req, res) {
    try {
      const projects = await Project.findAll(true);
      res.render('hours/form', {
        title: 'Log Hours',
        entry: null,
        projects,
        tasks: [],
        error: req.flash('error'),
        user: req.session.user,
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not load form.');
      res.redirect('/hours');
    }
  },

  async create(req, res) {
    const { project_id, task_id, entry_date, hours, description, entry_mode } = req.body;
    // entry_mode: 'quantity' (just hours) or 'day' (hours for specific date)
    const finalDate = entry_date || new Date().toISOString().slice(0, 10);
    try {
      await TimeEntry.create({
        user_id: req.session.userId,
        project_id: parseInt(project_id, 10),
        task_id: task_id ? parseInt(task_id, 10) : null,
        entry_date: finalDate,
        hours,
        description,
      });
      req.flash('success', 'Hours logged successfully.');
      res.redirect('/hours');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not save entry. Please check your input.');
      res.redirect('/hours/new');
    }
  },

  async showEdit(req, res) {
    try {
      const entry = await TimeEntry.findById(parseInt(req.params.id, 10));
      if (!entry || entry.user_id !== req.session.userId) {
        req.flash('error', 'Entry not found.');
        return res.redirect('/hours');
      }
      const projects = await Project.findAll(true);
      const tasks    = entry.project_id ? await Task.findByProject(entry.project_id, true) : [];
      res.render('hours/form', {
        title: 'Edit Hours',
        entry,
        projects,
        tasks,
        error: req.flash('error'),
        user: req.session.user,
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not load entry.');
      res.redirect('/hours');
    }
  },

  async update(req, res) {
    const id = parseInt(req.params.id, 10);
    const { project_id, task_id, entry_date, hours, description } = req.body;
    try {
      const entry = await TimeEntry.findById(id);
      if (!entry || entry.user_id !== req.session.userId) {
        req.flash('error', 'Entry not found.');
        return res.redirect('/hours');
      }
      await TimeEntry.update(id, {
        project_id: parseInt(project_id, 10),
        task_id: task_id ? parseInt(task_id, 10) : null,
        entry_date,
        hours,
        description,
      });
      req.flash('success', 'Entry updated.');
      res.redirect('/hours');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not update entry.');
      res.redirect('/hours');
    }
  },

  async delete(req, res) {
    const id = parseInt(req.params.id, 10);
    try {
      const entry = await TimeEntry.findById(id);
      if (!entry || entry.user_id !== req.session.userId) {
        req.flash('error', 'Entry not found.');
        return res.redirect('/hours');
      }
      await TimeEntry.delete(id);
      req.flash('success', 'Entry deleted.');
      res.redirect('/hours');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not delete entry.');
      res.redirect('/hours');
    }
  },

  /* AJAX – returns tasks for a project */
  async getTasksByProject(req, res) {
    try {
      const tasks = await Task.findByProject(parseInt(req.params.projectId, 10), true);
      res.json(tasks);
    } catch (err) {
      res.status(500).json({ error: 'Could not load tasks.' });
    }
  },
};

module.exports = HoursController;
