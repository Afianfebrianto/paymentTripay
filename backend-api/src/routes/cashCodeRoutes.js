// backend-api/src/routes/cashCodeRoutes.js
const express = require('express');
const router = express.Router();
const cashCodeController = require('../controllers/cashCodeController');
const { authenticateTokenApi, authorizeRole } = require('../middleware/authMiddleware');

// Endpoint untuk Web Admin generate kode cash (dilindungi)
router.post('/generate', authenticateTokenApi, authorizeRole(['admin', 'kasir']), cashCodeController.generateCashCode);

// Endpoint untuk Aplikasi Electron redeem kode cash
// Otentikasi untuk endpoint ini mungkin berbeda (misalnya, API key khusus untuk Electron app, atau tidak ada jika jaringan lokal aman)
// Untuk sekarang, kita tidak melindunginya dengan token admin, tapi ini perlu dipertimbangkan.
router.post('/redeem', cashCodeController.redeemCashCode);

module.exports = router;
