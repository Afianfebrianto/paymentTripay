// backend-api/src/controllers/voucherController.js
const db = require('../db');
// Kita tidak lagi menggunakan applyVoucher dari utils/vouchers.js Electron app,
// karena validasi voucher sekarang terjadi di backend dengan query ke DB.

exports.validateVoucher = async (req, res) => {
    const { voucher_code, base_amount } = req.body;

    if (!voucher_code || typeof base_amount === 'undefined') {
        return res.status(400).json({ success: false, message: 'Kode voucher dan harga dasar harus diisi.' });
    }

    const baseAmountNum = parseFloat(base_amount);
    if (isNaN(baseAmountNum)) {
        return res.status(400).json({ success: false, message: 'Harga dasar tidak valid.' });
    }

    try {
        const { rows } = await db.query('SELECT code, type, value, description, min_purchase, max_discount, expiry_date, is_active FROM vouchers WHERE code = $1 AND is_active = TRUE', [voucher_code.toUpperCase()]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: `Kode voucher "${voucher_code}" tidak ditemukan atau tidak aktif.` });
        }

        const voucher = rows[0];

        // Cek tanggal kedaluwarsa
        if (voucher.expiry_date) {
            const today = new Date();
            const expiry = new Date(voucher.expiry_date);
            today.setHours(0, 0, 0, 0);
            expiry.setHours(23, 59, 59, 999);
            if (today > expiry) {
                return res.json({ success: false, message: `Kode voucher "${voucher_code}" sudah kedaluwarsa.` });
            }
        }

        // Cek pembelian minimum
        if (voucher.min_purchase && baseAmountNum < voucher.min_purchase) {
            return res.json({ success: false, message: `Voucher "${voucher_code}" memerlukan pembelian minimum Rp ${parseFloat(voucher.min_purchase).toLocaleString('id-ID')}.` });
        }

        let discountApplied = 0;
        let finalAmount = baseAmountNum;

        if (voucher.type === "fixed") {
            discountApplied = parseFloat(voucher.value);
            finalAmount = baseAmountNum - discountApplied;
        } else if (voucher.type === "percentage") {
            discountApplied = baseAmountNum * parseFloat(voucher.value);
            if (voucher.max_discount && discountApplied > voucher.max_discount) {
                discountApplied = parseFloat(voucher.max_discount);
            }
            finalAmount = baseAmountNum - discountApplied;
        } else {
            return res.status(500).json({ success: false, message: 'Tipe voucher tidak dikenal di database.' });
        }

        if (finalAmount < 0) {
            finalAmount = 0;
            discountApplied = baseAmountNum; // Diskon maksimal sebesar harga awal
        }
        
        finalAmount = Math.round(finalAmount);
        discountApplied = Math.round(discountApplied);

        res.json({
            success: true,
            message: `${voucher.description} diterapkan.`,
            finalAmount: finalAmount,
            discountApplied: discountApplied,
            voucherDetails: { // Kirim detail voucher untuk ditampilkan jika perlu
                code: voucher.code,
                description: voucher.description,
                type: voucher.type,
                value: voucher.value
            }
        });

    } catch (error) {
        console.error('Error saat validasi voucher:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat validasi voucher.' });
    }
};

// --- Endpoint untuk Web Admin (memerlukan otentikasi) ---
// exports.createVoucher = async (req, res) => { ... }
// exports.getAllVouchers = async (req, res) => { ... }
// exports.updateVoucher = async (req, res) => { ... }
// exports.deleteVoucher = async (req, res) => { ... }