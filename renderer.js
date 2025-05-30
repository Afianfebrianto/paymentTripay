// renderer.js
document.addEventListener('DOMContentLoaded', () => {
    const hargaNormalElement = document.getElementById('hargaNormal');
    const voucherCodeInput = document.getElementById('voucherCode');
    const payButton = document.getElementById('payButton');

    const paymentDetailsSection = document.getElementById('payment-details-section');
    const paymentInstructionsDiv = document.getElementById('payment-instructions');
    const instructionTextElement = document.getElementById('instruction-text'); // Tidak dipakai di HTML, tapi bisa ditambahkan
    const paymentMethodTextElement = document.getElementById('paymentMethodText');
    const paymentAmountTextElement = document.getElementById('paymentAmountText');
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const qrCodeImage = document.getElementById('qrCodeImage');
    const vaContainer = document.getElementById('vaContainer');
    const vaNumberTextElement = document.getElementById('vaNumberText');
    const paymentLinkContainer = document.getElementById('paymentLinkContainer');
    const externalPaymentLink = document.getElementById('externalPaymentLink');
    const expiryTimeTextElement = document.getElementById('expiryTimeText');

    const paymentStatusTextElement = document.getElementById('paymentStatusText');
    const errorMessageElement = document.getElementById('errorMessage');

    const dslrboothStatusSection = document.getElementById('dslrbooth-status-section');
    const dslrboothStatusTextElement = document.getElementById('dslrboothStatusText');

    const BASE_PRICE = 50000; // Harga normal produk/sesi
    const DEFAULT_PAYMENT_METHOD = 'QRIS'; // Metode pembayaran default

    hargaNormalElement.textContent = BASE_PRICE.toLocaleString('id-ID');

    payButton.addEventListener('click', async () => {
        // Reset UI
        paymentStatusTextElement.textContent = 'Memproses...';
        paymentStatusTextElement.style.color = '#7f8c8d';
        errorMessageElement.style.display = 'none';
        paymentDetailsSection.style.display = 'none';
        qrCodeContainer.style.display = 'none';
        qrCodeImage.src = '';
        vaContainer.style.display = 'none';
        paymentLinkContainer.style.display = 'none';
        payButton.disabled = true;

        const voucherCode = voucherCodeInput.value.trim();
        let amountToPay = BASE_PRICE; // Default ke harga normal

        // Data yang akan dikirim ke main process
        const paymentDataForMain = {
            // Amount akan ditentukan setelah validasi voucher (jika ada) di main process
            // Untuk sekarang, kirim base price dan voucher code, biarkan main process yang hitung.
            base_amount: BASE_PRICE,
            method: DEFAULT_PAYMENT_METHOD, // atau ambil dari pilihan user jika ada
            customer_name: 'Pelanggan Photobooth', // Bisa dibuat lebih dinamis
            customer_email: 'pelanggan@example.com', // Bisa dibuat lebih dinamis
            customer_phone: '08123456789', // Bisa dibuat lebih dinamis
            itemName: 'Sesi Photobooth Kilat',
            voucher_code: voucherCode || null // Kirim null jika kosong
        };

        try {
            // Panggil fungsi createPayment yang diekspos oleh preload.js
            // window.electronAPI.createPayment akan mengembalikan promise
            console.log('Mengirim data ke main process:', paymentDataForMain);
            const result = await window.electronAPI.requestCreatePayment(paymentDataForMain);
            console.log('Hasil dari main process:', result);

            if (result && result.success && result.data) {
                const paymentInfo = result.data;
                paymentStatusTextElement.textContent = `Menunggu Pembayaran (${paymentInfo.status})`;
                paymentStatusTextElement.style.color = '#e67e22';
                paymentDetailsSection.style.display = 'block';

                paymentMethodTextElement.textContent = paymentInfo.payment_name || paymentDataForMain.method;
                paymentAmountTextElement.textContent = parseInt(paymentInfo.amount).toLocaleString('id-ID');

                // Tampilkan instruksi berdasarkan metode pembayaran
                if (paymentInfo.qr_url) {
                    qrCodeImage.src = paymentInfo.qr_url;
                    qrCodeContainer.style.display = 'block';
                } else if (paymentInfo.pay_code) {
                    vaNumberTextElement.textContent = paymentInfo.pay_code;
                    vaContainer.style.display = 'block';
                } else if (paymentInfo.checkout_url) {
                    externalPaymentLink.href = paymentInfo.checkout_url;
                    paymentLinkContainer.style.display = 'block';
                    // Opsional: buka otomatis di browser eksternal
                    // window.electronAPI.openExternalLink(paymentInfo.checkout_url);
                }

                if (paymentInfo.expired_time) {
                    expiryTimeTextElement.textContent = new Date(paymentInfo.expired_time * 1000).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'long'});
                }

                // Polling status sudah dimulai di main process, kita hanya perlu menunggu update
            } else {
                const message = result && result.message ? result.message : 'Gagal membuat transaksi. Silakan coba lagi.';
                paymentStatusTextElement.textContent = 'Gagal';
                paymentStatusTextElement.style.color = '#e74c3c';
                errorMessageElement.textContent = message;
                errorMessageElement.style.display = 'block';
                payButton.disabled = false;
            }
        } catch (error) {
            console.error('Error di renderer saat createPayment:', error);
            paymentStatusTextElement.textContent = 'Error Aplikasi';
            paymentStatusTextElement.style.color = '#e74c3c';
            errorMessageElement.textContent = 'Terjadi kesalahan pada aplikasi: ' + error.message;
            errorMessageElement.style.display = 'block';
            payButton.disabled = false;
        }
    });

    // Listener untuk update status pembayaran dari main process
    if (window.electronAPI && window.electronAPI.onPaymentStatusUpdate) {
        window.electronAPI.onPaymentStatusUpdate((update) => {
            console.log('Menerima update status pembayaran:', update);
            paymentStatusTextElement.textContent = `${update.status} (Ref: ${update.reference || 'N/A'})`;

            if (update.status === 'PAID') {
                paymentStatusTextElement.style.color = '#2ecc71';
                paymentDetailsSection.style.display = 'none'; // Sembunyikan detail pembayaran awal
                errorMessageElement.style.display = 'none';
                alert(`Pembayaran LUNAS untuk referensi ${update.reference}! Photobooth akan segera dimulai.`);
                // Tombol bayar bisa tetap disabled atau di-enable untuk transaksi baru
            } else if (update.status === 'EXPIRED' || update.status === 'FAILED') {
                paymentStatusTextElement.style.color = '#e74c3c';
                errorMessageElement.textContent = `Pembayaran ${update.status}. ${update.message || ''}`;
                errorMessageElement.style.display = 'block';
                payButton.disabled = false; // Izinkan coba lagi
            } else if (update.status === 'TIMEOUT' || update.status === 'POLLING_ERROR') {
                paymentStatusTextElement.style.color = '#f39c12';
                errorMessageElement.textContent = update.message || 'Gagal mengecek status pembayaran.';
                errorMessageElement.style.display = 'block';
                payButton.disabled = false; // Izinkan coba lagi jika polling error atau timeout (tergantung kebijakan)
            }
        });
    }

    // Listener untuk status dslrbooth dari main process
    if (window.electronAPI && window.electronAPI.onDslrBoothStatusUpdate) {
        window.electronAPI.onDslrBoothStatusUpdate((update) => {
            console.log('Menerima update status dslrbooth:', update);
            dslrboothStatusSection.style.display = 'block';
            dslrboothStatusTextElement.textContent = `DSLRBooth: ${update.message}`;
            if (update.status === 'error') {
                dslrboothStatusTextElement.style.color = '#e74c3c';
            } else {
                dslrboothStatusTextElement.style.color = '#27ae60';
            }
        });
    }
});