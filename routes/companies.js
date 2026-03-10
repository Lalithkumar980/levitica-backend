const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const companyController = require('../controllers/companyController');

router.get('/', companyController.list);
router.post('/', companyController.create);
router.get('/:id', companyController.getOne);
router.put('/:id', companyController.update);
router.delete('/:id', adminOnly, companyController.remove);

module.exports = router;
