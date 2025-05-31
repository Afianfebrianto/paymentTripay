// main.js
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

// Impor services dan config kamu
// Pastikan path ini sesuai dengan struktur folder proyekmu
const tripayService = require('./src/services/tripayService');
const dslrboothService = require('./src/services/dslrboothService');
// const config = require('./src/utils/config'); // Config biasanya sudah diimpor oleh services

// Variabel global untuk menyimpan instance jendela utama
let mainWindowInstance;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 850,
    height: 750,
    icon: path.join(__dirname, 'assets/icons/icon.png'), // Ganti dengan path ikon aplikasimu
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged, // Aktifkan DevTools hanya saat development
    }
  });

  mainWindow.loadFile('index.html');

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindowInstance = mainWindow; // Simpan instance jendela

  // Handle jika jendela ditutup, agar polling bisa berhenti jika perlu
  mainWindow.on('closed', () => {
    mainWindowInstance = null; // Hapus referensi saat jendela ditutup
  });

  return mainWindow;
}

// --- App Lifecycle Events ---
app.whenReady().then(() => {
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---
ipcMain.handle('tripay:createPayment', async (event, paymentDataFromRenderer) => {
  if (!mainWindowInstance || mainWindowInstance.isDestroyed()) {
    console.error('mainWindowInstance tidak tersedia saat menangani tripay:createPayment');
    return { success: false, message: 'Kesalahan internal: Jendela utama tidak siap atau sudah ditutup.' };
  }

  console.log('Menerima permintaan createPayment dari renderer:', paymentDataFromRenderer);
  const { base_amount, method, customer_name, customer_email, customer_phone, itemName, voucher_code } = paymentDataFromRenderer;
  let finalAmount = base_amount;
  let voucherAppliedMessage = ''; // Pesan untuk ditampilkan jika voucher berhasil

  // --- LOGIKA VOUCHER SEDERHANA (Contoh) ---
  if (voucher_code && voucher_code.trim() !== '') {
    console.log(`Memproses voucher: ${voucher_code}`);
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
      return { success: false, message: `Kode voucher "${voucher_code}" tidak valid.` };
    }
  }
  // --- AKHIR LOGIKA VOUCHER ---

  // Kasus jika harga menjadi Rp 0 atau kurang setelah diskon
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

    if (mainWindowInstance && !mainWindowInstance.isDestroyed()) {
      mainWindowInstance.webContents.send('payment:statusUpdate', {
        status: 'PAID',
        data: virtualPaymentData,
        reference: virtualReference,
        message: voucherAppliedMessage || 'Pembayaran Lunas dengan Voucher (Harga Rp 0)'
      });
    }

    try {
      const launchMsg = await dslrboothService.ensureDslrBoothActive();
      console.log(launchMsg);
      if (mainWindowInstance && !mainWindowInstance.isDestroyed()) {
        mainWindowInstance.webContents.send('dslrbooth:statusUpdate', { status: 'activated_or_launched', message: launchMsg });
      }
    } catch (dslrError) {
      console.error('Gagal mengaktifkan/meluncurkan dslrBooth (setelah pembayaran virtual Rp 0):', dslrError);
      if (mainWindowInstance && !mainWindowInstance.isDestroyed()) {
        mainWindowInstance.webContents.send('dslrbooth:statusUpdate', { status: 'error', message: dslrError.toString() });
      }
    }
    return { success: true, data: virtualPaymentData };
  }

  const tripayPayload = {
    amount: finalAmount,
    method: method,
    customer_name: customer_name,
    customer_email: customer_email,
    customer_phone: customer_phone,
    itemName: itemName,
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
      if (mainWindowInstance && !mainWindowInstance.isDestroyed()) {
        startPaymentPolling(mainWindowInstance, result.data.reference, voucherAppliedMessage); // Kirim pesan voucher
      } else {
        console.error("mainWindowInstance tidak tersedia atau sudah dihancurkan saat akan memulai polling.");
      }
    } else {
      console.warn('Gagal membuat transaksi TriPay atau data referensi tidak ada:', result.message);
    }
    return result;
  } catch (error) {
    console.error('Error di main process saat memanggil tripayService.createTransaction:', error);
    return { success: false, message: 'Terjadi kesalahan internal server: ' + error.message };
  }
});

