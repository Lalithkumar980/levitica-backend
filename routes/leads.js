const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const { requireManagerOrAdmin } = require('../middleware/roles');
const leadController = require('../controllers/leadController');

router.get('/export/csv', requireManagerOrAdmin, leadController.exportCsv);
router.get('/', leadController.list);
router.post('/', leadController.create);
router.get('/:id', leadController.getOne);
router.put('/:id', leadController.update);
router.delete('/:id', adminOnly, leadController.remove);
router.post('/:id/convert', leadController.convert);

module.exports = router;
