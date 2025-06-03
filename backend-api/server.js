// backend-api/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
// const cookieParser = require('cookie-parser'); // TIDAK DIPERLUKAN LAGI
const db = require('./src/db');
const expressLayouts = require('express-ejs-layouts');

// Impor Routes API
const authApiRoutes = require('./src/routes/authRoutes');
const voucherApiRoutes = require('./src/routes/voucherRoutes');
// const cashCodeApiRoutes = require('./src/routes/cashCodeRoutes'); // Jika sudah dibuat
// const transactionApiRoutes = require('./src/routes/transactionRoutes'); // Jika sudah dibuat
// const reportApiRoutes = require('./src/routes/reportRoutes'); // Jika sudah dibuat

// Impor middleware API (jika ada route API yang dilindungi langsung di server.js, tapi biasanya di file route-nya)
// const { authenticateTokenApi, authorizeRole } = require('./src/middleware/authMiddleware');

const app = express();
const PORT = process.env.API_PORT || 4000;

// Setup EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/admin_layout'); // Layout default untuk halaman admin

// Middleware Global
app.use(cors()); // Izinkan CORS
// app.use(cookieParser(process.env.COOKIE_SECRET)); // TIDAK DIPERLUKAN LAGI
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Sajikan file statis dari folder public

// --- Routes API ---
app.use('/api/auth', authApiRoutes); // Untuk /api/auth/login dan /api/auth/logout
app.use('/api/vouchers', voucherApiRoutes); // voucherRoutes akan menangani otentikasi internalnya
// app.use('/api/cash-codes', cashCodeApiRoutes);
// app.use('/api/transactions', transactionApiRoutes);
// app.use('/api/reports', reportApiRoutes);


// --- Routes untuk Halaman Web Admin (SEKARANG TIDAK ADA OTENTIKASI SERVER-SIDE DI SINI) ---
// Otentikasi akan dilakukan oleh JavaScript sisi klien yang mengecek localStorage

app.get('/', (req, res) => {
    // Client-side JS di /admin/login akan redirect ke dashboard jika sudah login
    res.redirect('/admin/login');
});

app.get('/admin/login', (req, res) => {
    // Client-side JS di login.ejs akan redirect ke dashboard jika sudah ada token di localStorage
    res.render('login', {
        layout: false, // Pastikan login tidak menggunakan layout admin
        title: 'Admin Login',
        // Pesan error/sukses akan dihandle oleh client-side JS
        error: null, 
        success: req.query.success // Untuk pesan setelah logout dari server (opsional)
    });
});

// Halaman Dashboard Admin
app.get('/admin/dashboard', (req, res) => {
    // Client-side JS di dashboard.ejs akan cek token dan redirect jika tidak ada
    res.render('dashboard', {
        // title, pageHeading, user akan di-set/diambil oleh client-side JS atau di EJS
        currentPath: req.path
    });
});

// Contoh Halaman Manajemen Voucher
app.get('/admin/vouchers', (req, res) => {
    res.render('admin-vouchers', { // Buat file admin-vouchers.ejs
        currentPath: req.path
        // Data voucher akan di-fetch oleh client-side JS menggunakan API yang dilindungi
    });
});

// Contoh Halaman Generate Kode Cash
app.get('/admin/cash-codes/generate', (req, res) => {
    res.render('admin-generate-cash-code', {
        currentPath: req.path
    });
});

// Contoh Halaman Daftar Transaksi
app.get('/admin/transactions', (req, res) => {
    res.render('admin-transactions', {
        currentPath: req.path
    });
});

// Contoh Halaman Laporan
app.get('/admin/reports', (req, res) => {
    res.render('admin-reports', {
        currentPath: req.path
    });
});

// Endpoint logout untuk halaman web (opsional jika logout sepenuhnya client-side)
// Jika kamu ingin server melakukan sesuatu saat logout (misal, logging),
// maka endpoint ini bisa dipanggil oleh client.
// Namun, dengan token di localStorage, yang utama adalah client menghapus tokennya.
app.get('/admin/logout', (req, res) => {
    // Ini hanya akan redirect, penghapusan token dilakukan oleh client-side JS
    console.log("SERVER: /admin/logout diakses. Redirecting ke login dengan pesan sukses.");
    res.redirect('/admin/login?success=Anda telah berhasil logout.');
});


// Test Route DB & API dasar (bisa dihapus jika tidak perlu)
app.get('/api/test-db', async (req, res) => {
    try {
        const result = await db.query('SELECT NOW()');
        res.json({ success: true, message: 'Koneksi DB berhasil!', time: result.rows[0].now });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal koneksi DB.', error: err.message });
    }
});
app.get('/api', (req, res) => {
  res.json({ message: 'Selamat datang di Backend API Photobooth! (Token-Based Auth)' });
});


// Error handling middleware (contoh sederhana)
app.use((err, req, res, next) => {
    console.error("Global error handler:", err.stack);
    res.status(500).send('Terjadi kesalahan tak terduga di server!');
});

app.listen(PORT, () => {
  console.log(`Backend API Server dan Web Admin (Token-Based) berjalan di http://localhost:${PORT}`);
});
