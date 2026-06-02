const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const { requireWriteAccess } = require('../middleware/roles');
const companyController = require('../controllers/companyController');

router.get('/', companyController.list);
router.post('/', requireWriteAccess, companyController.create);
router.get('/:id', companyController.getOne);
router.put('/:id', requireWriteAccess, companyController.update);
router.delete('/:id', adminOnly, companyController.remove);

module.exports = router;
