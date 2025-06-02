// backend-api/src/controllers/authController.js
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// require('dotenv').config(); // Tidak perlu jika sudah di server.js paling atas

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'; // Token berlaku 1 jam by default
 const isSecureEnvironment = process.env.NODE_ENV === 'production';

exports.login = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username dan password harus diisi.' });
    }

    try {
        const { rows } = await db.query('SELECT id, username, password_hash, role, is_active FROM admin_users WHERE username = $1', [username]);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Username atau password salah.' });
        }

        const user = rows[0];

        if (!user.is_active) {
            return res.status(403).json({ success: false, message: 'Akun pengguna tidak aktif.' });
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordMatch) {
            return res.status(401).json({ success: false, message: 'Username atau password salah.' });
        }

        const tokenPayload = {
            userId: user.id,
            username: user.username,
            role: user.role
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        res.cookie('adminAuthToken', token, {
        httpOnly: true,
        secure: isSecureEnvironment, // Hanya true jika di produksi (asumsi produksi selalu HTTPS)
        maxAge: parseInt(JWT_EXPIRES_IN) * 1000 || 3600000, // 1 jam
        path: '/', // Berlaku untuk seluruh domain
        sameSite: 'Lax' // Pilihan yang baik untuk keseimbangan keamanan dan fungsionalitas
    });

        // Kirim respons JSON seperti biasa, client-side JS bisa menggunakannya untuk konfirmasi
        res.json({
            success: true,
            message: 'Login berhasil.',
            // Token tidak perlu dikirim di body lagi jika sudah di cookie httpOnly
            // token: token, 
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Error saat login:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
};

// Tambahkan fungsi logout untuk menghapus cookie
exports.logout = (req, res) => {
    res.cookie('adminAuthToken', '', {
        httpOnly: true,
        expires: new Date(0) // Set cookie kedaluwarsa
    });
    // Redirect ke halaman login setelah logout, atau kirim respons JSON
    // Jika dipanggil dari client-side JS yang mengharapkan JSON:
    // res.json({ success: true, message: 'Logout berhasil.' });
    // Jika ingin redirect langsung dari server (misalnya jika form logout adalah POST biasa):
    res.redirect('/admin/login');
};