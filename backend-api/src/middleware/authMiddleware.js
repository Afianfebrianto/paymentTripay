// backend-api/src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: '../../.env' }); // Sesuaikan path ke .env jika middleware ada di subfolder src

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("Kesalahan Fatal: JWT_SECRET belum diatur di file .env");
    process.exit(1);
}

// Middleware untuk API (Bearer Token)
const authenticateTokenApi = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ success: false, message: 'Akses API ditolak: Token tidak disediakan.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Akses API ditolak: Token tidak valid.' });
        }
        req.user = user;
        next();
    });
};

// Middleware baru untuk otentikasi halaman web (via Cookie)
const authenticatePage = (req, res, next) => {
    console.log('------------------------------------');
    console.log(`AUTH_MIDDLEWARE: authenticatePage dipanggil untuk path: ${req.originalUrl}`);
    console.log('AUTH_MIDDLEWARE: Cookies yang diterima server:', JSON.stringify(req.cookies, null, 2)); // Log semua cookies

    const token = req.cookies && req.cookies.adminAuthToken;

    if (!token) {
        console.log('AUTH_MIDDLEWARE: Token adminAuthToken TIDAK ditemukan di cookies. Redirect ke /admin/login.');
        return res.redirect('/admin/login');
    }

    console.log('AUTH_MIDDLEWARE: Token adminAuthToken ditemukan, mencoba verifikasi...');
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Simpan info user ke request
        console.log('AUTH_MIDDLEWARE: Token VALID. User:', JSON.stringify(req.user, null, 2));
        next(); // Lanjutkan ke halaman yang diminta
    } catch (err) {
        console.warn("AUTH_MIDDLEWARE: Token cookie TIDAK VALID atau kedaluwarsa. Menghapus cookie dan redirect ke /admin/login. Error:", err.message);
        res.clearCookie('adminAuthToken'); // Hapus cookie yang salah
        return res.redirect('/admin/login');
    }
    console.log('------------------------------------');
};
// Middleware untuk mengecek apakah pengguna SUDAH login (untuk halaman seperti / atau /admin/login)
const redirectIfLoggedIn = (redirectTo = '/admin/dashboard') => {
    return (req, res, next) => {
       const token = req.cookies && req.cookies.adminAuthToken;
        if (token) {
            try {
                jwt.verify(token, JWT_SECRET); // Cukup verifikasi, tidak perlu simpan user di req
                return res.redirect(redirectTo); // Jika token valid, redirect
            } catch (err) {
                // Token tidak valid, hapus cookie dan lanjutkan (agar bisa ke halaman login)
                res.clearCookie('adminAuthToken');
            }
        }
        next(); // Tidak ada token atau token tidak valid, lanjutkan ke route yang diminta (misal /admin/login)
    };
};


// Middleware untuk mengecek role (opsional, jika kamu punya role berbeda)
const authorizeRole = (roles = []) => {
    // roles bisa array ['admin'] atau string 'admin'
    if (typeof roles === 'string') {
        roles = [roles];
    }

    return (req, res, next) => {
        if (!req.user || (roles.length && !roles.includes(req.user.role))) {
            return res.status(403).json({ success: false, message: 'Akses ditolak: Anda tidak memiliki izin untuk mengakses sumber daya ini.' });
        }
        next();
    };
};


module.exports = {
    authenticateTokenApi, // Untuk API
    authenticatePage,     // Untuk melindungi halaman admin
    redirectIfLoggedIn,   // Untuk halaman login dan root
    authorizeRole
};