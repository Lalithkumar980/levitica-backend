const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const { requireWriteAccess } = require('../middleware/roles');
const taskController = require('../controllers/taskController');

router.get('/', taskController.list);
router.post('/', requireWriteAccess, taskController.create);
router.patch('/:id/complete', requireWriteAccess, taskController.complete);
router.put('/:id', requireWriteAccess, taskController.update);
router.delete('/:id', adminOnly, taskController.remove);

module.exports = router;
