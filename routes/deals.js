const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const { requireManagerOrAdmin } = require('../middleware/roles');
const dealController = require('../controllers/dealController');

router.get('/export/csv', requireManagerOrAdmin, dealController.exportCsv);
router.get('/kanban', dealController.kanban);
router.get('/', dealController.list);
router.post('/', dealController.create);
router.get('/:id', dealController.getOne);
router.put('/:id', dealController.update);
router.delete('/:id', adminOnly, dealController.remove);

module.exports = router;
