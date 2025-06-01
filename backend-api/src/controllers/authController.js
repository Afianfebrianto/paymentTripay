// backend-api/src/controllers/authController.js
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: '../../.env' });

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'; // Token berlaku 1 jam by default

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

        // Buat token JWT
        const tokenPayload = {
            userId: user.id,
            username: user.username,
            role: user.role
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        res.json({
            success: true,
            message: 'Login berhasil.',
            token: token,
            user: { // Kirim beberapa info user, tapi jangan password_hash
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

// Nanti bisa ditambahkan fungsi register jika perlu, tapi harus sangat diamankan
// exports.register = async (req, res) => { ... }