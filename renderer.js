// renderer.js (untuk Aplikasi Electron)

document.addEventListener('DOMContentLoaded', () => {
    const currentPagePath = window.location.pathname;
    console.log("Renderer JS Loaded for page:", currentPagePath);

    const BACKEND_API_URL = 'http://localhost:4000'; // URL Backend API lokal kamu

    // --- Fungsi Navigasi Global ---
    function goToPage(page) {
        window.location.href = page;
    }

    // --- Logika untuk index.html ---
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            goToPage('payment.html');
        });
    }

    // --- Logika untuk payment.html ---
    // Di payment.html, asumsikan ada elemen dengan onclick="goToQRIS()" dan onclick="goToKode()"
    // Kode di bawah ini hanya untuk referensi jika kamu beralih ke event listener
    const qrisMethodDiv = document.querySelector('.method[onclick="goToQRIS()"]');
    const kodeMethodDiv = document.querySelector('.method[onclick="goToKode()"]');
    if (qrisMethodDiv) {
        // qrisMethodDiv.addEventListener('click', () => goToPage('qris_payment.html'));
    }
    if (kodeMethodDiv) {
        // kodeMethodDiv.addEventListener('click', () => goToPage('kode_payment.html'));
    }


    // --- Logika untuk qris_payment.html ---
    const payButtonQRIS = document.getElementById('payButton');
    const voucherCodeInputQRIS = document.getElementById('voucherCode');
    const hargaNormalElementQRIS = document.getElementById('hargaNormal');
    
    const paymentDetailsSectionQRIS = document.getElementById('payment-details-section');
    const paymentMethodTextQRIS = document.getElementById('paymentMethodText');
    const paymentAmountTextQRIS = document.getElementById('paymentAmountText');
    const qrCodeContainerQRIS = document.getElementById('qrCodeContainer');
    const qrCodeImageQRIS = document.getElementById('qrCodeImage');
    const expiryTimeTextQRIS = document.getElementById('expiryTimeText');
    const paymentStatusTextQRIS = document.getElementById('paymentStatusText');
    const errorMessageQRIS = document.getElementById('errorMessage');

    if (payButtonQRIS && hargaNormalElementQRIS) { // Berarti kita di qris_payment.html
        const BASE_PRICE_QRIS = parseFloat(hargaNormalElementQRIS.textContent.replace(/[^0-9]/g, '')) || 30000;
        hargaNormalElementQRIS.textContent = BASE_PRICE_QRIS.toLocaleString('id-ID');

        payButtonQRIS.addEventListener('click', async () => {
            console.log("RENDERER: Tombol Bayar QRIS diklik");
            paymentStatusTextQRIS.textContent = 'Memproses...';
            paymentStatusTextQRIS.style.color = '#7f8c8d';
            errorMessageQRIS.style.display = 'none';
            paymentDetailsSectionQRIS.style.display = 'none';
            qrCodeContainerQRIS.style.display = 'none';
            payButtonQRIS.disabled = true;

            const voucherCode = voucherCodeInputQRIS.value.trim();
            let finalAmount = BASE_PRICE_QRIS;
            let discountAppliedForPayload = 0;
            let voucherCodeActuallyUsed = null;
            let electronInternalRef = `ELEC-QRIS-${Date.now()}`; // Buat ref internal unik

            try {
                if (voucherCode) {
                    console.log(`RENDERER: Mencoba validasi voucher: "${voucherCode}" dengan harga dasar: ${BASE_PRICE_QRIS}`);
                    const validationApiUrl = `${BACKEND_API_URL}/api/vouchers/validate`;
                    const validationPayload = { voucher_code: voucherCode, base_amount: BASE_PRICE_QRIS };
                    
                    const voucherResponse = await fetch(validationApiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify(validationPayload)
                    });
                    
                    console.log(`RENDERER: Status respons validasi voucher: ${voucherResponse.status}`);
                    const voucherResult = await voucherResponse.json(); // Selalu coba parse JSON
                    console.log("RENDERER: Respons validasi voucher dari API:", voucherResult);

                    if (!voucherResponse.ok || !voucherResult.success) {
                        throw new Error(voucherResult.message || `Gagal validasi voucher (status: ${voucherResponse.status})`);
                    }

                    finalAmount = voucherResult.finalAmount;
                    discountAppliedForPayload = voucherResult.discountApplied || (BASE_PRICE_QRIS - finalAmount);
                    voucherCodeActuallyUsed = voucherCode; // Simpan kode voucher yang berhasil dipakai
                    alert(`Voucher diterapkan: ${voucherResult.message}. Harga baru: Rp ${finalAmount.toLocaleString('id-ID')}`);
                }

                console.log(`RENDERER: Membuat transaksi QRIS. Base: ${BASE_PRICE_QRIS}, Diskon: ${discountAppliedForPayload}, Final: ${finalAmount}, Voucher: ${voucherCodeActuallyUsed || 'Tidak ada'}`);
                
                const qrisTransactionPayloadToMain = {
                    amount: finalAmount,
                    method: 'QRIS', // Ini hanya untuk info, karena di service akan di-set 'qris'
                    customer_name: 'Pelanggan ShooteraSnap',
                    customer_email: 'customer@shooterasnap.com',
                    order_items: [{
                        name: 'Sesi Photobooth' + (voucherCodeActuallyUsed ? ` (Voucher: ${voucherCodeActuallyUsed})` : ''),
                        price: finalAmount,
                        quantity: 1,
                    }],
                    paymentContext: {
                        base_amount_original: BASE_PRICE_QRIS,
                        discount_applied_calculated: discountAppliedForPayload,
                        voucher_code_actually_used: voucherCodeActuallyUsed,
                        electron_internal_ref: electronInternalRef
                    }
                };

                if (typeof window.electronAPI === 'undefined' || typeof window.electronAPI.createQrisTransaction !== 'function') {
                    throw new Error("Fungsi createQrisTransaction tidak tersedia di Electron API (preload.js).");
                }
                const midtransResult = await window.electronAPI.createQrisTransaction(qrisTransactionPayloadToMain);
                console.log("RENDERER: Respons dari createQrisTransaction (main process):", midtransResult);

                if (midtransResult.success && midtransResult.data) {
                    const paymentInfo = midtransResult.data;
                    paymentMethodTextQRIS.textContent = paymentInfo.payment_name || 'QRIS';
                    paymentAmountTextQRIS.textContent = parseInt(paymentInfo.amount).toLocaleString('id-ID');
                    
                    if (paymentInfo.qr_url) {
                        qrCodeImageQRIS.src = paymentInfo.qr_url;
                        qrCodeContainerQRIS.style.display = 'block';
                    }
                    if (paymentInfo.expired_time) {
                        expiryTimeTextQRIS.textContent = new Date(paymentInfo.expired_time * 1000).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'long' });
                    }
                    paymentDetailsSectionQRIS.style.display = 'block';
                    paymentStatusTextQRIS.textContent = `Menunggu Pembayaran (${paymentInfo.status})`;
                    
                    pollQrisStatus(paymentInfo.order_id, electronInternalRef); // Gunakan Order ID untuk polling
                } else {
                    throw new Error(midtransResult.message || "Gagal membuat transaksi QRIS via Electron main process.");
                }

            } catch (error) {
                console.error("RENDERER: Error pada proses pembayaran QRIS:", error);
                paymentStatusTextQRIS.textContent = 'Error';
                errorMessageQRIS.textContent = error.message;
                errorMessageQRIS.style.display = 'block';
                payButtonQRIS.disabled = false;
            }
        });
    }

    async function pollQrisStatus(orderId, electronRef) {
        console.log(`RENDERER: Memulai polling untuk Midtrans Order ID: ${orderId}`);
        paymentStatusTextQRIS.textContent = 'Mengecek status pembayaran...';
        let attempts = 0;
        const maxAttempts = 120; // Polling hingga 10 menit
        const interval = 5000;

        const intervalId = setInterval(async () => {
            if (attempts >= maxAttempts) {
                clearInterval(intervalId);
                paymentStatusTextQRIS.textContent = 'Timeout pengecekan status.';
                errorMessageQRIS.textContent = 'Gagal mendapatkan status pembayaran setelah beberapa saat.';
                errorMessageQRIS.style.display = 'block';
                payButtonQRIS.disabled = false;
                return;
            }
            attempts++;
            try {
                if (typeof window.electronAPI === 'undefined' || typeof window.electronAPI.checkQrisStatus !== 'function') {
                    throw new Error("Fungsi checkQrisStatus tidak tersedia.");
                }
                // Kirim objek ke main.js
                const statusResult = await window.electronAPI.checkQrisStatus({ 
                    order_id: orderId, 
                    electronRef: electronRef // Kirim juga ref internal jika perlu
                });
                console.log("RENDERER: Respons status QRIS dari main process:", statusResult);

                if (statusResult.success && statusResult.data) {
                    paymentStatusTextQRIS.textContent = `Status: ${statusResult.data.status}`;
                    if (statusResult.data.status === 'PAID') {
                        clearInterval(intervalId);
                        paymentStatusTextQRIS.textContent = 'Pembayaran LUNAS!';
                        paymentStatusTextQRIS.style.color = 'green';
                        paymentDetailsSectionQRIS.style.display = 'none';
                        alert('Pembayaran QRIS Berhasil! Photobooth akan dimulai.');
                        if (typeof window.electronAPI.startDslrBooth === 'function') {
                            window.electronAPI.startDslrBooth();
                        } else { console.error("Fungsi startDslrBooth tidak tersedia.");}
                        // setTimeout(() => goToPage("index.html"), 3000); // Dikomentari untuk tes trigger dari dslrBooth
                    } else if (statusResult.data.status === 'EXPIRED' || statusResult.data.status === 'CANCEL' || statusResult.data.status === 'DENY') {
                        clearInterval(intervalId);
                        paymentStatusTextQRIS.textContent = `Pembayaran ${statusResult.data.status}`;
                        paymentStatusTextQRIS.style.color = 'red';
                        errorMessageQRIS.textContent = `Pembayaran ${statusResult.data.status}. Silakan coba buat transaksi baru.`;
                        errorMessageQRIS.style.display = 'block';
                        payButtonQRIS.disabled = false;
                    }
                }
            } catch (error) { 
                console.error("RENDERER: Error saat polling status QRIS:", error);
                // Pertimbangkan untuk menghentikan polling jika ada error fundamental
                // clearInterval(intervalId);
                // paymentStatusTextQRIS.textContent = 'Error polling.';
                // errorMessageQRIS.textContent = error.message;
                // errorMessageQRIS.style.display = 'block';
                // payButtonQRIS.disabled = false;
            }
        }, interval);
    }

    // --- Logika untuk kode_payment.html ---
    const kodePembayaranInput = document.getElementById('kodePembayaran');
    const verifikasiKodeButton = document.querySelector('button[onclick="verifikasiKode()"]'); // Ambil dengan selector onclick
    const messageBoxKode = document.getElementById('messageBox');

    if (kodePembayaranInput && verifikasiKodeButton && messageBoxKode) {
        // Ganti onclick dengan event listener
        verifikasiKodeButton.removeAttribute('onclick');
        verifikasiKodeButton.id = 'verifikasiKodeButton'; // Beri ID
        
        verifikasiKodeButton.addEventListener('click', async () => {
            console.log("RENDERER: Tombol Verifikasi Kode diklik");
            const kode = kodePembayaranInput.value.trim();
            messageBoxKode.textContent = 'Memverifikasi kode...';
            messageBoxKode.className = 'message';
            verifikasiKodeButton.disabled = true;

            if (kode === "") {
                messageBoxKode.textContent = "Silakan masukkan kode pembayaran.";
                messageBoxKode.className = "message error";
                verifikasiKodeButton.disabled = false;
                return;
            }

            try {
                console.log(`RENDERER: Mengirim kode cash "${kode}" ke API backend...`);
                const response = await fetch(`${BACKEND_API_URL}/api/cash-codes/redeem`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Accept': 'application/json'
                        // 'X-Electron-App-Id': await window.electronAPI.getElectronAppId() // Jika perlu
                    },
                    body: JSON.stringify({ cash_code: kode })
                });
                
                const result = await response.json();
                console.log("RENDERER: Respons dari redeem cash code API:", result);

                if (result.success) {
                    messageBoxKode.textContent = `Kode valid! ${result.message || ''} Photobooth akan dimulai.`;
                    messageBoxKode.className = "message success";
                    alert('Pembayaran dengan Kode Berhasil! Photobooth akan dimulai.');
                    if (typeof window.electronAPI.startDslrBooth === 'function') {
                        window.electronAPI.startDslrBooth();
                    }
                    // setTimeout(() => goToPage("index.html"), 3000); // Dikomentari untuk tes trigger dari dslrBooth
                } else {
                    messageBoxKode.textContent = result.message || "Kode salah atau tidak valid.";
                    messageBoxKode.className = "message error";
                }
            } catch (error) {
                console.error("RENDERER: Error saat verifikasi kode cash:", error);
                messageBoxKode.textContent = "Terjadi kesalahan koneksi atau server.";
                messageBoxKode.className = "message error";
            } finally {
                verifikasiKodeButton.disabled = false;
            }
        });

        kodePembayaranInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                verifikasiKodeButton.click();
            }
        });
    }

    // Tombol kembali global
    const backButtons = document.querySelectorAll(".back-button");
    if (backButtons.length > 0) {
        backButtons.forEach(button => {
            button.addEventListener("click", () => {
                if (currentPagePath.includes('qris_payment.html') || currentPagePath.includes('kode_payment.html')) {
                    goToPage("payment.html");
                } else if (currentPagePath.includes('payment.html')) {
                    goToPage("index.html");
                } else {
                    window.history.back(); // Fallback
                }
            });
        });
    }
});

// Fungsi global jika masih ada onclick di HTML (sebaiknya dihindari dan diganti dengan listener)
function goToQRIS() { window.location.href = "qris_payment.html"; }
function goToKode() { window.location.href = "kode_payment.html"; }
function verifikasiKode() { 
    console.warn("Fungsi verifikasiKode() global dipanggil. Sebaiknya gunakan event listener."); 
    document.getElementById('verifikasiKodeButton')?.click(); 
}
function goBack() { 
    console.warn("Fungsi goBack() global dipanggil. Sebaiknya gunakan event listener.");
    const path = window.location.pathname;
    if (path.includes('qris_payment.html') || path.includes('kode_payment.html')) {
        window.location.href = "payment.html";
    } else if (path.includes('payment.html')) {
         window.location.href = "index.html";
    } else {
        window.history.back();
    }
}
