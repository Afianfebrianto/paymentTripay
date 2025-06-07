// renderer.js (Update untuk Desain Baru & Countdown)

document.addEventListener('DOMContentLoaded', () => {
    const currentPagePath = window.location.pathname;
    console.log("Renderer JS Loaded for page:", currentPagePath);

    const BACKEND_API_URL = 'http://localhost:4000'; 

    // --- Fungsi Navigasi ---
    function goToPage(page) {
        console.log(`Renderer: Navigating to ${page}...`);
        window.location.href = page;
    }

    // --- Logika Halaman Awal (index.html) ---
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.addEventListener('click', () => goToPage('payment.html'));
    }

    // --- Logika Halaman Pilih Metode (payment.html) ---
    const qrisMethodButton = document.getElementById('qrisMethod');
    if (qrisMethodButton) qrisMethodButton.addEventListener('click', () => goToPage('qris_payment.html'));
    
    const kodeMethodButton = document.getElementById('kodeMethod');
    if (kodeMethodButton) kodeMethodButton.addEventListener('click', () => goToPage('kode_payment.html'));
    
    const backButtonToIndex = document.getElementById('backButtonToIndex');
    if (backButtonToIndex) backButtonToIndex.addEventListener('click', () => goToPage('index.html'));


    // --- Logika Halaman Pembayaran QRIS (qris_payment.html) ---
    const qrisPageElements = {
        voucherInputContainer: document.getElementById('voucherInputContainer'),
        paymentDetailsSection: document.getElementById('paymentDetailsSection'),
        payButton: document.getElementById('payButton'),
        voucherCodeInput: document.getElementById('voucherCode'),
        hargaNormalElement: document.getElementById('hargaNormal'),
        paymentAmountText: document.getElementById('paymentAmountText'),
        qrCodeImage: document.getElementById('qrCodeImage'),
        expiryTimeText: document.getElementById('expiryTimeText'),
        paymentStatusText: document.getElementById('paymentStatusText'),
        errorMessage: document.getElementById('errorMessage'),
        backButton1: document.getElementById('backToPaymentMethod'),
        backButton2: document.getElementById('backAfterQr')
    };

    if (qrisPageElements.payButton) {
        const BASE_PRICE_QRIS = parseFloat(qrisPageElements.hargaNormalElement.textContent.replace(/[^0-9]/g, '')) || 35000;
        qrisPageElements.hargaNormalElement.textContent = BASE_PRICE_QRIS.toLocaleString('id-ID');
        
        if(qrisPageElements.backButton1) qrisPageElements.backButton1.addEventListener('click', () => goToPage('payment.html'));
        if(qrisPageElements.backButton2) qrisPageElements.backButton2.addEventListener('click', () => goToPage('payment.html'));

        qrisPageElements.payButton.addEventListener('click', handleQrisPayment);
        
        async function handleQrisPayment() {
    // Referensi ke elemen UI
    const payButton = document.getElementById('payButton');
    const voucherCodeInput = document.getElementById('voucherCode');
    const errorMessageElement = document.getElementById('errorMessage');
    const paymentStatusTextElement = document.getElementById('paymentStatusText');
    const voucherInputContainer = document.getElementById('voucherInputContainer');
    const paymentDetailsSection = document.getElementById('paymentDetailsSection');
    const hargaNormalElement = document.getElementById('hargaNormal');
    
    // Reset UI dan nonaktifkan tombol
    payButton.disabled = true;
    payButton.textContent = "Memproses...";
    errorMessageElement.style.display = 'none';
    errorMessageElement.textContent = '';
    
    const BASE_PRICE_QRIS = parseFloat(hargaNormalElement.textContent.replace(/[^0-9]/g, '')) || 35000;
    const voucherCode = voucherCodeInput.value.trim();
    let finalAmount = BASE_PRICE_QRIS;
    let discountApplied = 0;
    let voucherCodeUsed = null;

    try {
        // Hanya jalankan blok ini jika ada voucher yang dimasukkan
        if (voucherCode) {
            console.log(`RENDERER: Mencoba validasi voucher: "${voucherCode}"`);
            const validationApiUrl = `http://localhost:4000/api/vouchers/validate`;
            const validationPayload = { voucher_code: voucherCode, base_amount: BASE_PRICE_QRIS };

            const response = await fetch(validationApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(validationPayload)
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                // Jika validasi gagal, lempar error dengan pesan dari server
                throw new Error(result.message || "Kode voucher tidak valid.");
            }

            // Jika validasi sukses, perbarui nilainya
            finalAmount = result.finalAmount;
            discountApplied = result.discountApplied;
            voucherCodeUsed = voucherCode;
            console.log(`RENDERER: Voucher valid. Harga baru: ${finalAmount}`);
            alert(`Voucher diterapkan: ${result.message}. Harga baru: Rp ${finalAmount.toLocaleString('id-ID')}`);
        }

        // Lanjutkan untuk membuat transaksi ke Midtrans (baik dengan harga diskon maupun harga normal)
        console.log(`RENDERER: Membuat transaksi QRIS dengan harga final: ${finalAmount}`);
        const payloadToMain = {
            amount: finalAmount,
            order_items: [{ name: 'Sesi Photobooth', price: finalAmount, quantity: 1 }],
            paymentContext: {
                base_amount_original: BASE_PRICE_QRIS,
                discount_applied_calculated: discountApplied,
                voucher_code_actually_used: voucherCodeUsed,
                electron_internal_ref: `ELEC-QRIS-${Date.now()}`
            }
        };

        const midtransResult = await window.electronAPI.createQrisTransaction(payloadToMain);
        if (!midtransResult.success || !midtransResult.data) {
            throw new Error(midtransResult.message || "Gagal membuat transaksi QRIS.");
        }

        // Transisi UI untuk menampilkan QR Code
        voucherInputContainer.style.display = 'none';
        paymentDetailsSection.style.display = 'block';

        // Isi detail pembayaran QR
        const paymentInfo = midtransResult.data;
        document.getElementById('paymentAmountText').textContent = parseInt(paymentInfo.amount).toLocaleString('id-ID');
        document.getElementById('qrCodeImage').src = paymentInfo.qr_url;
        document.getElementById('expiryTimeText').textContent = new Date(paymentInfo.expired_time * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit'});
        paymentStatusTextElement.textContent = `Menunggu Pembayaran`;
        
        pollQrisStatus(paymentInfo.order_id); // Mulai polling status

    } catch (error) {
        // Blok catch ini akan menangani semua error (baik dari fetch voucher maupun dari createQrisTransaction)
        console.error("RENDERER: Error pada proses pembayaran:", error);
        errorMessageElement.textContent = error.message;
        errorMessageElement.style.display = 'block';
        payButton.disabled = false; // Aktifkan kembali tombol jika ada error
        payButton.textContent = "Bayar";
    }
}

        async function pollQrisStatus(orderId) {
            let attempts = 0;
            const maxAttempts = 120; // 10 menit
            const interval = 5000;

            const intervalId = setInterval(async () => {
                if (attempts >= maxAttempts) {
                    clearInterval(intervalId);
                    qrisPageElements.paymentStatusText.textContent = 'Waktu habis.';
                    qrisPageElements.paymentStatusText.classList.add('error');
                    qrisPageElements.backButton2.style.display = 'block'; // Tampilkan tombol kembali jika timeout
                    return;
                }
                attempts++;
                try {
                    const statusResult = await window.electronAPI.checkQrisStatus({ order_id: orderId });
                    if (statusResult.success && statusResult.data.status === 'PAID') {
                        clearInterval(intervalId);
                        console.log("RENDERER: Pembayaran QRIS LUNAS. Mengarahkan ke halaman sukses.");
                        goToPage("success.html"); 
                    } else if (statusResult.success && statusResult.data && ['EXPIRED', 'CANCEL', 'DENY'].includes(statusResult.data.status)) {
                        clearInterval(intervalId);
                        qrisPageElements.paymentStatusText.textContent = `Pembayaran ${statusResult.data.status}`;
                        qrisPageElements.paymentStatusText.classList.add('error');
                        qrisPageElements.backButton2.style.display = 'block';
                    }
                } catch (err) { console.error("Error polling:", err); }
            }, interval);
        }
    }

    // --- Logika Halaman Kode Pembayaran (kode_payment.html) ---
    const claimCodeButton = document.getElementById('claimCodeButton');
    const kodePembayaranInput = document.getElementById('kodePembayaran');
    const messageBoxKode = document.getElementById('messageBox');
    const backButtonFromCode = document.getElementById('backToPaymentMethodFromCode');

    if (claimCodeButton) {
        if (backButtonFromCode) backButtonFromCode.addEventListener('click', () => goToPage('payment.html'));

        claimCodeButton.addEventListener('click', async () => {
            claimCodeButton.disabled = true;
            claimCodeButton.textContent = 'Memverifikasi...';
            messageBoxKode.textContent = '';
            messageBoxKode.className = 'message-box';

            const kode = kodePembayaranInput.value.trim();
            if (kode === "") {
                messageBoxKode.textContent = "Silakan masukkan kode pembayaran.";
                messageBoxKode.className = "message-box error";
                claimCodeButton.disabled = false;
                claimCodeButton.textContent = 'Klaim Sekarang';
                return;
            }

            try {
                const response = await fetch(`${BACKEND_API_URL}/api/cash-codes/redeem`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cash_code: kode })
                });
                const result = await response.json();

                if (result.success) {
                    console.log("RENDERER: Kode cash valid. Mengarahkan ke halaman sukses.");
                    goToPage("success.html");
                } else {
                    messageBoxKode.textContent = result.message || "Kode salah atau tidak valid.";
                    messageBoxKode.className = "message-box error";
                }
            } catch (error) {
                messageBoxKode.textContent = "Terjadi kesalahan koneksi.";
                messageBoxKode.className = "message-box error";
            } finally {
                claimCodeButton.disabled = false;
                claimCodeButton.textContent = 'Klaim Sekarang';
            }
        });

        if (kodePembayaranInput) {
            kodePembayaranInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") claimCodeButton.click();
            });
        }
    }

    // --- LOGIKA BARU UNTUK HALAMAN SUKSES (success.html) ---
    const countdownTimerElement = document.getElementById('countdownTimer');
    if (countdownTimerElement) {
        console.log("RENDERER: Berada di halaman sukses, memulai hitung mundur.");
        let countdown = 3;
        countdownTimerElement.textContent = countdown;

        const timerInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                console.log(`RENDERER: Countdown: ${countdown}`);
                countdownTimerElement.textContent = countdown;
            } else {
                clearInterval(timerInterval);
                countdownTimerElement.textContent = "Go!";
                console.log("RENDERER: Countdown selesai. Memicu DSLRBooth...");
                
                if (typeof window.electronAPI.startDslrBooth === 'function') {
                    window.electronAPI.startDslrBooth();
                } else {
                    console.error("Fungsi startDslrBooth tidak tersedia.");
                    alert("Gagal memulai photobooth. Hubungi kasir.");
                }

                // Setelah beberapa saat, kembali ke halaman awal untuk pelanggan berikutnya
                setTimeout(() => {
                    console.log("RENDERER: Kembali ke halaman awal (index.html).");
                    goToPage("index.html");
                }, 2000); // Tunggu 2 detik setelah DSLRBooth dipicu
            }
        }, 1000); // Update setiap 1 detik
    }

    // --- LOGIKA BARU UNTUK KEYBOARD VIRTUAL (kode_payment.html) ---
    const keyboardContainer = document.getElementById('virtual-keyboard');
    const kodePembayaranInputForKeyboard = document.getElementById('kodePembayaran');

    if (keyboardContainer && kodePembayaranInputForKeyboard) {
        console.log("RENDERER: Keyboard virtual diinisialisasi.");
        const keysLayout = [
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
            ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
            ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
            ["Z", "X", "C", "V", "B", "N", "M"],
            ["Backspace", "Clear"]
        ];
        
        // Buat tombol keyboard
        keysLayout.forEach(row => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'keyboard-row';
            row.forEach(key => {
                const keyButton = document.createElement('button');
                keyButton.className = 'keyboard-key';
                keyButton.dataset.key = key;

                switch(key) {
                    case "Backspace":
                        keyButton.innerHTML = '<i class="fas fa-backspace"></i>';
                        keyButton.classList.add('key-special');
                        break;
                    case "Clear":
                        keyButton.textContent = 'Clear';
                        keyButton.classList.add('key-special');
                        break;
                    default:
                        keyButton.textContent = key;
                        break;
                }
                rowDiv.appendChild(keyButton);
            });
            keyboardContainer.appendChild(rowDiv);
        });

        // Tambahkan event listener ke container keyboard untuk efisiensi (event delegation)
        keyboardContainer.addEventListener('click', (e) => {
            const target = e.target.closest('.keyboard-key');
            if (!target) return;

            const key = target.dataset.key;

            if (key === "Backspace") {
                kodePembayaranInputForKeyboard.value = kodePembayaranInputForKeyboard.value.slice(0, -1);
            } else if (key === "Clear") {
                kodePembayaranInputForKeyboard.value = "";
            } else {
                kodePembayaranInputForKeyboard.value += key;
            }
            
            // Beri fokus kembali ke input field setelah tombol ditekan
            kodePembayaranInputForKeyboard.focus();
        });
    }
});
