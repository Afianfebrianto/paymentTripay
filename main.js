// main.js
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

// Impor services dan config kamu
// Pastikan path ini sesuai dengan struktur folder proyekmu
const tripayService = require('./src/services/tripayService');
const dslrboothService = require('./src/services/dslrboothService');
// const config = require('./src/utils/config'); // Config mungkin tidak perlu langsung di main.js jika services sudah mengimpornya

// Variabel global untuk menyimpan instance jendela utama
// Ini berguna agar bisa diakses oleh fungsi lain, misalnya untuk mengirim data ke renderer
let mainWindowInstance;

function createWindow() {
  // Buat jendela browser.
  const mainWindow = new BrowserWindow({
    width: 800, // Lebar awal jendela
    height: 700, // Tinggi awal jendela
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Path ke preload script
      contextIsolation: true, // Direkomendasikan untuk keamanan
      nodeIntegration: false, // Matikan nodeIntegration di renderer demi keamanan
      devTools: !app.isPackaged, // Aktifkan DevTools hanya jika tidak di-package (mode development)
    }
  });

  // Muat index.html ke dalam jendela.
  mainWindow.loadFile('index.html');

  // Buka DevTools secara otomatis jika dalam mode development (opsional)
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // Simpan instance jendela ke variabel global
  mainWindowInstance = mainWindow;
  return mainWindow; // Kembalikan instance jendela jika diperlukan
}

// --- App Lifecycle Events ---

// Method ini akan dipanggil ketika Electron selesai inisialisasi
// dan siap untuk membuat jendela browser.
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // Di macOS, biasa untuk membuat ulang jendela di aplikasi ketika
    // ikon dock diklik dan tidak ada jendela lain yang terbuka.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Keluar ketika semua jendela ditutup, kecuali di macOS.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

