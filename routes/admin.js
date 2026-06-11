'use strict';

const express = require('express');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const {
  UsersController, ClientsController, ProjectsController,
  TasksController, ReportsController, ImportController, upload,
} = require('../controllers/adminController');

const router = express.Router();
router.use(requireLogin, requireAdmin);

/* Dashboard */
router.get('/', (req, res) => {
  res.render('admin/dashboard', { title: 'Admin Dashboard', user: req.session.user });
});

/* Users */
router.get('/users',           UsersController.index);
router.get('/users/new',       UsersController.showNew);
router.post('/users',          UsersController.create);
router.get('/users/:id/edit',  UsersController.showEdit);
router.put('/users/:id',       UsersController.update);

/* Clients */
router.get('/clients',           ClientsController.index);
router.get('/clients/new',       ClientsController.showNew);
router.post('/clients',          ClientsController.create);
router.get('/clients/:id/edit',  ClientsController.showEdit);
router.put('/clients/:id',       ClientsController.update);
router.delete('/clients/:id',    ClientsController.delete);

/* Projects */
router.get('/projects',           ProjectsController.index);
router.get('/projects/new',       ProjectsController.showNew);
router.post('/projects',          ProjectsController.create);
router.get('/projects/:id/edit',  ProjectsController.showEdit);
router.put('/projects/:id',       ProjectsController.update);
router.delete('/projects/:id',    ProjectsController.delete);

/* Tasks */
router.get('/tasks',           TasksController.index);
router.get('/tasks/new',       TasksController.showNew);
router.post('/tasks',          TasksController.create);
router.get('/tasks/:id/edit',  TasksController.showEdit);
router.put('/tasks/:id',       TasksController.update);
router.delete('/tasks/:id',    TasksController.delete);

/* Reports */
router.get('/reports', ReportsController.index);

/* Import */
router.get('/import',                                         ImportController.show);
router.post('/import/time-entries', upload.single('file'),    ImportController.importTimeEntries);
router.post('/import/:type', upload.single('file'),           ImportController.importFile);

module.exports = router;
