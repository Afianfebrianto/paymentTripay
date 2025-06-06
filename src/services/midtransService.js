// Payment Apps/src/services/midtransService.js
const midtransClient = require('midtrans-client');

/**
 * Membuat transaksi QRIS langsung ke API Midtrans.
 * @param {string} serverKey - Server Key Midtrans Anda.
 * @param {boolean} isProduction - 'true' untuk produksi, 'false' untuk sandbox.
 * @param {object} payload - Data transaksi dari renderer (amount, customer_name, dll.).
 * @returns {Promise<object>} Respons yang sudah diformat untuk renderer.
 */
async function createQrisTransaction(serverKey, isProduction, payload) {
    console.log("MIDTRANS_SERVICE (Electron): Membuat transaksi QRIS...");
    try {
        const coreApi = new midtransClient.CoreApi({
            isProduction: isProduction,
            serverKey: serverKey,
        });

        const transactionPayload = {
            payment_type: 'qris',
            transaction_details: {
                order_id: payload.paymentContext?.electron_internal_ref || `PHOTOBTH-QRIS-${Date.now()}`,
                gross_amount: payload.amount // Jumlah final setelah diskon
            },
            customer_details: {
                first_name: payload.customer_name || "Pelanggan",
                email: payload.customer_email || "customer@photobooth.com",
                phone: payload.customer_phone || "08123456789"
            },
            item_details: payload.order_items 
        };

        console.log("MIDTRANS_SERVICE (Electron): Mengirim payload ke Midtrans:", JSON.stringify(transactionPayload, null, 2));
        const response = await coreApi.charge(transactionPayload);
        console.log("MIDTRANS_SERVICE (Electron): Respons dari Midtrans charge:", response);

        const qrCodeUrl = response.actions?.find(action => action.name === 'generate-qr-code')?.url;
        
        if (!qrCodeUrl) {
            throw new Error("Respons Midtrans tidak mengandung URL QR code.");
        }

        return {
            success: true,
            message: "Transaksi Midtrans berhasil dibuat.",
            data: {
                reference: response.transaction_id, // ID Transaksi Midtrans
                order_id: response.order_id, // Order ID yang kita kirim
                payment_name: `QRIS (${response.acquirer})`,
                amount: parseFloat(response.gross_amount),
                qr_url: qrCodeUrl,
                status: response.transaction_status.toUpperCase(),
                expired_time: new Date(response.expiry_time).getTime() / 1000
            }
        };

    } catch (error) {
        console.error("MIDTRANS_SERVICE (Electron): Error saat membuat charge Midtrans:", error);
        let errorMessage = "Terjadi kesalahan yang tidak diketahui.";
        if (error.ApiResponse) {
            // Respons error dari Midtrans biasanya memiliki status_message
            errorMessage = error.ApiResponse.status_message || JSON.stringify(error.ApiResponse);
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        return { success: false, message: errorMessage, data: error.ApiResponse || null };
    }
}

/**
 * Mengecek status transaksi di Midtrans.
 * @param {string} serverKey - Server Key Midtrans Anda.
 * @param {boolean} isProduction - 'true' untuk produksi, 'false' untuk sandbox.
 * @param {string} transactionIdOrOrderId - ID Transaksi atau Order ID dari Midtrans.
 * @returns {Promise<object>} Respons status yang sudah diformat.
 */
async function checkTransactionStatus(serverKey, isProduction, transactionIdOrOrderId) {
    console.log(`MIDTRANS_SERVICE (Electron): Mengecek status untuk ID: ${transactionIdOrOrderId}`);
    try {
        const coreApi = new midtransClient.CoreApi({
            isProduction: isProduction,
            serverKey: serverKey,
        });

        const statusResponse = await coreApi.transaction.status(transactionIdOrOrderId);
        console.log("MIDTRANS_SERVICE (Electron): Respons status dari Midtrans:", statusResponse);
        
        let finalStatus = statusResponse.transaction_status.toUpperCase();
        if (finalStatus === 'SETTLEMENT' || finalStatus === 'CAPTURE') {
            finalStatus = 'PAID';
        }

        return {
            success: true,
            data: {
                reference: statusResponse.transaction_id,
                order_id: statusResponse.order_id,
                status: finalStatus,
                amount: parseFloat(statusResponse.gross_amount),
                paid_at: statusResponse.settlement_time ? new Date(statusResponse.settlement_time).getTime() / 1000 : (finalStatus === 'PAID' ? Date.now() / 1000 : null),
                customer_name: statusResponse.customer_details?.first_name,
                customer_email: statusResponse.customer_details?.email,
                customer_phone: statusResponse.customer_details?.phone,
                merchant_ref: statusResponse.order_id
            }
        };
    } catch (error) {
        console.error("MIDTRANS_SERVICE (Electron): Error saat cek status Midtrans:", error);
        const errorMessage = error.ApiResponse ? error.ApiResponse.status_message : error.message;
        return { success: false, message: errorMessage, data: error.ApiResponse || null };
    }
}

module.exports = {
    createQrisTransaction,
    checkTransactionStatus
};
