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
const { authenticatePage, redirectIfLoggedIn, authorizeRole } = require('./src/middleware/authMiddleware');
const expressLayouts = require('express-ejs-layouts');
const app = express();
const PORT = process.env.API_PORT || 4000;


require('dotenv').config();
console.log("SERVER_JS: NODE_ENV =", process.env.NODE_ENV);

// Setup EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));



// Middleware
app.use(cors()); // Aktifkan CORS untuk semua origin (sesuaikan untuk produksi)
app.use(bodyParser.json()); // Untuk parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // Untuk parsing application/x-www-form-urlencoded
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(expressLayouts);
app.set('layout', 'layouts/admin_layout'); 

// --- Routes API akan didefinisikan di sini ---


// Gunakan Routes
app.use('/api/auth', authRoutes);
app.use('/api/vouchers', voucherRoutes);
// app.use('/api/cash-codes', cashCodeRoutes);
// app.use('/api/transactions', transactionRoutes);
// app.use('/api/reports', reportRoutes);

// Root path (/)
app.get('/', redirectIfLoggedIn('/admin/dashboard'), (req, res) => {
    res.redirect('/admin/login');
});


// Halaman Login Admin
// Jika sudah login, redirect ke dashboard. Jika belum, tampilkan halaman login.
app.get('/admin/login', redirectIfLoggedIn('/admin/dashboard'), (req, res) => {
    res.render('login', { 
        layout: false,
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

// Halaman Generate Kode Cash
app.get('/admin/cash-codes/generate', authenticatePage, authorizeRole(['admin', 'kasir']), (req, res) => {
    res.render('admin-generate-cash-code', { // Buat file admin-generate-cash-code.ejs
        user: req.user,
        currentPath: req.path,
        // title: "Generate Kode Cash" // Bisa di-set di EJS file nya langsung
    });
});

// Halaman Manajemen Voucher
app.get('/admin/vouchers', authenticatePage, authorizeRole(['admin', 'kasir']), (req, res) => {
    // Nanti kita akan ambil data voucher dari DB di sini
    res.render('admin-vouchers', { // Buat file admin-vouchers.ejs
        user: req.user,
        currentPath: req.path,
        vouchers: [] // Kirim array kosong dulu untuk data voucher
    });
});

// Halaman Daftar Transaksi
app.get('/admin/transactions', authenticatePage, authorizeRole(['admin', 'kasir']), (req, res) => {
    // Nanti kita akan ambil data transaksi dari DB di sini
    res.render('admin-transactions', { // Buat file admin-transactions.ejs
        user: req.user,
        currentPath: req.path,
        transactions: [] // Kirim array kosong dulu
    });
});

// Halaman Laporan (jika masih dipakai)
app.get('/admin/reports', authenticatePage, authorizeRole(['admin']), (req, res) => {
    res.render('admin-reports', { // Buat file admin-reports.ejs
        user: req.user,
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