const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const { documentUpload } = require('../middleware/upload');
const documentController = require('../controllers/documentController');

router.get('/', documentController.list);
router.post('/', documentUpload, documentController.create);
router.get('/:id', documentController.getOne);
router.get('/:id/download', documentController.download);
router.put('/:id', documentUpload, documentController.update);
router.delete('/:id', adminOnly, documentController.remove);

module.exports = router;
