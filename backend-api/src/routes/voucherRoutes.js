// backend-api/src/routes/voucherRoutes.js
const express = require('express');
const router = express.Router();
const voucherController = require('../controllers/voucherController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware'); // Impor middleware

// Endpoint ini untuk Electron App, mungkin tidak perlu otentikasi atau pakai API key khusus Electron
router.post('/validate', voucherController.validateVoucher);

// Contoh endpoint untuk admin (dilindungi)
// router.post('/', authenticateToken, authorizeRole(['admin']), voucherController.createVoucher);
// router.get('/', authenticateToken, authorizeRole(['admin', 'kasir']), voucherController.getAllVouchers);
// router.put('/:id', authenticateToken, authorizeRole(['admin']), voucherController.updateVoucher);
// router.delete('/:id', authenticateToken, authorizeRole(['admin']), voucherController.deleteVoucher);

module.exports = router;