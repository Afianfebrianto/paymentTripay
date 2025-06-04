@echo off
REM Skrip untuk menjalankan Backend API dan Aplikasi Payment Electron

REM --- KONFIGURASI PATH ---
REM Sesuaikan path berikut jika struktur foldermu berbeda.
REM Skrip ini mengasumsikan file .bat ini ada di dalam folder "Payment Apps"
REM dan folder "backend-api" serta folder output Electron ("out") ada di dalamnya.

REM Path ke direktori root tempat file .bat ini berada
SET "BASE_PATH=%~dp0"

REM Menghapus backslash di akhir BASE_PATH jika ada, agar path konsisten
IF "%BASE_PATH:~-1%"=="\" SET "BASE_PATH=%BASE_PATH:~0,-1%"

REM Path ke folder backend API relatif terhadap BASE_PATH
SET "BACKEND_API_FOLDER=%BASE_PATH%\backend-api"

REM Perintah untuk menjalankan server backend API
REM Pilih salah satu dan komentari yang lain:
REM Opsi 1: Menjalankan server.js langsung dengan node
SET "BACKEND_START_COMMAND=node server.js"
REM Opsi 2: Menggunakan skrip npm (misalnya jika kamu pakai nodemon atau ada build step)
REM SET "BACKEND_START_COMMAND=npm run dev" 
REM SET "BACKEND_START_COMMAND=npm start"

REM Path ke folder output aplikasi Electron dari BASE_PATH (tempat .exe berada)
REM Sesuaikan ini dengan output dari Electron Forge/Builder-mu.
REM Contoh umum untuk Electron Forge:
SET "ELECTRON_APP_FOLDER=%BASE_PATH%\out\Payment Apps Photobooth-win32-x64" 
REM Contoh untuk output Squirrel.Windows dari Electron Forge:
REM SET "ELECTRON_APP_FOLDER=%BASE_PATH%\out\make\squirrel.windows\x64" 

REM Nama file executable aplikasi Electron-mu
SET "ELECTRON_APP_EXE_NAME=Payment Apps Photobooth.exe" 
REM Ganti "Payment Apps.exe" dengan nama .exe aplikasimu yang sebenarnya.

REM --- AKHIR KONFIGURASI PATH ---

ECHO Base path terdeteksi: %BASE_PATH%
ECHO.

ECHO Menjalankan Backend API Server dari: %BACKEND_API_FOLDER%
cd /D "%BACKEND_API_FOLDER%"
IF NOT EXIST "server.js" (
    ECHO ERROR: server.js tidak ditemukan di %BACKEND_API_FOLDER%
    ECHO Pastikan folder backend-api ada di %BASE_PATH% dan berisi server.js
    PAUSE
    EXIT /B 1
)
REM Jalankan server backend di jendela command prompt baru
START "Backend API Server" cmd /k "%BACKEND_START_COMMAND%"
REM Menggunakan /k agar jendela cmd tetap terbuka setelah perintah selesai (berguna untuk melihat log server Node.js)
REM Jika ingin jendela cmd backend tertutup otomatis jika server Node.js berhenti, gunakan cmd /c

ECHO Memberi waktu server backend untuk memulai sepenuhnya...
REM Timeout dalam detik. Sesuaikan jika server backendmu butuh waktu lebih lama.
TIMEOUT /T 7 /NOBREAK > NUL

ECHO.
ECHO Menjalankan Aplikasi Payment Electron dari: %ELECTRON_APP_FOLDER%
cd /D "%ELECTRON_APP_FOLDER%"
IF NOT EXIST "%ELECTRON_APP_EXE_NAME%" (
    ECHO ERROR: %ELECTRON_APP_EXE_NAME% tidak ditemukan di %ELECTRON_APP_FOLDER%
    ECHO Pastikan path ELECTRON_APP_FOLDER dan nama ELECTRON_APP_EXE_NAME sudah benar.
    ECHO Folder output Electron mungkin berbeda tergantung konfigurasi build.
    PAUSE
    EXIT /B 1
)
START "Aplikasi Payment Electron" "%ELECTRON_APP_EXE_NAME%"

ECHO.
ECHO Kedua aplikasi seharusnya sudah berjalan.
ECHO Jendela "Backend API Server" akan tetap terbuka untuk melihat log.
ECHO Kamu bisa menutup jendela skrip ini.
REM PAUSE
EXIT /B 0
