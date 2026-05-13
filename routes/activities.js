const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const { callRecordingUpload } = require('../middleware/upload');
const activityController = require('../controllers/activityController');

router.get('/calls', activityController.listCalls);
router.get('/emails', activityController.listEmails);
router.get('/', activityController.list);
router.post('/', callRecordingUpload, activityController.create);
router.get('/:id', activityController.getOne);
router.put('/:id', callRecordingUpload, activityController.update);
router.delete('/:id', adminOnly, activityController.remove);


module.exports = router;