ipcMain.on('app:openExternalLink', (event, url) => {
  try {
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
async function startPaymentPolling(browserWindow, transactionReference, voucherMessage = '') {
  if (!browserWindow || browserWindow.isDestroyed()) {
    console.warn(`Polling dihentikan untuk ${transactionReference} karena jendela tidak valid atau sudah dihancurkan.`);
    return;
  }

  console.log(`Memulai polling untuk transaksi: ${transactionReference}`);
  let attempts = 0;
  const maxAttempts = 120; // Polling hingga 10 menit (120 * 5 detik)
  const interval = 5000;   // Interval polling 5 detik
  let pollingTimeoutId = null; // Untuk menyimpan ID timeout agar bisa di-clear

  // Fungsi untuk mengirim update status ke renderer
  function sendStatusUpdate(update) {
    if (browserWindow && !browserWindow.isDestroyed()) {
      browserWindow.webContents.send('payment:statusUpdate', update);
    } else {
      console.warn("Gagal mengirim status update, jendela tidak ada atau sudah dihancurkan.");
      clearTimeout(pollingTimeoutId); // Hentikan polling jika jendela tidak ada
    }
  }

  const poll = async () => {
    if (browserWindow.isDestroyed()) {
      console.warn(`Polling dihentikan (jendela dihancurkan saat akan poll) untuk ${transactionReference}.`);
      return;
    }
    if (attempts >= maxAttempts) {
      console.log(`Polling dihentikan (max attempts) untuk ${transactionReference}.`);
      sendStatusUpdate({
        status: 'TIMEOUT',
        message: 'Waktu tunggu pembayaran habis setelah ' + (maxAttempts * interval / 60000) + ' menit.',
        reference: transactionReference
      });
      return;
    }
    attempts++;

    try {
      const statusResult = await tripayService.checkTransactionStatus(transactionReference);
      console.log(`Polling attempt #${attempts} for ${transactionReference}: Status=${statusResult?.data?.status}, Success=${statusResult?.success}`);

      if (statusResult && statusResult.success && statusResult.data) {
        const paymentStatus = statusResult.data.status;
        const updateData = {
          status: paymentStatus,
          data: statusResult.data,
          reference: transactionReference,
          message: statusResult.data.note || statusResult.message || (paymentStatus === 'PAID' && voucherMessage ? voucherMessage : '')
        };
        sendStatusUpdate(updateData);

        if (paymentStatus === 'PAID') {
          console.log(`Pembayaran LUNAS untuk ${transactionReference}!`);
          try {
            const activeMsg = await dslrboothService.ensureDslrBoothActive();
            console.log(activeMsg);
            if (browserWindow && !browserWindow.isDestroyed()) {
              browserWindow.webContents.send('dslrbooth:statusUpdate', { status: 'activated_or_launched', message: activeMsg });
            }
          } catch (dslrError) {
            console.error('Gagal mengaktifkan atau meluncurkan dslrBooth:', dslrError);
            if (browserWindow && !browserWindow.isDestroyed()) {
              browserWindow.webContents.send('dslrbooth:statusUpdate', { status: 'error', message: dslrError.toString() });
            }
          }
          return; // Hentikan polling karena sudah LUNAS
        } else if (paymentStatus === 'EXPIRED' || paymentStatus === 'FAILED') {
          console.log(`Pembayaran ${paymentStatus} untuk ${transactionReference}. Polling dihentikan.`);
          return; // Hentikan polling karena status final
        }
      } else {
        console.warn(`Gagal mendapatkan status valid untuk ${transactionReference}:`, statusResult.message || 'Respons tidak sukses atau data tidak ada.');
        sendStatusUpdate({
          status: 'POLLING_ERROR',
          message: statusResult.message || 'Gagal mengecek status pembayaran (respons tidak valid).',
          reference: transactionReference
        });
      }
    } catch (error) {
      console.error(`Error saat polling untuk ${transactionReference}:`, error);
      sendStatusUpdate({
        status: 'POLLING_ERROR',
        message: 'Terjadi kesalahan internal saat mengecek status: ' + error.message,
        reference: transactionReference
      });
    }

    // Lanjutkan polling jika belum mencapai status final dan max attempts belum tercapai
    // dan jendela masih ada
    if (browserWindow && !browserWindow.isDestroyed()) {
      pollingTimeoutId = setTimeout(poll, interval);
    } else {
        console.warn(`Polling dihentikan (jendela dihancurkan sebelum timeout berikutnya) untuk ${transactionReference}.`);
    }
  };

  if (browserWindow && !browserWindow.isDestroyed()) {
    poll(); // Mulai polling pertama
  } else {
    console.warn(`Gagal memulai polling, jendela tidak ada atau sudah dihancurkan (untuk ${transactionReference}).`);
  }
}