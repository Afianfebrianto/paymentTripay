// main.js (Electron App)
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios'); // Pastikan sudah diinstal di proyek Electron
const http = require('http'); // Modul HTTP bawaan Node.js
const { URL } = require('url'); // Untuk parsing URL trigger

// Asumsikan kamu punya service ini di proyek Electron-mu
// Sesuaikan path jika perlu
const midtransService = require('./src/services/midtransService'); 
const dslrboothService = require('./src/services/dslrboothService');

// --- Konfigurasi ---
const BACKEND_API_URL_ELECTRON = 'http://localhost:4000'; // URL Backend API lokalmu
// PENTING: Ganti dengan kunci Midtrans-mu. Simpan di tempat yang lebih aman jika perlu.
const MIDTRANS_SERVER_KEY_ELECTRON = "SB-Mid-server-jb5uDdLw3XTs5f89SMHv88jd"; 
const MIDTRANS_IS_PRODUCTION_ELECTRON = false; // Set true untuk produksi

let mainWindow;
const pendingQrisTransactionsContext = {}; // Simpan konteks pembayaran QRIS

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        fullscreen: true,
        icon: path.join(__dirname, 'assets', 'icons', 'icon.png'), // Sesuaikan path ikon
        title: "Selamat Datang di ShooteraSnap", // Judul Jendela untuk AHK
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
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
            requestUrl = new URL(req.url, `http://${req.headers.host || triggerHost}`);
        } catch (e) {
            console.warn(`MAIN_PROCESS (HTTP Trigger Server): URL tidak valid diterima: ${req.url}, Error: ${e.message}`);
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Request URL tidak valid.');
            return;
        }
        
        const eventType = requestUrl.searchParams.get('event_type');
        console.log(`-----------------------------------------------------`);
        console.log(`MAIN_PROCESS (HTTP Trigger Server): Menerima request: ${req.method} ${requestUrl.pathname}${requestUrl.search}`);
        console.log(`MAIN_PROCESS (HTTP Trigger Server): Event Type  : ${eventType}`);

        if (eventType === 'session_end') {
            console.log("MAIN_PROCESS (HTTP Trigger Server): Event 'session_end' diterima!");
            if (mainWindow && !mainWindow.isDestroyed()) {
                console.log("MAIN_PROCESS (HTTP Trigger Server): mainWindow ditemukan. Mencoba memfokuskan via AHK...");
                
                const paymentAppWindowTitle = mainWindow.getTitle();
                console.log(`MAIN_PROCESS (HTTP Trigger Server): Judul jendela payment app: "${paymentAppWindowTitle}"`);

                dslrboothService.focusPaymentApplication(paymentAppWindowTitle)
                    .then(message => {
                        console.log(`MAIN_PROCESS (HTTP Trigger Server): Hasil dari focusPaymentApplication AHK: ${message}`);
                        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
                            console.warn("MAIN_PROCESS (HTTP Trigger Server): AHK dipanggil, tapi jendela utama belum fokus. Mencoba Electron focus lagi.");
                            if (mainWindow.isMinimized()) mainWindow.restore();
                            mainWindow.show();
                            mainWindow.focus();
                        }
                    })
                    .catch(err => {
                        console.error("MAIN_PROCESS (HTTP Trigger Server): Error saat memanggil focusPaymentApplication AHK:", err);
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            if (mainWindow.isMinimized()) mainWindow.restore();
                            mainWindow.show();
                            mainWindow.focus();
                        }
                    });

            } else {
                console.warn("MAIN_PROCESS (HTTP Trigger Server): Event 'session_end' diterima, TAPI mainWindow tidak ada.");
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Event session_end diterima dan permintaan fokus dikirim.');
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
    });

    server.on('error', (err) => {
        console.error('MAIN_PROCESS: Error pada server HTTP trigger dslrBooth:', err);
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
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Handlers ---

ipcMain.handle('qris:create-transaction', async (event, payloadFromRenderer) => {
    console.log('MAIN_PROCESS: Menerima permintaan createQrisTransaction (Midtrans):', payloadFromRenderer);
    try {
        const result = await midtransService.createQrisTransaction(
            MIDTRANS_SERVER_KEY_ELECTRON,
            MIDTRANS_IS_PRODUCTION_ELECTRON,
            payloadFromRenderer
        );
        
        if (result.success && result.data && result.data.order_id) {
            const paymentContext = payloadFromRenderer.paymentContext;
            pendingQrisTransactionsContext[result.data.order_id] = {
                ...paymentContext,
                midtrans_transaction_id: result.data.reference
            };
            console.log('MAIN_PROCESS: Konteks pembayaran disimpan untuk Midtrans Order ID:', result.data.order_id);
        }
        return result;
    } catch (error) {
        console.error('MAIN_PROCESS: Error di createQrisTransaction handler (Midtrans):', error);
        return { success: false, message: error.message || 'Gagal membuat transaksi Midtrans.' };
    }
});

ipcMain.handle('qris:check-status', async (event, dataFromRenderer) => {
    const orderId = typeof dataFromRenderer === 'object' ? dataFromRenderer.order_id : dataFromRenderer;
    console.log('MAIN_PROCESS: Menerima permintaan checkQrisStatus (Midtrans) untuk Order ID:', orderId);
    try {
        const result = await midtransService.checkTransactionStatus(
            MIDTRANS_SERVER_KEY_ELECTRON,
            MIDTRANS_IS_PRODUCTION_ELECTRON,
            orderId
        );
        
        if (result.success && result.data && result.data.status === 'PAID') {
            console.log('MAIN_PROCESS: Status Midtrans PAID terdeteksi. Memberitahu backend API lokal...');
            
            const paymentContext = pendingQrisTransactionsContext[orderId];
            let notificationPayload;

            if (!paymentContext) {
                console.warn(`MAIN_PROCESS: Konteks pembayaran untuk Order ID ${orderId} tidak ditemukan! Mengirim data minimal.`);
                notificationPayload = {
                    tripay_reference: result.data.order_id,
                    electron_merchant_ref: `EL-${result.data.order_id}`,
                    final_amount: result.data.amount,
                    base_amount: result.data.amount,
                    discount_applied: 0,
                    voucher_code_used: null,
                    paid_at_timestamp: result.data.paid_at,
                    notes: `Pembayaran Midtrans QRIS. Konteks asli tidak ditemukan.`
                };
            } else {
                notificationPayload = {
                    tripay_reference: result.data.order_id,
                    electron_merchant_ref: paymentContext.electron_internal_ref,
                    final_amount: result.data.amount,
                    base_amount: paymentContext.base_amount_original,
                    discount_applied: paymentContext.discount_applied_calculated,
                    voucher_code_used: paymentContext.voucher_code_actually_used,
                    customer_name: result.data.customer_name,
                    customer_email: result.data.customer_email,
                    customer_phone: result.data.customer_phone,
                    paid_at_timestamp: result.data.paid_at,
                    notes: `Pembayaran Midtrans QRIS. Ref: ${result.data.reference}`
                };
            }

            try {
                console.log("MAIN_PROCESS: Mengirim notifikasi PAID ke backend API lokal:", notificationPayload);
                const apiResponse = await axios.post(`${BACKEND_API_URL_ELECTRON}/api/transactions/notify-qris-paid`, notificationPayload);
                console.log('MAIN_PROCESS: Respons dari backend API setelah notifikasi PAID:', apiResponse.data);
            } catch (apiError) {
                console.error('MAIN_PROCESS: Gagal mengirim notifikasi PAID ke backend API lokal:', 
                    apiError.response ? JSON.stringify(apiError.response.data, null, 2) : apiError.message);
            }
            
            if (paymentContext) {
                delete pendingQrisTransactionsContext[orderId];
            }
        }
        return result;
    } catch (error) {
        console.error('MAIN_PROCESS: Error di checkQrisStatus handler (Midtrans):', error);
        return { success: false, message: error.message || 'Gagal mengecek status transaksi Midtrans.' };
    }
});

ipcMain.on('dslrbooth:start-session', async () => {
    console.log('MAIN_PROCESS: Menerima permintaan startDslrBooth dari renderer.');
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
