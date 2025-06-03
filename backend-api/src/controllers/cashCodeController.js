// backend-api/src/controllers/cashCodeController.js
const db = require('../db');
const voucherController = require('./voucherController'); // Untuk validasi voucher internal

// Fungsi untuk generate kode acak (bisa lebih kompleks)
function generateUniqueCode(length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
    // TODO: Pastikan kode ini benar-benar unik di database, mungkin perlu loop cek
}

// Generate Kode Pembayaran Cash (oleh Admin/Kasir)
exports.generateCashCode = async (req, res) => {
    let { amount, voucher_code } = req.body; // amount adalah harga dasar sebelum voucher
    const created_by = req.user.userId; // ID admin/kasir yang login

    if (typeof amount === 'undefined' || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Jumlah pembayaran (amount) harus valid dan lebih besar dari 0.' });
    }
    
    let baseAmount = parseFloat(amount);
    let finalAmount = baseAmount;
    let discountApplied = 0;
    let voucherMessage = "Tidak ada voucher digunakan.";
    let appliedVoucherCode = null;

    // Validasi voucher jika ada
    if (voucher_code && voucher_code.trim() !== '') {
        try {
            // Panggil logika validasi voucher secara internal (mirip /api/vouchers/validate)
            // Ini lebih baik daripada melakukan HTTP request ke endpoint sendiri
            const { rows } = await db.query(
                'SELECT code, type, value, description, min_purchase, max_discount, expiry_date, is_active FROM vouchers WHERE UPPER(code) = UPPER($1) AND is_active = TRUE',
                [voucher_code]
            );

            if (rows.length > 0) {
                const voucher = rows[0];
                // Cek expiry dan min_purchase
                if (voucher.expiry_date) {
                    const today = new Date(); const expiry = new Date(voucher.expiry_date);
                    today.setHours(0,0,0,0); expiry.setHours(23,59,59,999);
                    if (today > expiry) throw new Error(`Voucher "${voucher_code}" sudah kedaluwarsa.`);
                }
                if (voucher.min_purchase && baseAmount < parseFloat(voucher.min_purchase)) {
                    throw new Error(`Voucher "${voucher_code}" memerlukan pembelian minimum Rp ${parseFloat(voucher.min_purchase).toLocaleString('id-ID')}.`);
                }

                if (voucher.type === "fixed") {
                    discountApplied = parseFloat(voucher.value);
                } else if (voucher.type === "percentage") {
                    let calcDiscount = baseAmount * parseFloat(voucher.value);
                    if (voucher.max_discount && calcDiscount > parseFloat(voucher.max_discount)) {
                        calcDiscount = parseFloat(voucher.max_discount);
                    }
                    discountApplied = calcDiscount;
                }
                finalAmount = baseAmount - discountApplied;
                if (finalAmount < 0) { finalAmount = 0; discountApplied = baseAmount; }
                
                finalAmount = Math.round(finalAmount);
                discountApplied = Math.round(discountApplied);
                voucherMessage = `${voucher.description} diterapkan.`;
                appliedVoucherCode = voucher.code;
            } else {
                return res.status(400).json({ success: false, message: `Kode voucher "${voucher_code}" tidak valid atau tidak aktif.` });
            }
        } catch (voucherError) {
            console.error("Error validasi voucher internal:", voucherError);
            return res.status(400).json({ success: false, message: voucherError.message || "Gagal memvalidasi voucher." });
        }
    }

    // Generate kode unik untuk pembayaran cash
    let uniqueCashCode = generateUniqueCode();
    // TODO: Tambahkan loop untuk memastikan keunikan kode jika diperlukan (cek ke DB)

    try {
        const expires_at = new Date(Date.now() + (24 * 60 * 60 * 1000)); // Contoh: Kode berlaku 24 jam

        const { rows } = await db.query(
            `INSERT INTO cash_payment_codes (code, amount, status, created_by, expires_at)
             VALUES ($1, $2, 'PENDING', $3, $4)
             RETURNING id, code, amount, status, expires_at`,
            [uniqueCashCode, finalAmount, created_by, expires_at]
        );
        
        // Tidak langsung membuat transaksi di sini, transaksi dibuat saat kode di-redeem
        res.status(201).json({
            success: true,
            message: 'Kode pembayaran cash berhasil dibuat. ' + voucherMessage,
            code: rows[0].code,
            amount: parseFloat(rows[0].amount), // Jumlah yang harus dibayar setelah diskon
            baseAmount: baseAmount,
            discountApplied: discountApplied,
            appliedVoucherCode: appliedVoucherCode,
            expires_at: rows[0].expires_at
        });
    } catch (error) {
        console.error('Error membuat kode pembayaran cash:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat kode pembayaran cash.' });
    }
};

