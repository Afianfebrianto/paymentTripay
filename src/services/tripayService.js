// src/services/tripayService.js

const axios = require('axios');
const crypto = require('crypto');
const config = require('../utils/config'); // Impor konfigurasi

/**
 * Membuat signature untuk request ke TriPay.
 * @param {string} merchantRef - Referensi unik dari merchant.
 * @param {number} amount - Jumlah pembayaran.
 * @returns {string} Signature HMAC-SHA256.
 */
function generateRequestSignature(merchantRef, amount) {
  const { merchantCode, privateKey } = config.tripay;
  // PASTIKAN string yang di-sign dan urutannya sesuai dokumentasi TriPay!
  // Contoh umum: merchantCode + merchantRef + amount
  const dataToSign = merchantCode + merchantRef + amount;
  return crypto.createHmac('sha256', privateKey)
               .update(dataToSign)
               .digest('hex');
}

/**
 * Membuat transaksi baru di TriPay.
 * @param {object} paymentData - Data untuk transaksi (method, amount, customer_name, dll.).
 * Contoh: { method: 'QRIS', amount: 10000, customer_name: 'Budi', ... }
 * @returns {Promise<object>} Respons dari API TriPay.
 */
async function createTransaction(paymentData) {
  const { apiKey, merchantCode } = config.tripay;
  const tripayBaseUrl = config.tripay.getCurrentBaseUrl();

  const merchantRef = `INV-${Date.now()}`; // Buat referensi unik
  const signature = generateRequestSignature(merchantRef, paymentData.amount);

  const payload = {
    method: paymentData.method,
    merchant_ref: merchantRef,
    amount: paymentData.amount,
    customer_name: paymentData.customer_name,
    customer_email: paymentData.customer_email,
    customer_phone: paymentData.customer_phone || '',
    order_items: paymentData.order_items || [ // Pastikan struktur order_items sesuai
      {
        // sku: 'ITEM01',
        name: paymentData.itemName || 'Pembayaran Sesi Photobooth',
        price: paymentData.amount,
        quantity: 1,
      }
    ],
    // callback_url: `${config.app.yourDomain}/electron-tripay-callback`, // Tidak dipakai jika polling
    // return_url: config.tripay.returnUrl || `${config.app.yourDomain}/payment-success`, // Jika perlu
    expired_time: Math.floor((Date.now() / 1000) + (1 * 60 * 60)), // Contoh: 1 jam kedaluwarsa
    signature: signature
  };

  // Tambahkan voucher jika ada
  if (paymentData.voucher_code) {
    // Logika untuk menerapkan voucher bisa di sini atau sebelum memanggil createTransaction
    // Misalnya, amount di paymentData sudah merupakan amount setelah diskon
    console.log(`Transaksi dengan voucher: ${paymentData.voucher_code}`);
  }

  try {
    console.log('Mengirim permintaan createTransaction ke TriPay:', JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${tripayBaseUrl}/transaction/create`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Respons createTransaction dari TriPay:', response.data);
    return response.data; // Berisi { success: true, data: { ... } } atau { success: false, message: '...' }
  } catch (error) {
    console.error('Error membuat transaksi TriPay:', error.response ? error.response.data : error.message);
    // Kembalikan objek error yang konsisten
    const errorResponse = error.response ? error.response.data : { success: false, message: error.message };
    if (!errorResponse.message && error.isAxiosError) {
        errorResponse.message = 'Network error or TriPay API unreachable.';
    }
    return { success: false, ...errorResponse };
  }
}

/**
 * Mengecek status transaksi di TriPay.
 * @param {string} reference - Referensi transaksi dari TriPay (BUKAN merchant_ref).
 * @returns {Promise<object>} Respons detail transaksi dari TriPay.
 */
async function checkTransactionStatus(reference) {
  const { apiKey } = config.tripay;
  const tripayBaseUrl = config.tripay.getCurrentBaseUrl();

  // Pastikan endpoint untuk cek status/detail transaksi sudah benar sesuai dokumentasi TriPay
  // Biasanya menggunakan GET request dengan parameter reference
  const params = { reference };

  try {
    console.log(`Mengecek status transaksi TriPay untuk reference: ${reference}`);
    const response = await axios.get(
      `${tripayBaseUrl}/transaction/detail`, // ATAU endpoint lain yang sesuai
      {
        params: params,
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );
    console.log('Respons checkTransactionStatus dari TriPay:', response.data);
    return response.data; // Berisi { success: true, data: { status: 'PAID', ... } }
  } catch (error) {
    console.error('Error mengecek status transaksi TriPay:', error.response ? error.response.data : error.message);
    const errorResponse = error.response ? error.response.data : { success: false, message: error.message };
    if (!errorResponse.message && error.isAxiosError) {
        errorResponse.message = 'Network error or TriPay API unreachable during status check.';
    }
    return { success: false, ...errorResponse };
  }
}

module.exports = {
  createTransaction,
  checkTransactionStatus,
  generateRequestSignature // Mungkin berguna jika perlu di tempat lain
};