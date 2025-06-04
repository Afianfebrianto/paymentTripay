// backend-api/src/controllers/cashCodeController.js
const db = require('../db');

function generateUniqueCode(length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return `CASH-${result}`;
}

exports.generateCashCode = async (req, res) => {
    let { amount, voucher_code } = req.body; 
    const created_by = req.user.userId;

    console.log("CASH_CODE_CONTROLLER: generateCashCode dipanggil. Data:", req.body, "User ID:", created_by);

    const fixedPriceFromServer = 30000; // HARGA FIX SESI DITENTUKAN DI SINI (SERVER-SIDE)
    
    // baseAmountForRecord akan selalu harga asli sebelum diskon
    const baseAmountForRecord = fixedPriceFromServer; 
    let finalAmountForCode = baseAmountForRecord; // Amount yang akan dibayar, defaultnya sama dengan base
    let discountAppliedRecord = 0;
    let voucherMessage = "Tidak ada voucher digunakan.";
    let appliedVoucherId = null;
    let voucherDescriptionForMessage = "";

    // Validasi voucher jika ada
    if (voucher_code && voucher_code.trim() !== '') {
        console.log(`CASH_CODE_CONTROLLER: Memvalidasi voucher: ${voucher_code} untuk baseAmount: ${baseAmountForRecord}`);
        try {
            const { rows } = await db.query(
                'SELECT id, code, type, value, description, min_purchase, max_discount, expiry_date, is_active FROM vouchers WHERE UPPER(code) = UPPER($1) AND is_active = TRUE',
                [voucher_code]
            );

            if (rows.length > 0) {
                const voucher = rows[0];
                console.log("CASH_CODE_CONTROLLER: Voucher ditemukan:", voucher);
                
                if (voucher.expiry_date) {
                    const today = new Date(); const expiry = new Date(voucher.expiry_date);
                    today.setHours(0,0,0,0); expiry.setHours(23,59,59,999);
                    if (today > expiry) throw new Error(`Voucher "${voucher_code}" sudah kedaluwarsa.`);
                }
                // Gunakan baseAmountForRecord untuk cek min_purchase
                if (voucher.min_purchase && baseAmountForRecord < parseFloat(voucher.min_purchase)) {
                    throw new Error(`Voucher "${voucher_code}" memerlukan pembelian minimum Rp ${parseFloat(voucher.min_purchase).toLocaleString('id-ID')}.`);
                }

                if (voucher.type === "fixed") {
                    discountAppliedRecord = parseFloat(voucher.value);
                } else if (voucher.type === "percentage") {
                    let calcDiscount = baseAmountForRecord * parseFloat(voucher.value);
                    if (voucher.max_discount && calcDiscount > parseFloat(voucher.max_discount)) {
                        calcDiscount = parseFloat(voucher.max_discount);
                    }
                    discountAppliedRecord = calcDiscount;
                }
                finalAmountForCode = baseAmountForRecord - discountAppliedRecord;
                if (finalAmountForCode < 0) { finalAmountForCode = 0; discountAppliedRecord = baseAmountForRecord; }
                
                finalAmountForCode = Math.round(finalAmountForCode);
                discountAppliedRecord = Math.round(discountAppliedRecord);
                voucherDescriptionForMessage = voucher.description || `Diskon voucher ${voucher.code}`;
                voucherMessage = `${voucherDescriptionForMessage} diterapkan.`;
                appliedVoucherId = voucher.id;
                console.log(`CASH_CODE_CONTROLLER: Voucher valid. Diskon: ${discountAppliedRecord}, Final: ${finalAmountForCode}`);
            } else {
                console.log(`CASH_CODE_CONTROLLER: Voucher ${voucher_code} tidak valid atau tidak aktif.`);
                return res.status(400).json({ success: false, message: `Kode voucher "${voucher_code}" tidak valid atau tidak aktif.` });
            }
        } catch (voucherError) {
            console.error("CASH_CODE_CONTROLLER: Error validasi voucher internal:", voucherError);
            return res.status(400).json({ success: false, message: voucherError.message || "Gagal memvalidasi voucher." });
        }
    }

    let uniqueCashCode = generateUniqueCode();
    // TODO: Implementasi loop cek keunikan kode jika diperlukan.

    try {
        const expires_at = new Date(Date.now() + (24 * 60 * 60 * 1000)); // Kode berlaku 24 jam

        // Pastikan semua kolom yang di-INSERT ada di tabel cash_payment_codes
        const queryText = `
            INSERT INTO cash_payment_codes 
            (code, amount, status, created_by, expires_at, base_amount, discount_applied, voucher_id)
            VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7)
            RETURNING id, code, amount, status, expires_at, base_amount, discount_applied`;
        
        const queryValues = [
            uniqueCashCode, 
            finalAmountForCode, // Amount yang harus dibayar (setelah diskon)
            created_by, 
            expires_at,
            baseAmountForRecord, // Harga asli sebelum diskon
            discountAppliedRecord, // Jumlah diskon
            appliedVoucherId // ID voucher yang digunakan
        ];

        console.log("CASH_CODE_CONTROLLER: Query INSERT cash_code:", queryText);
        console.log("CASH_CODE_CONTROLLER: Values INSERT cash_code:", queryValues);

        const { rows } = await db.query(queryText, queryValues);
        
        console.log("CASH_CODE_CONTROLLER: Kode cash berhasil dibuat di DB:", rows[0]);
        res.status(201).json({
            success: true,
            message: 'Kode pembayaran cash berhasil dibuat. ' + voucherMessage,
            code: rows[0].code,
            amount: parseFloat(rows[0].amount), 
            baseAmount: parseFloat(rows[0].base_amount), 
            discountApplied: parseFloat(rows[0].discount_applied),
            appliedVoucherCode: appliedVoucherId ? voucher_code : null,
            voucherMessageOnSuccess: appliedVoucherId ? voucherDescriptionForMessage : null,
            expires_at: rows[0].expires_at
        });
    } catch (error) {
        console.error('CASH_CODE_CONTROLLER: Error membuat kode pembayaran cash di DB:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat kode pembayaran cash karena kesalahan server.' });
    }
};

