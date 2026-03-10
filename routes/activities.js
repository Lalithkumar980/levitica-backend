const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const activityController = require('../controllers/activityController');

router.get('/calls', activityController.listCalls);
router.get('/emails', activityController.listEmails);
router.get('/', activityController.list);
router.post('/', activityController.create);
router.get('/:id', activityController.getOne);
router.put('/:id', activityController.update);
router.delete('/:id', adminOnly, activityController.remove);

module.exports = router;
