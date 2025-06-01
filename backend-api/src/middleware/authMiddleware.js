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
    const token = req.cookies.adminAuthToken; // Ambil token dari cookie

    if (!token) {
        // Jika tidak ada token, redirect ke halaman login
        return res.redirect('/admin/login');
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Simpan info user ke request
        next(); // Lanjutkan ke halaman yang diminta
    } catch (err) {
        // Jika token tidak valid, hapus cookie yang salah dan redirect ke login
        console.warn("Token cookie tidak valid:", err.message);
        res.clearCookie('adminAuthToken');
        return res.redirect('/admin/login');
    }
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