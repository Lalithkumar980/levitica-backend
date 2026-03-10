const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const taskController = require('../controllers/taskController');

router.get('/', taskController.list);
router.post('/', taskController.create);
router.patch('/:id/complete', taskController.complete);
router.put('/:id', taskController.update);
router.delete('/:id', adminOnly, taskController.remove);

module.exports = router;
