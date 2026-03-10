const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

router.get('/', paymentController.list);
router.post('/', paymentController.create);
router.get('/:id', paymentController.getOne);
router.put('/:id', paymentController.update);
router.delete('/:id', paymentController.remove);

module.exports = router;
