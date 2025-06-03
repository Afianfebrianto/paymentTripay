// backend-api/src/controllers/transactionController.js
const db = require('../db');

// Mendapatkan Semua Transaksi (untuk Web Admin)
exports.getAllTransactions = async (req, res) => {
    // Tambahkan paginasi dan filter jika perlu
    try {
        const { rows } = await db.query(
            `SELECT t.*, v.code as voucher_code_value, cpc.code as cash_code_value
             FROM transactions t
             LEFT JOIN vouchers v ON t.voucher_id = v.id
             LEFT JOIN cash_payment_codes cpc ON t.cash_payment_code_id = cpc.id
             ORDER BY t.created_at DESC`
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error mendapatkan semua transaksi:', error);
        res.status(500).json({ success: false, message: 'Gagal mendapatkan data transaksi.' });
    }
};

// Fungsi untuk mencatat transaksi QRIS (dipanggil oleh callback TriPay atau setelah polling sukses)
// Ini contoh, logika detailnya akan bergantung pada data dari TriPay
exports.recordQrisTransaction = async (tripayData, electronRef = null) => {
    // tripayData adalah objek yang berisi detail dari TriPay setelah pembayaran QRIS sukses
    // Misalnya: { reference, merchant_ref, amount, status, paid_at, customer_name, ... }
    // Kita asumsikan diskon dan voucher sudah dihandle saat pembuatan transaksi di TriPay
    
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Cek apakah transaksi dengan tripay_reference ini sudah ada untuk menghindari duplikasi
        const existingTx = await client.query('SELECT id FROM transactions WHERE tripay_reference = $1', [tripayData.reference]);
        if (existingTx.rows.length > 0) {
            console.log(`Transaksi dengan TriPay Ref ${tripayData.reference} sudah ada. ID: ${existingTx.rows[0].id}`);
            await client.query('ROLLBACK'); // Atau bisa juga update jika perlu
            return { success: true, message: "Transaksi sudah tercatat sebelumnya.", transactionId: existingTx.rows[0].id };
        }

        // Asumsi: base_amount dan discount_applied perlu dihitung atau diambil dari data pembuatan awal
        // Untuk QRIS, final_amount adalah amount dari TriPay
        // Jika voucher dipakai, kita perlu menyimpan voucher_id
        // Ini perlu logika lebih lanjut untuk mengambil detail voucher yang mungkin dipakai saat create QRIS
        
        const finalAmount = parseFloat(tripayData.amount);
        // Placeholder untuk base_amount dan discount, idealnya ini diketahui saat QRIS dibuat
        let baseAmount = finalAmount; 
        let discountApplied = 0;
        let voucherIdUsed = null;

        // Jika ada info voucher yang dipakai saat QRIS dibuat, kita bisa query ke DB
        // if (tripayData.applied_voucher_code) {
        //     const voucherRes = await client.query('SELECT id FROM vouchers WHERE code = $1', [tripayData.applied_voucher_code]);
        //     if (voucherRes.rows.length > 0) voucherIdUsed = voucherRes.rows[0].id;
        //     // Hitung ulang baseAmount jika perlu, atau simpan saja apa adanya
        // }


        const { rows } = await client.query(
            `INSERT INTO transactions (electron_merchant_ref, tripay_reference, payment_method, status, 
                                      base_amount, discount_applied, final_amount, voucher_id, 
                                      customer_name, customer_email, customer_phone, paid_at, transaction_notes)
             VALUES ($1, $2, 'QRIS', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id`,
            [
                electronRef || tripayData.merchant_ref, // merchant_ref dari TriPay bisa jadi electron_merchant_ref
                tripayData.reference,
                tripayData.status.toUpperCase(), // PAID, FAILED, EXPIRED
                baseAmount,
                discountApplied,
                finalAmount,
                voucherIdUsed,
                tripayData.customer_name,
                tripayData.customer_email,
                tripayData.customer_phone,
                tripayData.paid_at ? new Date(tripayData.paid_at * 1000) : new Date(), // Konversi Unix timestamp ke Date
                tripayData.note || null
            ]
        );
        await client.query('COMMIT');
        console.log(`Transaksi QRIS berhasil dicatat. ID: ${rows[0].id}, TriPay Ref: ${tripayData.reference}`);
        return { success: true, message: "Transaksi QRIS berhasil dicatat.", transactionId: rows[0].id };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error mencatat transaksi QRIS:', error);
        throw error; // Lemparkan error agar pemanggil tahu
    } finally {
        client.release();
    }
};

// Endpoint untuk callback dari TriPay (SANGAT PENTING DIAMANKAN)
exports.tripayCallbackHandler = async (req, res) => {
    const callbackData = req.body;
    console.log("Menerima callback dari TriPay:", JSON.stringify(callbackData, null, 2));

    // 1. Validasi Signature dari TriPay (SANGAT PENTING!)
    //    const privateKey = process.env.TRIPAY_PRIVATE_KEY;
    //    const signature = crypto.createHmac('sha256', privateKey)
    //                          .update(JSON.stringify(callbackData)) // Atau format lain sesuai dok TriPay
    //                          .digest('hex');
    //    if (signature !== req.headers['x-callback-signature']) { // Nama header bisa berbeda
    //        console.error("Callback TriPay: Signature tidak valid!");
    //        return res.status(400).json({ success: false, message: "Invalid signature" });
    //    }
    //    Untuk sekarang, kita skip validasi signature demi kesederhanaan, TAPI JANGAN LAKUKAN INI DI PRODUKSI.

    // 2. Proses data callback
    if (callbackData.status && (callbackData.status.toUpperCase() === 'PAID' || callbackData.status.toUpperCase() === 'SETTLED')) {
        try {
            // Panggil fungsi untuk mencatat/mengupdate transaksi berdasarkan callbackData
            await exports.recordQrisTransaction(callbackData); // Electron ref mungkin tidak ada di sini
            res.json({ success: true }); // Kirim respons OK ke TriPay
        } catch (error) {
            console.error("Error memproses callback TriPay PAID:", error);
            // Jangan kirim error detail ke TriPay, cukup status 500
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    } else if (callbackData.status && (callbackData.status.toUpperCase() === 'EXPIRED' || callbackData.status.toUpperCase() === 'FAILED')) {
        // Handle status gagal atau kedaluwarsa jika perlu update di DB
        // Misalnya, update status transaksi yang sudah ada menjadi FAILED/EXPIRED
        console.log(`Callback TriPay: Status ${callbackData.status} untuk ref ${callbackData.reference}`);
        // TODO: Logika update status transaksi yang sudah ada
        res.json({ success: true }); // Tetap kirim OK ke TriPay
    } else {
        console.warn("Callback TriPay: Status tidak dikenal atau tidak relevan:", callbackData.status);
        res.json({ success: true }); // Tetap kirim OK
    }
};