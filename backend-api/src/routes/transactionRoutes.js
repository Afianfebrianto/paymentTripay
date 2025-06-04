// backend-api/src/routes/transactionRoutes.js
const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { authenticateTokenApi, authorizeRole } = require('../middleware/authMiddleware');

// Endpoint untuk Web Admin mendapatkan semua transaksi
router.get('/', authenticateTokenApi, authorizeRole(['admin', 'kasir']), transactionController.getAllTransactions);

// Endpoint untuk menerima callback dari TriPay (PERLU DIAMANKAN DENGAN BAIK!)
// Idealnya, path ini acak dan sulit ditebak, dan ada validasi signature.
router.post('/tripay-callback', transactionController.tripayCallbackHandler);

router.post('/notify-qris-paid', transactionController.notifyQrisPaidByElectron);


module.exports = router;