// Handler untuk 'tripay:createPayment' dari renderer process
ipcMain.handle('tripay:createPayment', async (event, paymentDataFromRenderer) => {
  if (!mainWindowInstance) {
    console.error('mainWindowInstance tidak tersedia saat menangani tripay:createPayment');
    return { success: false, message: 'Kesalahan internal: Jendela utama tidak siap.' };
  }

  console.log('Menerima permintaan createPayment dari renderer:', paymentDataFromRenderer);
  const { base_amount, method, customer_name, customer_email, customer_phone, itemName, voucher_code } = paymentDataFromRenderer;
  let finalAmount = base_amount;
  let voucherAppliedMessage = '';

  // --- LOGIKA VOUCHER SEDERHANA (Contoh) ---
  if (voucher_code) {
    console.log(`Memproses voucher: ${voucher_code}`);
    // Ganti ini dengan validasi voucher yang lebih baik (lokal atau API eksternal)
    if (voucher_code.toUpperCase() === 'DISKON10K') {
      finalAmount = base_amount - 10000;
      if (finalAmount < 0) finalAmount = 0;
      voucherAppliedMessage = 'Voucher DISKON10K diterapkan.';
      console.log(`Voucher DISKON10K valid. Harga setelah diskon: ${finalAmount}`);
    } else if (voucher_code.toUpperCase() === 'DISKON50PERSEN') {
      finalAmount = base_amount * 0.5;
      voucherAppliedMessage = 'Voucher DISKON50PERSEN diterapkan.';
      console.log(`Voucher DISKON50PERSEN valid. Harga setelah diskon: ${finalAmount}`);
    } else {
      console.log('Voucher tidak valid.');
      // Jika voucher salah, kembalikan error. Atau bisa juga lanjut dengan harga normal.
      return { success: false, message: `Kode voucher "${voucher_code}" tidak valid.` };
    }
  }
  // --- AKHIR LOGIKA VOUCHER ---

  // Kasus jika harga menjadi 0 atau kurang setelah diskon (misalnya voucher diskon penuh)
  if (finalAmount <= 0 && base_amount > 0) {
    console.log('Harga final adalah Rp 0 setelah diskon. Anggap pembayaran LUNAS secara virtual.');
    const virtualReference = `VIRTUAL-${Date.now()}`;
    const virtualPaymentData = {
      reference: virtualReference,
      merchant_ref: virtualReference,
      status: 'PAID',
      amount: 0,
      payment_name: voucherAppliedMessage || 'Voucher Diskon Penuh',
      customer_name: customer_name,
      // Tambahkan field lain yang mungkin diharapkan renderer
    };

    // Kirim status "PAID" langsung ke renderer
    mainWindowInstance.webContents.send('payment:statusUpdate', {
      status: 'PAID',
      data: virtualPaymentData,
      reference: virtualReference,
      message: voucherAppliedMessage || 'Pembayaran Lunas dengan Voucher (Harga Rp 0)'
    });

    // Langsung picu dslrbooth
    try {
      const launchMsg = await dslrboothService.launchDslrBooth();
      console.log(launchMsg);
      mainWindowInstance.webContents.send('dslrbooth:statusUpdate', { status: 'launched', message: launchMsg });
    } catch (dslrError) {
      console.error('Gagal membuka dslrBooth (setelah pembayaran virtual Rp 0):', dslrError);
      mainWindowInstance.webContents.send('dslrbooth:statusUpdate', { status: 'error', message: dslrError.toString() });
    }
    // Kembalikan data "sukses" virtual ke pemanggil IPC
    return { success: true, data: virtualPaymentData };
  }

  // Persiapkan payload untuk TriPay dengan harga final
  const tripayPayload = {
    amount: finalAmount,
    method: method,
    customer_name: customer_name,
    customer_email: customer_email,
    customer_phone: customer_phone,
    itemName: itemName,
    // order_items bisa lebih detail jika diperlukan
    order_items: [{
        name: itemName + (voucherAppliedMessage ? ` (${voucherAppliedMessage})` : ''),
        price: finalAmount,
        quantity: 1,
    }]
  };

  try {
    const result = await tripayService.createTransaction(tripayPayload);
    if (result.success && result.data && result.data.reference) {
      console.log('Transaksi TriPay berhasil dibuat, memulai polling untuk reference:', result.data.reference);
      // Jika sukses membuat transaksi, mulai polling statusnya
      startPaymentPolling(mainWindowInstance, result.data.reference);
    } else {
      console.warn('Gagal membuat transaksi TriPay atau data referensi tidak ada:', result.message);
    }
    return result; // Kembalikan hasil ke renderer
  } catch (error) {
    console.error('Error di main process saat memanggil tripayService.createTransaction:', error);
    return { success: false, message: 'Terjadi kesalahan internal server: ' + error.message };
  }
});

// (Opsional) Handler untuk membuka link eksternal jika diperlukan oleh metode pembayaran tertentu
ipcMain.on('app:openExternalLink', (event, url) => {
  try {
    // Pastikan URL valid sebelum dibuka untuk keamanan
    const parsedUrl = new URL(url);
    if (['http:', 'https:'].includes(parsedUrl.protocol)) {
      shell.openExternal(url);
    } else {
      console.warn('Upaya membuka URL dengan protokol tidak valid:', url);
    }
  } catch (e) {
    console.error('Gagal membuka link eksternal, URL tidak valid atau error:', url, e);
  }
});


