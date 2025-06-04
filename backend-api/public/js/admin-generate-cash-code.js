// backend-api/public/js/admin-generate-cash-code.js

// Pastikan admin-auth.js sudah dimuat dan fungsi fetchWithAuth tersedia.
document.addEventListener('DOMContentLoaded', () => {
    console.log("ADMIN-GENERATE-CASH-CODE.JS: DOMContentLoaded.");

    const generateCashCodeForm = document.getElementById('generateCashCodeForm');
    const cashVoucherCodeInput = document.getElementById('cashVoucherCode');
    const voucherValidationMessage = document.getElementById('voucherValidationMessage');
    
    const generatedCodeResultDiv = document.getElementById('generatedCodeResult');
    const displayGeneratedCode = document.getElementById('displayGeneratedCode');
    const displayBaseAmountResult = document.getElementById('displayBaseAmountResult');
    const discountInfoResult = document.getElementById('discountInfoResult');
    const displayDiscountAppliedResult = document.getElementById('displayDiscountAppliedResult');
    const displayVoucherMessageResult = document.getElementById('displayVoucherMessageResult');
    const displayFinalAmountResult = document.getElementById('displayFinalAmountResult');
    
    const generateErrorDiv = document.getElementById('generateError');
    const generateCodeButton = document.getElementById('generateCodeButton');

    const FIXED_PRICE = 30000;
    document.getElementById('fixedPriceDisplay').textContent = FIXED_PRICE.toLocaleString('id-ID');

    if (generateCashCodeForm) {
        console.log("ADMIN-GENERATE-CASH-CODE.JS: Form #generateCashCodeForm ditemukan.");
        generateCashCodeForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            console.log("ADMIN-GENERATE-CASH-CODE.JS: Form generate kode disubmit.");

            // Reset UI
            generatedCodeResultDiv.style.display = 'none';
            generateErrorDiv.style.display = 'none';
            generateErrorDiv.textContent = '';
            voucherValidationMessage.textContent = '';
            voucherValidationMessage.className = 'form-text'; // Reset class
            generateCodeButton.disabled = true;
            generateCodeButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';

            const voucherCode = cashVoucherCodeInput.value.trim();

            const payload = {
                amount: FIXED_PRICE, // Harga fix
                voucher_code: voucherCode || null
            };

            console.log("ADMIN-GENERATE-CASH-CODE.JS: Mengirim data ke API /api/cash-codes/generate:", payload);

            try {
                if (typeof fetchWithAuth !== 'function') {
                    throw new Error("Fungsi otentikasi (fetchWithAuth) tidak ditemukan.");
                }

                const response = await fetchWithAuth('/api/cash-codes/generate', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                console.log("ADMIN-GENERATE-CASH-CODE.JS: Respons dari server:", result);

                if (result.success) {
                    displayGeneratedCode.textContent = result.code;
                    displayBaseAmountResult.textContent = 'Rp ' + parseFloat(result.baseAmount || FIXED_PRICE).toLocaleString('id-ID');
                    
                    if (result.discountApplied && result.discountApplied > 0) {
                        displayDiscountAppliedResult.textContent = 'Rp ' + parseFloat(result.discountApplied).toLocaleString('id-ID');
                        displayVoucherMessageResult.textContent = result.appliedVoucherCode ? `Voucher "${result.appliedVoucherCode}"` : 'Diskon diterapkan';
                        discountInfoResult.style.display = 'block';
                    } else {
                        discountInfoResult.style.display = 'none';
                    }
                    
                    displayFinalAmountResult.textContent = 'Rp ' + parseFloat(result.amount).toLocaleString('id-ID');
                    generatedCodeResultDiv.style.display = 'block';
                    
                    // Kosongkan input voucher setelah berhasil
                    cashVoucherCodeInput.value = ''; 
                    voucherValidationMessage.textContent = result.message.includes("berhasil dibuat") ? result.message : "Kode berhasil dibuat.";
                    voucherValidationMessage.className = 'form-text text-success';


                } else {
                    generateErrorDiv.textContent = result.message || 'Gagal generate kode pembayaran.';
                    generateErrorDiv.style.display = 'block';
                    if (result.message && result.message.toLowerCase().includes("voucher")) {
                        voucherValidationMessage.textContent = result.message;
                        voucherValidationMessage.className = 'form-text text-danger';
                    }
                }
            } catch (error) {
                console.error('ADMIN-GENERATE-CASH-CODE.JS: Error saat generate kode:', error);
                let errorMessage = 'Terjadi kesalahan jaringan atau server.';
                if (error && error.message) {
                    errorMessage = error.message;
                }
                generateErrorDiv.textContent = errorMessage;
                generateErrorDiv.style.display = 'block';
            } finally {
                generateCodeButton.disabled = false;
                generateCodeButton.innerHTML = '<i class="fas fa-cogs"></i> Generate Kode Pembayaran';
            }
        });
    } else {
        console.warn("ADMIN-GENERATE-CASH-CODE.JS: Form #generateCashCodeForm tidak ditemukan.");
    }
});
