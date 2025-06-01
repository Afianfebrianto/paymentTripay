// backend-api/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);
// router.post('/register', authController.register); // Jika ada fungsi register

module.exports = router;