exports.redeemCashCode = async (req, res) => {
    const { cash_code } = req.body;
    const electron_app_id = req.headers['x-electron-app-id'] || null;

    if (!cash_code) {
        return res.status(400).json({ success: false, message: 'Kode pembayaran cash harus diisi.' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: codeRows } = await client.query(
            'SELECT id, code, amount, status, expires_at, base_amount, discount_applied, voucher_id FROM cash_payment_codes WHERE UPPER(code) = UPPER($1) FOR UPDATE', 
            [cash_code]
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

        const transactionData = {
            payment_method: 'CASH_CODE',
            status: 'PAID',
            base_amount: parseFloat(cashCodeData.base_amount || cashCodeData.amount), 
            discount_applied: parseFloat(cashCodeData.discount_applied || 0),
            final_amount: parseFloat(cashCodeData.amount), 
            cash_payment_code_id: cashCodeData.id,
            voucher_id: cashCodeData.voucher_id, 
            electron_merchant_ref: `CASH-${cashCodeData.code}-${Date.now()}`,
            paid_at: new Date()
        };

        const { rows: transactionRows } = await client.query(
            `INSERT INTO transactions (electron_merchant_ref, payment_method, status, base_amount, discount_applied, final_amount, cash_payment_code_id, voucher_id, paid_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, final_amount`,
            [
                transactionData.electron_merchant_ref, transactionData.payment_method, transactionData.status,
                transactionData.base_amount, transactionData.discount_applied, transactionData.final_amount,
                transactionData.cash_payment_code_id, transactionData.voucher_id, transactionData.paid_at
            ]
        );
        
        const newTransactionId = transactionRows[0].id;

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
        console.error('CASH_CODE_CONTROLLER: Error saat redeem kode pembayaran cash:', error);
        res.status(500).json({ success: false, message: 'Gagal memproses kode pembayaran cash.' });
    } finally {
        client.release();
    }
};
