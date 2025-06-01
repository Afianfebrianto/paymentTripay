// backend-api/src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: '../../.env' }); // Sesuaikan path ke .env jika middleware ada di subfolder src

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("Kesalahan Fatal: JWT_SECRET belum diatur di file .env");
    process.exit(1);
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        return res.status(401).json({ success: false, message: 'Akses ditolak: Token tidak disediakan.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error("Error verifikasi JWT:", err.message);
            return res.status(403).json({ success: false, message: 'Akses ditolak: Token tidak valid atau kedaluwarsa.' });
        }
        req.user = user; // Simpan informasi user dari token ke object request
        next(); // Lanjutkan ke handler route berikutnya
    });
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
    authenticateToken,
    authorizeRole
};