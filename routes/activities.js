const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const { callRecordingUpload } = require('../middleware/upload');
const { requireWriteAccess } = require('../middleware/roles');
const activityController = require('../controllers/activityController');

router.get('/calls', activityController.listCalls);
router.get('/calls/:id/audio', activityController.streamAudio);
router.get('/emails', activityController.listEmails);
router.get('/recent-activity', activityController.recentActivity);
router.get('/sales-rep-activity', activityController.salesRepActivity);
router.get('/sales-manager-activity', activityController.salesManagerActivity);
router.get('/', activityController.list);
router.post('/', requireWriteAccess, callRecordingUpload, activityController.create);
router.get('/:id', activityController.getOne);
router.put('/:id', requireWriteAccess, callRecordingUpload, activityController.update);
router.delete('/:id', adminOnly, activityController.remove);


module.exports = router;
