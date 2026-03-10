const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const contactController = require('../controllers/contactController');

router.get('/', contactController.list);
router.post('/', contactController.create);
router.get('/:id', contactController.getOne);
router.put('/:id', contactController.update);
router.delete('/:id', adminOnly, contactController.remove);

module.exports = router;
