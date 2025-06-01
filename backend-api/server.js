// backend-api/server.js
require('dotenv').config(); // Muat variabel dari .env di root backend-api
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path'); // Modul path untuk menangani path direktori
const cookieParser = require('cookie-parser');
const db = require('./src/db'); // Impor setup database kita

// Impor Routes
const authRoutes = require('./src/routes/authRoutes');
const voucherRoutes = require('./src/routes/voucherRoutes');
// Impor middleware otentikasi
const { authenticatePage, redirectIfLoggedIn, authorizeRole } = require('./src/middleware/authMiddleware');
const expressLayouts = require('express-ejs-layouts');


// const cashCodeRoutes = require('./src/routes/cashCodeRoutes');
// const transactionRoutes = require('./src/routes/transactionRoutes');
// const reportRoutes = require('./src/routes/reportRoutes');

const app = express();
const PORT = process.env.API_PORT || 4000;

// Setup EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));



// Middleware
app.use(cors()); // Aktifkan CORS untuk semua origin (sesuaikan untuk produksi)
app.use(bodyParser.json()); // Untuk parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // Untuk parsing application/x-www-form-urlencoded
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser(process.env.COOKIE_SECRET));

// --- Routes API akan didefinisikan di sini ---


// Gunakan Routes
app.use('/api/auth', authRoutes);
app.use('/api/vouchers', voucherRoutes);
// app.use('/api/cash-codes', cashCodeRoutes);
// app.use('/api/transactions', transactionRoutes);
// app.use('/api/reports', reportRoutes);

// Root path (/)
app.get('/', redirectIfLoggedIn('/admin/dashboard'), (req, res) => {
    // Jika redirectIfLoggedIn tidak melakukan redirect (karena tidak ada token valid),
    // maka kita arahkan ke login.
    // Sebenarnya, redirectIfLoggedIn('/admin/dashboard') akan menangani kasus sudah login,
    // dan jika tidak, ia akan memanggil next(). Maka, kita perlu aksi jika next() dipanggil.
    // Lebih baik:
    // app.get('/', (req, res) => { res.redirect('/admin/login'); });
    // ATAU:
    // Jika sudah login, redirectIfLoggedIn akan redirect ke dashboard.
    // Jika tidak, dia akan next(), dan kita redirect ke login.
    res.redirect('/admin/login');
});


// Halaman Login Admin
// Jika sudah login, redirect ke dashboard. Jika belum, tampilkan halaman login.
app.get('/admin/login', redirectIfLoggedIn('/admin/dashboard'), (req, res) => {
    res.render('login', { 
        title: 'Admin Login', 
        error: req.query.error, // Ambil error dari query param jika ada redirect
        success: req.query.success 
    });
});

// Halaman Logout (untuk link atau tombol GET, atau POST dari form logout)
// API /api/auth/logout akan menghapus cookie. Setelah itu, redirect ke login.
app.get('/admin/logout', (req, res) => {
    res.cookie('adminAuthToken', '', { expires: new Date(0), httpOnly: true });
    res.redirect('/admin/login?success=Anda telah berhasil logout.');
});

// Halaman Dashboard Admin (Contoh, perlu authenticateToken)
app.get('/admin/dashboard', authenticatePage, (req, res) => {
    res.render('dashboard', {
        user: req.user,
        // title dan pageHeading akan di-set di dashboard.ejs
        // currentPath bisa dikirim dari sini untuk menandai menu aktif
        currentPath: req.path 
    });
});
// --- Nanti kita tambahkan routes untuk Voucher, Transaksi, Kode Cash, dll. ---
// const voucherRoutes = require('./src/routes/voucherRoutes');
// app.use('/api/vouchers', voucherRoutes);

// Error handling middleware (contoh sederhana)
app.use((err, req, res, next) => {
    console.error("Global error handler:", err.stack);
    res.status(500).send('Terjadi kesalahan tak terduga!');
});


// Jalankan server
app.listen(PORT, () => {
  console.log(`Backend API Server berjalan di http://localhost:${PORT}`);
});