// --- Fungsi Polling Status Pembayaran ---
async function startPaymentPolling(browserWindow, transactionReference) {
  if (!browserWindow || browserWindow.isDestroyed()) {
    console.warn(`Polling dihentikan untuk ${transactionReference} karena jendela tidak valid atau sudah dihancurkan.`);
    return;
  }

  console.log(`Memulai polling untuk transaksi: ${transactionReference}`);
  let attempts = 0;
  const maxAttempts = 120; // Contoh: Polling hingga 10 menit (120 * 5 detik)
  const interval = 5000; // Interval polling 5 detik

  // Fungsi rekursif untuk polling
  const poll = async () => {
    if (browserWindow.isDestroyed()) { // Cek lagi sebelum setiap attempt
        console.warn(`Polling dihentikan (jendela dihancurkan) untuk ${transactionReference}.`);
        return;
    }
    if (attempts >= maxAttempts) {
      console.log(`Polling dihentikan (max attempts) untuk ${transactionReference}.`);
      browserWindow.webContents.send('payment:statusUpdate', {
        status: 'TIMEOUT',
        message: 'Waktu tunggu pembayaran habis setelah ' + (maxAttempts * interval / 60000) + ' menit.',
        reference: transactionReference
      });
      return;
    }
    attempts++;

    try {
      const statusResult = await tripayService.checkTransactionStatus(transactionReference);
      console.log(`Polling attempt #${attempts} for ${transactionReference}:`, statusResult);

      // Pastikan jendela masih ada sebelum mengirim pesan
      if (browserWindow.isDestroyed()) return;

      if (statusResult && statusResult.success && statusResult.data) {
        const paymentStatus = statusResult.data.status;
        const updateData = {
          status: paymentStatus,
          data: statusResult.data,
          reference: transactionReference,
          message: statusResult.data.note || statusResult.message || (voucherAppliedMessage && paymentStatus === 'PAID' ? voucherAppliedMessage : '')
        };
        browserWindow.webContents.send('payment:statusUpdate', updateData);

        if (paymentStatus === 'PAID') {
          console.log(`Pembayaran LUNAS untuk ${transactionReference}!`);
          try {
            const activeMsg = await dslrboothService.ensureDslrBoothActive();
            console.log(activeMsg);
            if (!browserWindow.isDestroyed()) {
                browserWindow.webContents.send('dslrbooth:statusUpdate', { status: 'activated_or_launched', message: activeMsg });
            }
            // (Opsional) Coba fokus setelah beberapa detik
            // setTimeout(async () => {
            //   if (browserWindow.isDestroyed()) return;
            //   try {
            //     const focusMsg = await dslrboothService.focusDslrBoothWindow();
            //     console.log(focusMsg);
            //   } catch (focusError) { console.error('Gagal fokus dslrBooth:', focusError); }
            // }, 3000);
          } catch (dslrError) {
            console.error('Gagal membuka dslrBooth:', dslrError);
            if (!browserWindow.isDestroyed()) {
                browserWindow.webContents.send('dslrbooth:statusUpdate', { status: 'error', message: dslrError.toString() });
            }
          }
          return; // Hentikan polling karena sudah LUNAS
        } else if (paymentStatus === 'EXPIRED' || paymentStatus === 'FAILED') {
          console.log(`Pembayaran ${paymentStatus} untuk ${transactionReference}. Polling dihentikan.`);
          return; // Hentikan polling karena status final (gagal/kedaluwarsa)
        }
      } else {
        // Gagal mendapatkan status atau API error
        console.warn(`Gagal mendapatkan status valid untuk ${transactionReference}:`, statusResult.message || 'Respons tidak sukses atau data tidak ada.');
        if (!browserWindow.isDestroyed()) {
            browserWindow.webContents.send('payment:statusUpdate', {
              status: 'POLLING_ERROR',
              message: statusResult.message || 'Gagal mengecek status pembayaran (respons tidak valid).',
              reference: transactionReference
            });
        }
        // Pertimbangkan untuk tidak menghentikan polling jika hanya error jaringan sementara,
        // tapi untuk contoh ini, kita lanjutkan polling sampai maxAttempts.
      }
    } catch (error) {
      console.error(`Error saat polling untuk ${transactionReference}:`, error);
      if (!browserWindow.isDestroyed()) {
          browserWindow.webContents.send('payment:statusUpdate', {
            status: 'POLLING_ERROR',
            message: 'Terjadi kesalahan internal saat mengecek status: ' + error.message,
            reference: transactionReference
          });
      }
    }

    // Lanjutkan polling jika belum mencapai status final dan max attempts belum tercapai
    if (!browserWindow.isDestroyed()) {
        setTimeout(poll, interval);
    }
  };

  // Mulai polling pertama
  if (!browserWindow.isDestroyed()) {
    poll();
  }
}