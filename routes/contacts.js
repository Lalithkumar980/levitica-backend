const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const { requireWriteAccess } = require('../middleware/roles');
const contactController = require('../controllers/contactController');

router.get('/', contactController.list);
router.post('/', requireWriteAccess, contactController.create);
router.get('/:id', contactController.getOne);
router.put('/:id', requireWriteAccess, contactController.update);
router.patch('/:id', requireWriteAccess, contactController.update);
router.delete('/:id', adminOnly, contactController.remove);

module.exports = router;
