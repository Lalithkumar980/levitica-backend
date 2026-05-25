const express = require("express");
const router = express.Router();
const financeController = require("../controllers/financeController");

router.get("/recent-activity", financeController.recentActivity);

module.exports = router;
