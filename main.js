// main.js (Electron App)
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios'); // Pastikan sudah diinstal di proyek Electron

// Asumsikan kamu punya service ini di proyek Electron-mu
// Sesuaikan path jika perlu (misalnya, jika main.js ada di root, path ke src/)
const tripayService = require('./src/services/tripayService'); 
const dslrboothService = require('./src/services/dslrboothService');

const BACKEND_API_URL_ELECTRON = 'http://localhost:4000'; // URL Backend API lokal kamu

let mainWindow;
const pendingQrisTransactionsContext = {}; // Simpan konteks pembayaran QRIS

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        fullscreen: true,
        icon: path.join(__dirname, 'assets', 'icons', 'icon.png'), // Sesuaikan path ikon
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            // devTools: !app.isPackaged // Buka devtools saat development
        }
    });

    mainWindow.loadFile('index.html'); // Halaman awalmu

    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

ipcMain.handle('qris:create-transaction', async (event, payloadFromRenderer) => {
    console.log('MAIN_PROCESS: Menerima permintaan createQrisTransaction:', payloadFromRenderer);
    try {
        const tripayPayload = {
            amount: payloadFromRenderer.amount,
            method: payloadFromRenderer.method,
            customer_name: payloadFromRenderer.customer_name,
            customer_email: payloadFromRenderer.customer_email,
            order_items: payloadFromRenderer.order_items,
            // Tambahkan field lain yang dibutuhkan TriPay jika ada (misal, merchant_ref unik)
            merchant_ref: payloadFromRenderer.paymentContext?.electron_internal_ref || `QRIS-${Date.now()}`
        };
        const paymentContext = payloadFromRenderer.paymentContext;

        // Panggil tripayService versi Electron untuk membuat transaksi ke API TriPay
        const result = await tripayService.createTransaction(tripayPayload); 
        console.log('MAIN_PROCESS: Hasil dari tripayService.createTransaction (Electron):', result);
        
        if (result.success && result.data && result.data.reference) {
            // Simpan konteks pembayaran yang berisi base_amount, discount, voucher_code
            pendingQrisTransactionsContext[result.data.reference] = {
                ...paymentContext,
                electron_merchant_ref_sent_to_tripay: tripayPayload.merchant_ref // Simpan juga ref yang dikirim ke TriPay
            };
            console.log('MAIN_PROCESS: Konteks pembayaran disimpan untuk TriPay ref:', result.data.reference, pendingQrisTransactionsContext[result.data.reference]);
        }
        return result;
    } catch (error) {
        console.error('MAIN_PROCESS: Error di createQrisTransaction handler:', error);
        return { success: false, message: error.message || 'Gagal membuat transaksi di main process.' };
    }
});

ipcMain.handle('qris:check-status', async (event, dataFromRenderer) => {
    // dataFromRenderer sekarang bisa objek: { reference, electronRef }
    const reference = typeof dataFromRenderer === 'string' ? dataFromRenderer : dataFromRenderer.reference;
    const electronRefForNotification = typeof dataFromRenderer === 'string' ? null : dataFromRenderer.electronRef;

    console.log('MAIN_PROCESS: Menerima permintaan checkQrisStatus untuk TriPay reference:', reference);
    try {
        const result = await tripayService.checkTransactionStatus(reference); // Ke API TriPay
        console.log('MAIN_PROCESS: Hasil dari tripayService.checkTransactionStatus (Electron):', result);

        if (result.success && result.data && result.data.status === 'PAID') {
            console.log('MAIN_PROCESS: Status QRIS PAID terdeteksi. Memberitahu backend API lokal...');
            
            const paymentContext = pendingQrisTransactionsContext[reference];
            let notificationPayload;

            if (!paymentContext) {
                console.warn(`MAIN_PROCESS: Konteks pembayaran untuk ref ${reference} tidak ditemukan! Mengirim data minimal ke backend.`);
                notificationPayload = {
                    tripay_reference: result.data.reference,
                    electron_merchant_ref: electronRefForNotification || result.data.merchant_ref || `EL-${result.data.reference}`,
                    final_amount: result.data.amount,
                    base_amount: result.data.amount, // Fallback jika tidak ada info diskon
                    discount_applied: 0,
                    voucher_code_used: null,
                    customer_name: result.data.customer_name,
                    customer_email: result.data.customer_email,
                    customer_phone: result.data.customer_phone,
                    paid_at_timestamp: result.data.paid_at,
                    notes: `Pembayaran QRIS via Electron. Konteks asli tidak ditemukan.`
                };
            } else {
                notificationPayload = {
                    tripay_reference: result.data.reference,
                    electron_merchant_ref: paymentContext.electron_internal_ref || paymentContext.electron_merchant_ref_sent_to_tripay || result.data.merchant_ref,
                    final_amount: result.data.amount,
                    base_amount: paymentContext.base_amount_original,
                    discount_applied: paymentContext.discount_applied_calculated,
                    voucher_code_used: paymentContext.voucher_code_actually_used,
                    customer_name: result.data.customer_name,
                    customer_email: result.data.customer_email,
                    customer_phone: result.data.customer_phone,
                    paid_at_timestamp: result.data.paid_at,
                    notes: `Pembayaran QRIS via Electron. Ref TriPay: ${result.data.reference}`
                };
            }

            try {
                console.log("MAIN_PROCESS: Mengirim notifikasi PAID ke backend API lokal:", notificationPayload);
                const apiResponse = await axios.post(`${BACKEND_API_URL_ELECTRON}/api/transactions/notify-qris-paid`, notificationPayload);
                console.log('MAIN_PROCESS: Respons dari backend API setelah notifikasi PAID:', apiResponse.data);
                if (!apiResponse.data.success) {
                    console.warn('MAIN_PROCESS: Backend API lokal merespons dengan gagal saat mencatat transaksi:', apiResponse.data.message);
                }
            } catch (apiError) {
                console.error('MAIN_PROCESS: Gagal mengirim notifikasi PAID ke backend API lokal:', 
                    apiError.response ? JSON.stringify(apiError.response.data, null, 2) : apiError.message);
            }
            
            if (paymentContext) {
                delete pendingQrisTransactionsContext[reference]; // Hapus konteks setelah digunakan
                console.log("MAIN_PROCESS: Konteks untuk ref", reference, "dihapus.");
            }
        }
        return result;
    } catch (error) {
        console.error('MAIN_PROCESS: Error di checkQrisStatus handler:', error);
        return { success: false, message: error.message || 'Gagal mengecek status transaksi di main process.' };
    }
});

ipcMain.on('dslrbooth:start-session', async () => {
    console.log('MAIN_PROCESS: Menerima permintaan startDslrBooth.');
    try {
        const message = await dslrboothService.ensureDslrBoothActive();
        console.log('MAIN_PROCESS: Pesan dari dslrboothService:', message);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('dslrbooth:status-update', { success: true, message });
        }
    } catch (error) {
        console.error('MAIN_PROCESS: Error saat memulai DSLRBooth:', error);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('dslrbooth:status-update', { success: false, message: error.message || error.toString() });
        }
    }
});

// Opsional: Jika perlu getElectronAppId dari preload.js
// ipcMain.handle('app:get-id', async () => {
//     return 'photobooth-electron-instance-01'; // Contoh ID
// });
