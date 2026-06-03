const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const { requireManagerOrAdmin, requireWriteAccess } = require('../middleware/roles');
const leadController = require('../controllers/leadController');

router.get('/export/csv', requireManagerOrAdmin, leadController.exportCsv);
router.get('/', leadController.list);
router.post('/', requireWriteAccess, leadController.create);
router.get('/:id', leadController.getOne);
router.put('/:id', requireWriteAccess, leadController.update);
router.patch('/:id', requireWriteAccess, leadController.update);
router.delete('/:id', adminOnly, leadController.remove);
router.post('/:id/convert', requireWriteAccess, leadController.convert);
router.post('/:id/promote', requireWriteAccess, leadController.promote);

module.exports = router;
