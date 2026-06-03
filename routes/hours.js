'use strict';

const express         = require('express');
const { requireLogin } = require('../middleware/auth');
const HoursController = require('../controllers/hoursController');
const router          = express.Router();

router.use(requireLogin);

router.get('/',              HoursController.index);
router.get('/dashboard',          HoursController.dashboardView);
router.get('/detailed',           HoursController.detailedView);
router.get('/detailed/:fmt',      HoursController.downloadDetailed);
router.post('/weekly',       HoursController.saveWeekly);
router.post('/',             HoursController.create);
router.get('/:id/edit',      HoursController.showEdit);
router.put('/:id',           HoursController.update);
router.delete('/:id',        HoursController.delete);

// AJAX endpoint – tasks by project
router.get('/api/tasks/:projectId', HoursController.getTasksByProject);
// AJAX endpoint – auto-save single entry
router.post('/api/autosave',        HoursController.autoSave);

module.exports = router;
