// main.js (Electron App - Gabungan Lengkap)
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http'); // Modul HTTP bawaan Node.js
const { URLSearchParams, URL } = require('url'); // URLSearchParams dan URL untuk parsing
const axios = require('axios'); // Pastikan sudah diinstal di proyek Electron: npm install axios

// Asumsikan kamu punya service ini di proyek Electron-mu
// Sesuaikan path jika perlu (misalnya, jika main.js ada di root, path ke src/)
const tripayService = require('./src/services/tripayService'); 
const dslrboothService = require('./src/services/dslrboothService');

const BACKEND_API_URL_ELECTRON = 'http://localhost:4000'; // URL Backend API lokal kamu

let mainWindow; // Variabel untuk menyimpan instance jendela utama
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
        console.log("MAIN_PROCESS: Jendela utama ditutup.");
        mainWindow = null;
    });

    mainWindow.on('focus', () => {
        console.log("MAIN_PROCESS: Jendela utama mendapat fokus.");
    });
    mainWindow.on('blur', () => {
        console.log("MAIN_PROCESS: Jendela utama kehilangan fokus.");
    });

    console.log("MAIN_PROCESS: createWindow() selesai, mainWindow dibuat.");
}

function createHttpServerForDslrBoothTriggers() {
    const triggerPort = 12346; 
    const triggerHost = '127.0.0.1';

    const server = http.createServer((req, res) => {
        let requestUrl;
        try {
            // Gunakan constructor URL untuk parsing yang lebih aman dan lengkap
            requestUrl = new URL(req.url, `http://${req.headers.host || triggerHost}`);
        } catch (e) {
            console.warn(`MAIN_PROCESS (HTTP Trigger Server): URL tidak valid diterima: ${req.url}, Error: ${e.message}`);
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Request URL tidak valid.');
            return;
        }
        
        const eventType = requestUrl.searchParams.get('event_type');
        const param1 = requestUrl.searchParams.get('param1');
        const param2 = requestUrl.searchParams.get('param2');

        console.log(`-----------------------------------------------------`);
        console.log(`MAIN_PROCESS (HTTP Trigger Server): Menerima request: ${req.method} ${requestUrl.pathname}${requestUrl.search}`);
        console.log(`MAIN_PROCESS (HTTP Trigger Server): Event Type  : ${eventType}`);
        console.log(`MAIN_PROCESS (HTTP Trigger Server): Param1      : ${param1}`);
        console.log(`MAIN_PROCESS (HTTP Trigger Server): Param2      : ${param2}`);

        if (eventType === 'session_end') {
            console.log("MAIN_PROCESS (HTTP Trigger Server): Event 'session_end' diterima!");
            if (mainWindow && !mainWindow.isDestroyed()) {
                console.log("MAIN_PROCESS (HTTP Trigger Server): mainWindow ditemukan dan belum dihancurkan.");
                if (mainWindow.isMinimized()) {
                    console.log("MAIN_PROCESS (HTTP Trigger Server): Jendela utama sedang minimize, mencoba restore...");
                    mainWindow.restore();
                }
                setTimeout(() => { // Jeda singkat sebelum show/focus
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        console.log("MAIN_PROCESS (HTTP Trigger Server): Mencoba mainWindow.show() setelah jeda...");
                        mainWindow.show(); 
                        
                        console.log("MAIN_PROCESS (HTTP Trigger Server): Mencoba mainWindow.focus() setelah jeda...");
                        mainWindow.focus(); 

                        // Teknik yang lebih memaksa (opsional)
                        // console.log("MAIN_PROCESS (HTTP Trigger Server): Mencoba setAlwaysOnTop(true) sementara...");
                        // mainWindow.setAlwaysOnTop(true); 
                        // setTimeout(() => {
                        //     if (mainWindow && !mainWindow.isDestroyed()) {
                        //         mainWindow.setAlwaysOnTop(false);
                        //         console.log("MAIN_PROCESS (HTTP Trigger Server): AlwaysOnTop dinonaktifkan.");
                        //     }
                        // }, 500);
                        
                        mainWindow.webContents.send('app:focus-requested', { event: 'session_end' });
                        console.log("MAIN_PROCESS (HTTP Trigger Server): Perintah fokus ke jendela utama telah dikirim (setelah jeda).");
                    }
                }, 100); 
            } else {
                console.warn("MAIN_PROCESS (HTTP Trigger Server): Event 'session_end' diterima, TAPI mainWindow tidak ada atau sudah dihancurkan.");
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Event session_end diterima dan diproses oleh Aplikasi Payment Electron.');
        } else if (eventType) {
            console.log(`MAIN_PROCESS (HTTP Trigger Server): Event '${eventType}' diterima, tidak ada aksi spesifik.`);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(`Event ${eventType} diterima.`);
        } else {
            console.warn(`MAIN_PROCESS (HTTP Trigger Server): Menerima request tanpa event_type yang jelas: ${req.url}`);
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Request tidak valid: event_type tidak ditemukan.');
        }
        console.log(`-----------------------------------------------------`);
    });

    server.listen(triggerPort, triggerHost, () => {
        console.log(`MAIN_PROCESS: Server HTTP untuk trigger dslrBooth berjalan di http://${triggerHost}:${triggerPort}`);
        console.log(`MAIN_PROCESS: Pastikan URL Trigger di dslrBooth diatur ke: http://${triggerHost}:${triggerPort}/ (atau path spesifik jika ada)`);
    });

    server.on('error', (err) => {
        console.error('MAIN_PROCESS: Error pada server HTTP trigger dslrBooth:', err);
        if (err.code === 'EADDRINUSE') {
            console.error(`MAIN_PROCESS: Port ${triggerPort} sudah digunakan.`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('app:error', { message: `Port ${triggerPort} untuk trigger dslrBooth sudah digunakan.` });
            }
        }
    });
}

app.whenReady().then(() => {
    console.log("MAIN_PROCESS: App ready.");
    createWindow();
    createHttpServerForDslrBoothTriggers(); 

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            console.log("MAIN_PROCESS: App activate, membuat jendela baru.");
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    console.log("MAIN_PROCESS: Semua jendela ditutup.");
    if (process.platform !== 'darwin') {
        app.quit();
    }
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
            merchant_ref: payloadFromRenderer.paymentContext?.electron_internal_ref || `QRIS-${Date.now()}`
        };
        const paymentContext = payloadFromRenderer.paymentContext;

        const result = await tripayService.createTransaction(tripayPayload); 
        console.log('MAIN_PROCESS: Hasil dari tripayService.createTransaction (Electron):', result);
        
        if (result.success && result.data && result.data.reference) {
            pendingQrisTransactionsContext[result.data.reference] = {
                ...paymentContext,
                electron_merchant_ref_sent_to_tripay: tripayPayload.merchant_ref 
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
    const reference = typeof dataFromRenderer === 'string' ? dataFromRenderer : dataFromRenderer.reference;
    const electronRefForNotification = typeof dataFromRenderer === 'string' ? null : dataFromRenderer.electronRef;

    console.log('MAIN_PROCESS: Menerima permintaan checkQrisStatus untuk TriPay reference:', reference);
    try {
        const result = await tripayService.checkTransactionStatus(reference);
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
                    base_amount: result.data.amount,
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
                delete pendingQrisTransactionsContext[reference];
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
        const message = await dslrboothService.ensureDslrBoothActive(); // Menggunakan fungsi yang sudah ada
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
