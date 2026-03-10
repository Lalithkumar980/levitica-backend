const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

router.get('/', invoiceController.list);
router.post('/', invoiceController.create);
router.get('/:id', invoiceController.getOne);
router.put('/:id', invoiceController.update);
router.delete('/:id', invoiceController.remove);

module.exports = router;
