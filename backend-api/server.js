// backend-api/server.js
require('dotenv').config(); // Muat variabel dari .env di root backend-api
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./src/db'); // Impor setup database kita

// Impor Routes
const authRoutes = require('./src/routes/authRoutes');
const voucherRoutes = require('./src/routes/voucherRoutes');
// const cashCodeRoutes = require('./src/routes/cashCodeRoutes');
// const transactionRoutes = require('./src/routes/transactionRoutes');
// const reportRoutes = require('./src/routes/reportRoutes');


const app = express();
const PORT = process.env.API_PORT || 4000;

// Middleware
app.use(cors()); // Aktifkan CORS untuk semua origin (sesuaikan untuk produksi)
app.use(bodyParser.json()); // Untuk parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // Untuk parsing application/x-www-form-urlencoded

// --- Routes API akan didefinisikan di sini ---

// Contoh Test Route untuk cek koneksi DB
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()'); // Query sederhana ke PostgreSQL
    res.json({
      success: true,
      message: 'Koneksi database berhasil!',
      time: result.rows[0].now,
    });
  } catch (err) {
    console.error('Error saat tes koneksi DB:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal terhubung ke database.',
      error: err.message,
    });
  }
});

// Gunakan Routes
app.use('/api/auth', authRoutes);
app.use('/api/vouchers', voucherRoutes);
// app.use('/api/cash-codes', cashCodeRoutes);
// app.use('/api/transactions', transactionRoutes);
// app.use('/api/reports', reportRoutes);


// Contoh route dasar
app.get('/api', (req, res) => {
  res.json({ message: 'Selamat datang di Backend API Photobooth!' });
});

// --- Nanti kita tambahkan routes untuk Voucher, Transaksi, Kode Cash, dll. ---
// const voucherRoutes = require('./src/routes/voucherRoutes');
// app.use('/api/vouchers', voucherRoutes);

// Jalankan server
app.listen(PORT, () => {
  console.log(`Backend API Server berjalan di http://localhost:${PORT}`);
});