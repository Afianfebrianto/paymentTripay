// main.js
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

const tripayService = require('./src/services/tripayService');
const dslrboothService = require('./src/services/dslrboothService');
const { applyVoucher } = require('./src/utils/vouchers');

let mainWindowInstance;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1024, // Lebar awal jika tidak fullscreen
    height: 768, // Tinggi awal jika tidak fullscreen
    icon: path.join(__dirname, 'assets/icons/icon.png'), // Ganti dengan path ikonmu
    fullscreen: true, // Membuat aplikasi langsung fullscreen
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    }
  });

  mainWindow.loadFile('index.html');

  // Jika ingin tombol untuk keluar dari fullscreen (opsional)
  // mainWindow.setFullScreenable(true); // Defaultnya true
  // Kamu bisa menambahkan menu atau shortcut untuk toggle fullscreen jika perlu
  // mainWindow.on('leave-full-screen', () => { console.log("Left fullscreen"); });

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindowInstance = mainWindow;

  mainWindow.on('closed', () => {
    mainWindowInstance = null;
  });

  return mainWindow;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('tripay:createPayment', async (event, paymentDataFromRenderer) => {
  if (!mainWindowInstance || mainWindowInstance.isDestroyed()) {
    return { success: false, message: 'Kesalahan internal: Jendela utama tidak siap atau sudah ditutup.' };
  }

  console.log('Main: Menerima permintaan createPayment:', paymentDataFromRenderer);
  const { base_amount, method, customer_name, customer_email, customer_phone, itemName, voucher_code } = paymentDataFromRenderer;
  
  let finalAmount = base_amount;
  let voucherProsesResult = { isValid: false, finalAmount: base_amount, discountApplied: 0, message: "" };

  if (voucher_code && voucher_code.trim() !== '') {
    voucherProsesResult = applyVoucher(voucher_code, base_amount);
    if (!voucherProsesResult.isValid) {
      console.warn(`Main: Validasi voucher gagal: ${voucherProsesResult.message}`);
      return { success: false, message: voucherProsesResult.message };
    }
    finalAmount = voucherProsesResult.finalAmount;
    console.log(`Main: ${voucherProsesResult.message}. Harga setelah diskon: ${finalAmount}`);
  }

  if (finalAmount <= 0 && base_amount > 0) {
    console.log('Main: Harga final adalah Rp 0 setelah diskon. Anggap pembayaran LUNAS secara virtual.');
    const virtualReference = `VIRTUAL-${Date.now()}`;
    const virtualPaymentData = {
      reference: virtualReference,
      merchant_ref: virtualReference,
      status: 'PAID',
      amount: 0,
      payment_name: voucherProsesResult.message || 'Diskon Penuh',
      customer_name: customer_name,
    };

    if (mainWindowInstance && !mainWindowInstance.isDestroyed()) {
      mainWindowInstance.webContents.send('payment:statusUpdate', {
        status: 'PAID',
        data: virtualPaymentData,
        reference: virtualReference,
        message: voucherProsesResult.message || 'Pembayaran Lunas (Harga Rp 0)'
      });
    }

    try {
      const launchMsg = await dslrboothService.ensureDslrBoothActive();
      console.log('Main: DSLRBooth (virtual payment):', launchMsg);
      if (mainWindowInstance && !mainWindowInstance.isDestroyed()) {
        mainWindowInstance.webContents.send('dslrbooth:statusUpdate', { status: 'activated_or_launched', message: launchMsg });
      }
    } catch (dslrError) {
      console.error('Main: Gagal DSLRBooth (virtual payment):', dslrError);
      if (mainWindowInstance && !mainWindowInstance.isDestroyed()) {
        mainWindowInstance.webContents.send('dslrbooth:statusUpdate', { status: 'error', message: dslrError.toString() });
      }
    }
    // Kirim pesan voucher yang valid agar renderer bisa menampilkannya
    return { success: true, data: virtualPaymentData, voucher_message: (voucherProsesResult.isValid && voucherProsesResult.discountApplied > 0 ? voucherProsesResult.message : null) };
  }

  const tripayPayload = {
    amount: finalAmount,
    method: method,
    customer_name: customer_name,
    customer_email: customer_email,
    customer_phone: customer_phone,
    itemName: itemName,
    order_items: [{
      name: itemName + (voucherProsesResult.isValid && voucherProsesResult.discountApplied > 0 ? ` (${voucherProsesResult.description})` : ''), // Gunakan description dari voucher
      price: finalAmount,
      quantity: 1,
    }]
  };

  try {
    const result = await tripayService.createTransaction(tripayPayload);
    if (result.success && result.data && result.data.reference) {
      console.log('Main: Transaksi TriPay berhasil dibuat, memulai polling untuk reference:', result.data.reference);
      if (mainWindowInstance && !mainWindowInstance.isDestroyed()) {
        // Kirim pesan deskripsi voucher jika valid dan ada diskon
        const messageForPolling = (voucherProsesResult.isValid && voucherProsesResult.discountApplied > 0) ? voucherProsesResult.message : '';
        startPaymentPolling(mainWindowInstance, result.data.reference, messageForPolling);
      }
    } else {
      console.warn('Main: Gagal membuat transaksi TriPay atau data referensi tidak ada:', result.message);
    }
    return { ...result, voucher_message: (voucherProsesResult.isValid && voucherProsesResult.discountApplied > 0 ? voucherProsesResult.message : null) };
  } catch (error) {
    console.error('Main: Error saat memanggil tripayService.createTransaction:', error);
    return { success: false, message: 'Terjadi kesalahan internal server: ' + error.message };
  }
});

