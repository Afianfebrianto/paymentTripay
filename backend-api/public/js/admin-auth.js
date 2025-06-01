// backend-api/public/js/admin-auth.js
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginErrorElement = document.getElementById('login-error');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginErrorElement.style.display = 'none';
            loginErrorElement.textContent = '';

            const username = loginForm.username.value;
            const password = loginForm.password.value;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password }),
                });

                const result = await response.json();

                // PERBAIKAN KONDISI DI SINI:
                if (result.success) {
                    console.log('Login API call successful. Result:', result);
                    // Token sekarang ada di httpOnly cookie, tidak perlu disimpan di localStorage.
                    // Kita bisa simpan info user jika diperlukan untuk tampilan di frontend.
                    if (result.user) {
                        localStorage.setItem('adminUser', JSON.stringify(result.user));
                        console.log('User info stored in localStorage.');
                    }
                    
                    console.log('Redirecting to /admin/dashboard...');
                    window.location.href = '/admin/dashboard'; // Lakukan redirect
                } else {
                    loginErrorElement.textContent = result.message || 'Login gagal. Coba lagi.';
                    loginErrorElement.style.display = 'block';
                    console.warn('Login API call failed or result.success is false. Message:', result.message);
                }
            } catch (error) {
                console.error('Error selama proses login fetch:', error);
                loginErrorElement.textContent = 'Terjadi kesalahan koneksi atau respons tidak valid. Coba lagi nanti.';
                loginErrorElement.style.display = 'block';
            }
        });
    }

    // Listener untuk tombol logout (jika ada di halaman yang sama atau di-load)
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            // Redirect ke endpoint logout server yang akan menghapus cookie
            window.location.href = '/admin/logout';
        });
    }
});