const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const { requireManagerOrAdmin, requireWriteAccess } = require('../middleware/roles');
const dealController = require('../controllers/dealController');

router.get('/export/csv', requireManagerOrAdmin, dealController.exportCsv);
router.get('/kanban', dealController.kanban);
router.get('/', dealController.list);
router.post('/', requireWriteAccess, dealController.create);
router.get('/:id', dealController.getOne);
router.put('/:id', requireWriteAccess, dealController.update);
router.delete('/:id', adminOnly, dealController.remove);

module.exports = router;
