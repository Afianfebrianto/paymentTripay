// renderer.js
document.addEventListener('DOMContentLoaded', () => {
    const hargaNormalElement = document.getElementById('hargaNormal');
    const voucherCodeInput = document.getElementById('voucherCode');
    const payButton = document.getElementById('payButton');

    const paymentDetailsSection = document.getElementById('payment-details-section');
    const paymentInstructionsDiv = document.getElementById('payment-instructions');
    const paymentMethodTextElement = document.getElementById('paymentMethodText');
    const paymentAmountTextElement = document.getElementById('paymentAmountText');
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const qrCodeImage = document.getElementById('qrCodeImage');
    const vaContainer = document.getElementById('vaContainer');
    const vaNumberTextElement = document.getElementById('vaNumberText');
    const paymentLinkContainer = document.getElementById('paymentLinkContainer');
    const externalPaymentLink = document.getElementById('externalPaymentLink');
    const expiryTimeTextElement = document.getElementById('expiryTimeText');
    // const voucherInfoDisplay = document.getElementById('voucherInfoDisplay'); // Akan dibuat jika perlu

    const paymentStatusTextElement = document.getElementById('paymentStatusText');
    const errorMessageElement = document.getElementById('errorMessage');

    const dslrboothStatusSection = document.getElementById('dslrbooth-status-section');
    const dslrboothStatusTextElement = document.getElementById('dslrboothStatusText');

    const BASE_PRICE = 35000; // Harga normal produk/sesi, sesuaikan
    const DEFAULT_PAYMENT_METHOD = 'QRIS'; // Metode pembayaran default

    hargaNormalElement.textContent = BASE_PRICE.toLocaleString('id-ID');

    function clearVoucherInfoDisplay() {
        const existingVoucherInfo = document.getElementById('voucherInfoDisplay');
        if (existingVoucherInfo) {
            existingVoucherInfo.textContent = '';
            existingVoucherInfo.style.display = 'none';
        }
    }
    
    function displayVoucherInfo(message, color = 'green') {
        let voucherInfoEl = document.getElementById('voucherInfoDisplay');
        if (!voucherInfoEl) {
            voucherInfoEl = document.createElement('p');
            voucherInfoEl.id = 'voucherInfoDisplay';
            // Sisipkan sebelum paymentInstructionsDiv atau di tempat yang sesuai
            // Jika paymentDetailsSection adalah parent dari paymentInstructionsDiv
            if (paymentInstructionsDiv && paymentInstructionsDiv.parentNode === paymentDetailsSection) {
                 paymentDetailsSection.insertBefore(voucherInfoEl, paymentInstructionsDiv);
            } else { // Fallback, tambahkan ke paymentDetailsSection jika ada
                paymentDetailsSection.appendChild(voucherInfoEl);
            }
        }
        voucherInfoEl.textContent = message;
        voucherInfoEl.style.color = color;
        voucherInfoEl.style.display = 'block';
        voucherInfoEl.style.marginBottom = '10px';
        voucherInfoEl.style.fontWeight = 'bold';
    }


    function resetUIForNextCustomer() {
        console.log("Renderer: Mereset UI untuk pelanggan berikutnya...");
        voucherCodeInput.value = '';
        
        paymentStatusTextElement.textContent = 'Menunggu Aksi';
        paymentStatusTextElement.style.color = '#333';
        
        errorMessageElement.style.display = 'none';
        errorMessageElement.textContent = '';
        
        paymentDetailsSection.style.display = 'none';
        qrCodeContainer.style.display = 'none';
        qrCodeImage.src = '';
        vaContainer.style.display = 'none';
        vaNumberTextElement.textContent = '-';
        paymentLinkContainer.style.display = 'none';
        externalPaymentLink.href = '#';
        paymentMethodTextElement.textContent = '-';
        paymentAmountTextElement.textContent = '-';
        expiryTimeTextElement.textContent = '-';

        clearVoucherInfoDisplay();
        
        dslrboothStatusSection.style.display = 'none';
        dslrboothStatusTextElement.textContent = '';
        
        payButton.disabled = false;
        console.log("Renderer: UI direset, tombol bayar diaktifkan.");
    }

    // Panggil resetUI saat halaman pertama kali dimuat
    resetUIForNextCustomer(); 

    payButton.addEventListener('click', async () => {
        paymentStatusTextElement.textContent = 'Memproses permintaan...';
        paymentStatusTextElement.style.color = '#7f8c8d';
        errorMessageElement.style.display = 'none';
        errorMessageElement.textContent = '';
        paymentDetailsSection.style.display = 'none'; // Sembunyikan detail lama
        dslrboothStatusSection.style.display = 'none';
        dslrboothStatusTextElement.textContent = '';
        clearVoucherInfoDisplay(); // Bersihkan info voucher lama

        payButton.disabled = true;

        const voucherCode = voucherCodeInput.value.trim();
        
        const paymentDataForMain = {
            base_amount: BASE_PRICE,
            method: DEFAULT_PAYMENT_METHOD,
            customer_name: 'Pelanggan Photobooth', // Bisa dibuat lebih dinamis
            customer_email: 'pelanggan@example.com', // Bisa dibuat lebih dinamis
            customer_phone: '08123456789', // Bisa dibuat lebih dinamis
            itemName: 'Sesi Photobooth Kilat',
            voucher_code: voucherCode || null
        };

        try {
            console.log('Renderer: Mengirim data ke main process untuk createPayment:', paymentDataForMain);
            const result = await window.electronAPI.requestCreatePayment(paymentDataForMain);
            console.log('Renderer: Hasil dari main process (createPayment):', result);

            if (result && result.success && result.data) {
                const paymentInfo = result.data;
                const voucherMessageFromServer = result.voucher_message;

                if (paymentInfo.status === 'PAID' && paymentInfo.amount === 0) {
                    paymentStatusTextElement.textContent = `LUNAS (${voucherMessageFromServer || 'Diskon Penuh'})`;
                    paymentStatusTextElement.style.color = '#2ecc71';
                    paymentDetailsSection.style.display = 'none';
                    // DSLRBooth sudah dipicu dari main.js, UI akan direset oleh onPaymentStatusUpdate
                    return; 
                }

                paymentStatusTextElement.textContent = `Menunggu Pembayaran (${paymentInfo.status || 'N/A'})`;
                paymentStatusTextElement.style.color = '#e67e22';
                paymentDetailsSection.style.display = 'block';

                if (voucherMessageFromServer) {
                    displayVoucherInfo(voucherMessageFromServer);
                }
                
                paymentMethodTextElement.textContent = paymentInfo.payment_name || paymentDataForMain.method;
                paymentAmountTextElement.textContent = parseInt(paymentInfo.amount).toLocaleString('id-ID');

                qrCodeContainer.style.display = 'none'; // Reset dulu
                vaContainer.style.display = 'none';
                paymentLinkContainer.style.display = 'none';

                if (paymentInfo.qr_url) {
                    qrCodeImage.src = paymentInfo.qr_url;
                    qrCodeContainer.style.display = 'block';
                } else if (paymentInfo.pay_code) {
                    vaNumberTextElement.textContent = paymentInfo.pay_code;
                    vaContainer.style.display = 'block';
                } else if (paymentInfo.checkout_url) {
                    externalPaymentLink.href = paymentInfo.checkout_url;
                    paymentLinkContainer.style.display = 'block';
                }

                if (paymentInfo.expired_time) {
                    expiryTimeTextElement.textContent = new Date(paymentInfo.expired_time * 1000).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'long'});
                }
            } else {
                const message = result && result.message ? result.message : 'Gagal membuat permintaan pembayaran. Silakan coba lagi.';
                paymentStatusTextElement.textContent = 'Permintaan Gagal';
                paymentStatusTextElement.style.color = '#e74c3c';
                errorMessageElement.textContent = message;
                errorMessageElement.style.display = 'block';
                payButton.disabled = false;
            }
        } catch (error) {
            console.error('Renderer: Error di renderer saat requestCreatePayment:', error);
            paymentStatusTextElement.textContent = 'Error Aplikasi';
            paymentStatusTextElement.style.color = '#e74c3c';
            errorMessageElement.textContent = 'Terjadi kesalahan pada aplikasi: ' + (error.message || error);
            errorMessageElement.style.display = 'block';
            payButton.disabled = false;
        }
    });

    if (window.electronAPI && window.electronAPI.onPaymentStatusUpdate) {
        window.electronAPI.onPaymentStatusUpdate((update) => {
            console.log('Renderer: Menerima update status pembayaran:', update);
            
            let statusDisplay = update.status;
            if (update.status === 'EXPIRED') statusDisplay = 'Kedaluwarsa';
            if (update.status === 'FAILED') statusDisplay = 'Gagal';
            if (update.status === 'PAID') statusDisplay = 'LUNAS';

            let statusMessage = `Status: ${statusDisplay}`;
            if (update.reference || (update.data && update.data.merchant_ref)) {
                statusMessage += ` (Ref: ${update.reference || (update.data && update.data.merchant_ref)})`;
            }
            paymentStatusTextElement.textContent = statusMessage;

            clearVoucherInfoDisplay(); // Bersihkan info voucher lama sebelum menampilkan pesan baru

            if (update.status === 'PAID') {
                paymentStatusTextElement.style.color = '#2ecc71';
                paymentDetailsSection.style.display = 'none';
                errorMessageElement.style.display = 'none'; // Sembunyikan error message jika ada
                
                if (update.message) { // Pesan ini dari main.js bisa berisi info voucher
                    displayVoucherInfo(update.message, '#2ecc71'); // Tampilkan dengan warna sukses
                } else {
                    displayVoucherInfo('Pembayaran Sukses!', '#2ecc71');
                }
                
                // Beri jeda sebelum mereset UI agar pengguna bisa lihat status LUNAS & pesan voucher
                setTimeout(() => {
                    resetUIForNextCustomer();
                    paymentStatusTextElement.textContent = "Siap untuk pelanggan berikutnya.";
                    paymentStatusTextElement.style.color = '#27ae60'; // Warna hijau lembut
                    setTimeout(() => { // Hapus pesan "Siap untuk..." setelah beberapa detik
                        if(paymentStatusTextElement.textContent === "Siap untuk pelanggan berikutnya."){
                           resetUIForNextCustomer();
                        }
                    }, 3000); 
                }, 4000); // Total waktu sebelum UI benar-benar bersih untuk input baru

            } else if (update.status === 'FAILED' || update.status === 'EXPIRED') {
                paymentStatusTextElement.style.color = '#e74c3c';
                errorMessageElement.textContent = `Pembayaran ${statusDisplay}. ${update.message || (update.data && update.data.note) || 'Silakan coba lagi.'}`;
                errorMessageElement.style.display = 'block';
                paymentDetailsSection.style.display = 'none';
                payButton.disabled = false;
                console.log(`Renderer: Pembayaran ${update.status}. Tombol bayar diaktifkan kembali.`);
            } else if (update.status === 'TIMEOUT' || update.status === 'POLLING_ERROR') {
                paymentStatusTextElement.style.color = '#f39c12';
                errorMessageElement.textContent = update.message || 'Gagal mengecek status pembayaran atau waktu tunggu habis.';
                errorMessageElement.style.display = 'block';
                paymentDetailsSection.style.display = 'none';
                payButton.disabled = false;
                console.log(`Renderer: Status Polling ${update.status}. Tombol bayar diaktifkan kembali.`);
            } else if (update.status === 'UNPAID') {
                paymentStatusTextElement.textContent = `Menunggu Pembayaran (${update.data?.payment_name || ''}, Ref: ${update.reference || (update.data && update.data.merchant_ref) || 'N/A'})`;
                paymentStatusTextElement.style.color = '#e67e22';
                // Tombol bayar tetap disabled karena polling masih aktif
            } else {
                paymentStatusTextElement.style.color = '#7f8c8d';
                errorMessageElement.textContent = `Status tidak diketahui: ${update.status}. ${update.message || ''}`;
                errorMessageElement.style.display = 'block';
                payButton.disabled = false; // Fallback, aktifkan tombol
            }
        });
    }

    if (window.electronAPI && window.electronAPI.onDslrBoothStatusUpdate) {
        window.electronAPI.onDslrBoothStatusUpdate((update) => {
            console.log('Renderer: Menerima update status dslrbooth:', update);
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