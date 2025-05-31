// src/utils/vouchers.js

const vouchers = {
  // Key adalah kode voucher (buat case-insensitive saat pengecekan)
  // Fokus pada voucher potongan Rp 10.000 dengan kode alfanumerik
  "HEMAT10K": {
    type: "fixed",
    value: 10000,
    description: "Diskon Spesial Rp 10.000",
    minPurchase: 25000, // Opsional: Pembelian minimum agar voucher berlaku
  },
  "FOTOXYZ123": { // Contoh kode alfanumerik
    type: "fixed",
    value: 10000,
    description: "Anda mendapat potongan Rp 10.000!",
  },
  "SUPERPHOTOA1": { // Contoh kode alfanumerik lain
    type: "fixed",
    value: 10000,
    description: "Potongan Rp 10.000 untuk sesi ini.",
  },
  "VOUCHERKADALUWARSA": { // Contoh untuk pengujian
    type: "fixed",
    value: 5000,
    description: "Voucher Tes Kedaluwarsa",
    expiryDate: "2024-01-01" // Pastikan tanggal ini sudah lewat untuk tes
  }
};

/**
 * Fungsi untuk memvalidasi voucher dan menghitung diskon.
 * @param {string} code - Kode voucher yang dimasukkan pengguna.
 * @param {number} baseAmount - Harga dasar sebelum diskon.
 * @returns {object} { isValid: bool, finalAmount: number, discountApplied: number, message: string }
 */
function applyVoucher(code, baseAmount) {
  if (!code || code.trim() === '') { // Juga cek string kosong
    return { isValid: false, finalAmount: baseAmount, discountApplied: 0, message: "" };
  }

  const voucher = vouchers[code.toUpperCase()]; // Cari voucher (case-insensitive)

  if (!voucher) {
    return { isValid: false, finalAmount: baseAmount, discountApplied: 0, message: `Kode voucher "${code}" tidak ditemukan atau tidak valid.` };
  }

  // Cek tanggal kedaluwarsa (jika ada)
  if (voucher.expiryDate) {
    const today = new Date();
    const expiry = new Date(voucher.expiryDate);
    // Set waktu ke awal hari untuk 'today' dan akhir hari untuk 'expiry' untuk perbandingan yang adil
    today.setHours(0, 0, 0, 0);
    expiry.setHours(23, 59, 59, 999);

    if (today > expiry) {
      return { isValid: false, finalAmount: baseAmount, discountApplied: 0, message: `Kode voucher "${code}" sudah kedaluwarsa.` };
    }
  }

  // Cek pembelian minimum (jika ada)
  if (voucher.minPurchase && baseAmount < voucher.minPurchase) {
    return { isValid: false, finalAmount: baseAmount, discountApplied: 0, message: `Voucher "${code}" memerlukan pembelian minimum Rp ${voucher.minPurchase.toLocaleString('id-ID')}.` };
  }

  let discountApplied = 0;
  let finalAmount = baseAmount;

  if (voucher.type === "fixed") {
    discountApplied = voucher.value;
    finalAmount = baseAmount - discountApplied;
  } else if (voucher.type === "percentage") {
    discountApplied = baseAmount * voucher.value;
    if (voucher.maxDiscount && discountApplied > voucher.maxDiscount) {
      discountApplied = voucher.maxDiscount;
    }
    finalAmount = baseAmount - discountApplied;
  } else {
     return { isValid: false, finalAmount: baseAmount, discountApplied: 0, message: `Tipe voucher "${code}" tidak dikenal.` };
  }

  if (finalAmount < 0) {
    finalAmount = 0;
    discountApplied = baseAmount;
  }

  return {
    isValid: true,
    finalAmount: Math.round(finalAmount),
    discountApplied: Math.round(discountApplied),
    message: `${voucher.description} diterapkan.`
  };
}

module.exports = { applyVoucher, vouchers };