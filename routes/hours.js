'use strict';

const express         = require('express');
const { requireLogin } = require('../middleware/auth');
const HoursController = require('../controllers/hoursController');
const router          = express.Router();

router.use(requireLogin);

router.get('/',              HoursController.index);
router.get('/new',           HoursController.showNew);
router.post('/',             HoursController.create);
router.get('/:id/edit',      HoursController.showEdit);
router.put('/:id',           HoursController.update);
router.delete('/:id',        HoursController.delete);

// AJAX endpoint – tasks by project
router.get('/api/tasks/:projectId', HoursController.getTasksByProject);

module.exports = router;
