// backend-api/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./src/db');
const expressLayouts = require('express-ejs-layouts');

// Impor Routes API
const authApiRoutes = require('./src/routes/authRoutes');
const voucherApiRoutes = require('./src/routes/voucherRoutes');
const cashCodeApiRoutes = require('./src/routes/cashCodeRoutes');
const transactionApiRoutes = require('./src/routes/transactionRoutes');
// const reportApiRoutes = require('./src/routes/reportRoutes');

// Impor middleware otentikasi yang HANYA akan digunakan untuk API
// Kita tidak lagi menggunakan authenticatePage atau redirectIfLoggedIn di server-side untuk halaman
// Hanya authorizeRole yang mungkin masih relevan jika ada logika otorisasi di server untuk halaman tertentu,
// TAPI biasanya authorizeRole juga dipakai bersamaan dengan authenticateTokenApi untuk endpoint API.
// Untuk render halaman EJS murni, kita serahkan ke client-side JS.
// const { authorizeRole } = require('./src/middleware/authMiddleware'); // Komentari atau hapus jika tidak dipakai langsung di sini

const app = express();
const PORT = process.env.API_PORT || 4000;

// Setup EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/admin_layout'); // Layout default untuk halaman admin

// Middleware Global
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes API ---
app.use('/api/auth', authApiRoutes);
app.use('/api/vouchers', voucherApiRoutes);
app.use('/api/cash-codes', cashCodeApiRoutes);
app.use('/api/transactions', transactionApiRoutes);
// app.use('/api/reports', reportApiRoutes);


// --- Routes untuk Halaman Web Admin ---
// Otentikasi dan proteksi halaman sekarang dilakukan oleh JavaScript sisi klien (admin-auth.js)
// yang mengecek token di localStorage.

app.get('/', (req, res) => {
    // Client-side JS di /admin/login akan redirect ke dashboard jika sudah login
    res.redirect('/admin/login');
});

app.get('/admin/login', (req, res) => {
    // Client-side JS di login.ejs akan redirect ke dashboard jika sudah ada token di localStorage
    res.render('login', {
        layout: false, // Pastikan login tidak menggunakan layout admin
        title: 'Admin Login',
        error: req.query.error, 
        success: req.query.success
    });
});

// Halaman Dashboard Admin
app.get('/admin/dashboard', (req, res) => {
    // Client-side JS (admin-auth.js -> protectPageClientSide) akan cek token.
    // Variabel 'user' akan di-populate oleh client-side JS dari localStorage.
    res.render('dashboard', {
        currentPath: req.path,
        title: "Dashboard", // Kirim title dari sini
        pageHeading: "Dashboard Utama" // Kirim pageHeading dari sini
        // user: null // Tidak perlu kirim user dari server lagi
    });
});

app.get('/admin/cash-codes/generate', (req, res) => {
    // Client-side JS akan cek token
    res.render('admin-generate-cash-code', { 
        currentPath: req.path,
        title: "Generate Kode Cash",
        pageHeading: "Generate Kode Pembayaran Cash",
        page_custom_scripts: `
            <script src="/js/admin-generate-cash-code.js"></script> 
        ` // Contoh jika ada skrip khusus
    });
});

app.get('/admin/vouchers', (req, res) => {
    // Client-side JS akan cek token
    res.render('admin-vouchers', { 
        currentPath: req.path,
        title: "Manajemen Voucher",
        pageHeading: "Manajemen Voucher",
        page_plugins_scripts: `
            <script src="/sb-admin-2/vendor/datatables/jquery.dataTables.min.js"></script>
            <script src="/sb-admin-2/vendor/datatables/dataTables.bootstrap4.min.js"></script>
            <link href="/sb-admin-2/vendor/datatables/dataTables.bootstrap4.min.css" rel="stylesheet">
        `,
        page_custom_scripts: `
            <script src="/js/admin-vouchers.js"></script>
        `
    });
});

app.get('/admin/transactions', (req, res) => {
    // Client-side JS akan cek token
    res.render('admin-transactions', { 
        currentPath: req.path,
        title: "Daftar Transaksi",
        pageHeading: "Riwayat Transaksi"
        // Data transaksi akan di-fetch oleh client-side JS via API
    });
});

app.get('/admin/reports', (req, res) => {
    // Client-side JS akan cek token
    res.render('admin-reports', {
        currentPath: req.path,
        title: "Laporan",
        pageHeading: "Laporan Bulanan"
    });
});

app.get('/admin/logout', (req, res) => {
    // Client-side JS (admin-auth.js) akan menghapus token dari localStorage dan redirect.
    console.log("SERVER: GET /admin/logout diakses. Mengarahkan ke login dengan pesan sukses.");
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
