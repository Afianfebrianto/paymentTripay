// src/utils/config.js

// PENTING: JANGAN COMMIT FILE INI DENGAN KUNCI ASLI JIKA REPOSITORY-MU PUBLIK
// Untuk pengembangan, kamu bisa isi langsung. Untuk produksi, pertimbangkan cara yang lebih aman.

const config = {
  tripay: {
    apiKey: 'DEV-FlzZXhehIyUQjrd5oW20uWUec2K3q7Ic6hHKxeny',
    privateKey: '8rwxQ-rjswz-bcVVC-fw2h1-pC4Nt',
    merchantCode: 'T40958',
    // Ganti ke 'production' jika sudah live
    mode: 'sandbox', // 'sandbox' atau 'production'
    // URL API TriPay (pastikan sesuai dokumentasi terbaru)
    baseUrl: {
      sandbox: 'https://tripay.co.id/api-sandbox',
      production: 'https://tripay.co.id/api'
    },
    // Callback URL tidak terlalu relevan untuk polling di desktop,
    // tapi return URL mungkin berguna jika membuka halaman TriPay di browser eksternal
    // returnUrl: 'myapp://payment-return' // Contoh jika menggunakan custom protocol
  },
  dslrbooth: {
    // Sesuaikan dengan path instalasi dslrBooth di komputermu
    executablePath: 'C:\\Program Files\\dslrBooth\\dslrBooth.exe',
    // Atau jika di tempat lain: 'D:\\dslrBooth\\dslrBooth.exe'
  },
  app: {
    // URL domain aplikasi (jika suatu saat kamu perlu, misalnya untuk return_url yang bisa diakses)
    // Untuk sekarang, ini hanya placeholder jika pembayaran membuka browser eksternal
    yourDomain: 'http://localhost:3000' // Ini adalah contoh jika ada server lokal, sesuaikan
  }
};

// Fungsi untuk mendapatkan URL API berdasarkan mode
config.tripay.getCurrentBaseUrl = function() {
  return this.baseUrl[this.mode] || this.baseUrl.sandbox;
};

module.exports = config;