ipcMain.on('app:openExternalLink', (event, url) => {
  try {
    const parsedUrl = new URL(url);
    if (['http:', 'https:'].includes(parsedUrl.protocol)) {
      shell.openExternal(url);
    } else { console.warn('Upaya membuka URL dengan protokol tidak valid:', url); }
  } catch (e) { console.error('Gagal membuka link eksternal, URL tidak valid atau error:', url, e); }
});

async function startPaymentPolling(browserWindow, transactionReference, voucherAppliedMessage = '') {
  if (!browserWindow || browserWindow.isDestroyed()) {
    console.warn(`Main Polling: Dihentikan untuk ${transactionReference} karena jendela tidak valid/hancur.`);
    return;
  }

  console.log(`Main Polling: Memulai untuk ${transactionReference}, pesan voucher: "${voucherAppliedMessage}"`);
  let attempts = 0;
  const maxAttempts = 120;
  const interval = 5000;
  let pollingTimeoutId = null;

  function sendStatusUpdate(update) {
    if (browserWindow && !browserWindow.isDestroyed()) {
      browserWindow.webContents.send('payment:statusUpdate', update);
    } else {
      console.warn("Main Polling: Gagal mengirim status update, jendela tidak ada atau sudah dihancurkan.");
      if (pollingTimeoutId) clearTimeout(pollingTimeoutId);
    }
  }

  const poll = async () => {
    if (browserWindow.isDestroyed()) {
      console.warn(`Main Polling: Dihentikan (jendela hancur saat poll) untuk ${transactionReference}.`);
      return;
    }
    if (attempts >= maxAttempts) {
      console.log(`Main Polling: Dihentikan (max attempts) untuk ${transactionReference}.`);
      sendStatusUpdate({
        status: 'TIMEOUT',
        message: 'Waktu tunggu pembayaran habis.',
        reference: transactionReference
      });
      return;
    }
    attempts++;

    try {
      const statusResult = await tripayService.checkTransactionStatus(transactionReference);
      console.log(`Main Polling: Attempt #${attempts} for ${transactionReference}: Status=${statusResult?.data?.status}, Success=${statusResult?.success}`);

      if (statusResult && statusResult.success && statusResult.data) {
        const paymentStatus = statusResult.data.status;
        let finalMessage = statusResult.data.note || statusResult.message || '';
        
        if (paymentStatus === 'PAID') {
            if (voucherAppliedMessage) { // Jika ada pesan voucher (berarti voucher valid diterapkan)
                finalMessage = voucherAppliedMessage + (finalMessage ? ` (${finalMessage})` : '');
            }
            if (!finalMessage) { // Jika tetap kosong
                finalMessage = 'Pembayaran LUNAS!';
            }
        }

        const updateData = {
          status: paymentStatus,
          data: statusResult.data,
          reference: transactionReference,
          message: finalMessage
        };
        sendStatusUpdate(updateData);

        if (paymentStatus === 'PAID') {
          console.log(`Main Polling: Pembayaran LUNAS untuk ${transactionReference}!`);
          try {
            const activeMsg = await dslrboothService.ensureDslrBoothActive();
            console.log('Main Polling: DSLRBooth (PAID):', activeMsg);
            if (browserWindow && !browserWindow.isDestroyed()) {
              browserWindow.webContents.send('dslrbooth:statusUpdate', { status: 'activated_or_launched', message: activeMsg });
            }
          } catch (dslrError) {
            console.error('Main Polling: Gagal DSLRBooth (PAID):', dslrError);
            if (browserWindow && !browserWindow.isDestroyed()) {
              browserWindow.webContents.send('dslrbooth:statusUpdate', { status: 'error', message: dslrError.toString() });
            }
          }
          return; // Hentikan polling
        } else if (paymentStatus === 'EXPIRED' || paymentStatus === 'FAILED') {
          console.log(`Main Polling: Pembayaran ${paymentStatus} untuk ${transactionReference}. Polling dihentikan.`);
          return; // Hentikan polling
        }
      } else {
        console.warn(`Main Polling: Gagal mendapatkan status valid untuk ${transactionReference}:`, statusResult.message || 'Respons tidak sukses atau data tidak ada.');
        sendStatusUpdate({
          status: 'POLLING_ERROR',
          message: statusResult.message || 'Gagal mengecek status pembayaran (respons tidak valid).',
          reference: transactionReference
        });
      }
    } catch (error) {
      console.error(`Main Polling: Error saat polling untuk ${transactionReference}:`, error);
      sendStatusUpdate({
        status: 'POLLING_ERROR',
        message: 'Terjadi kesalahan internal saat mengecek status: ' + error.message,
        reference: transactionReference
      });
    }

    if (browserWindow && !browserWindow.isDestroyed()) {
      pollingTimeoutId = setTimeout(poll, interval);
    } else {
        console.warn(`Main Polling: Dihentikan (jendela hancur sebelum timeout berikutnya) untuk ${transactionReference}.`);
    }
  };

  if (browserWindow && !browserWindow.isDestroyed()) {
    poll();
  } else {
    console.warn(`Main Polling: Gagal memulai, jendela tidak ada/hancur (untuk ${transactionReference}).`);
  }
}