// Redeem Kode Pembayaran Cash (oleh Aplikasi Electron)
exports.redeemCashCode = async (req, res) => {
    const { cash_code } = req.body;
    const electron_app_id = req.headers['x-electron-app-id'] || null; // Opsional, ID mesin Electron

    if (!cash_code) {
        return res.status(400).json({ success: false, message: 'Kode pembayaran cash harus diisi.' });
    }

    // Gunakan transaksi database untuk memastikan atomicity
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: codeRows } = await client.query(
            'SELECT id, code, amount, status, expires_at FROM cash_payment_codes WHERE code = $1 FOR UPDATE', // FOR UPDATE untuk locking
            [cash_code.toUpperCase()]
        );

        if (codeRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: `Kode pembayaran "${cash_code}" tidak ditemukan.` });
        }

        const cashCodeData = codeRows[0];

        if (cashCodeData.status === 'REDEEMED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: `Kode pembayaran "${cash_code}" sudah digunakan.` });
        }
        if (cashCodeData.status === 'EXPIRED' || (cashCodeData.expires_at && new Date() > new Date(cashCodeData.expires_at))) {
            // Update status jadi EXPIRED jika belum
            if (cashCodeData.status !== 'EXPIRED') {
                await client.query("UPDATE cash_payment_codes SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1", [cashCodeData.id]);
            }
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: `Kode pembayaran "${cash_code}" sudah kedaluwarsa.` });
        }
        if (cashCodeData.status !== 'PENDING') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: `Kode pembayaran "${cash_code}" tidak bisa digunakan (status: ${cashCodeData.status}).` });
        }

        // Buat entri transaksi baru
        // Untuk cash_code, base_amount dan final_amount adalah sama dengan amount di cash_code,
        // karena diskon voucher sudah diterapkan saat cash_code dibuat.
        const transactionData = {
            payment_method: 'CASH_CODE',
            status: 'PAID',
            base_amount: parseFloat(cashCodeData.amount), // Harga setelah diskon (jika ada) saat generate code
            discount_applied: 0, // Diskon sudah diperhitungkan di amount cash_code
            final_amount: parseFloat(cashCodeData.amount),
            cash_payment_code_id: cashCodeData.id,
            // electron_merchant_ref bisa dibuat di Electron app dan dikirim ke sini
            electron_merchant_ref: `CASH-${cashCodeData.code}-${Date.now()}`,
            paid_at: new Date()
            // customer_name, dll. bisa ditambahkan jika Electron app mengirimnya
        };

        const { rows: transactionRows } = await client.query(
            `INSERT INTO transactions (electron_merchant_ref, payment_method, status, base_amount, discount_applied, final_amount, cash_payment_code_id, paid_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, final_amount`,
            [
                transactionData.electron_merchant_ref, transactionData.payment_method, transactionData.status,
                transactionData.base_amount, transactionData.discount_applied, transactionData.final_amount,
                transactionData.cash_payment_code_id, transactionData.paid_at
            ]
        );
        
        const newTransactionId = transactionRows[0].id;

        // Update status kode cash menjadi REDEEMED dan simpan transaction_id
        await client.query(
            "UPDATE cash_payment_codes SET status = 'REDEEMED', redeemed_at = NOW(), electron_app_id = $1, transaction_id = $2, updated_at = NOW() WHERE id = $3",
            [electron_app_id, newTransactionId, cashCodeData.id]
        );

        await client.query('COMMIT');
        res.json({
            success: true,
            message: `Kode pembayaran "${cash_code}" berhasil ditebus.`,
            transactionId: newTransactionId,
            amountPaid: parseFloat(cashCodeData.amount)
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error saat redeem kode pembayaran cash:', error);
        res.status(500).json({ success: false, message: 'Gagal memproses kode pembayaran cash.' });
    } finally {
        client.release();
    }
};