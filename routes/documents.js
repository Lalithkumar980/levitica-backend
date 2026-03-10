const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const documentController = require('../controllers/documentController');

router.get('/', documentController.list);
router.post('/', documentController.create);
router.get('/:id', documentController.getOne);
router.put('/:id', documentController.update);
router.delete('/:id', adminOnly, documentController.remove);

module.exports = router;
