// src/services/dslrboothService.js

const { exec, spawn } = require('child_process');
const path = require('path');
const config = require('../utils/config');

/**
 * Membuka aplikasi dslrBooth.
 * @returns {Promise<string>} Pesan sukses atau error.
 */

function ensureDslrBoothActive() {
  return new Promise((resolve, reject) => {
    const dslrBoothPath = config.dslrbooth.executablePath;
    // Dapatkan nama proses dari path executable (misalnya "dslrBooth" dari "dslrBooth.exe")
    // Ini lebih aman daripada hardcoding nama proses jika bisa berbeda.
    const dslrBoothProcessName = path.basename(dslrBoothPath, '.exe');
    const dslrBoothWindowTitleHint = 'dslrBooth'; // Petunjuk judul jendela (bisa sebagian)

    if (!dslrBoothPath) {
      return reject('Path ke dslrBooth.exe tidak dikonfigurasi di config.js');
    }

    // Skrip PowerShell yang lebih canggih
    // SW_RESTORE = 9 (mengembalikan jendela ke ukuran dan posisi normalnya)
    // SW_SHOW = 5 (mengaktifkan jendela dan menampilkannya dalam ukuran dan posisi saat ini)
    // SW_MAXIMIZE = 3
    const psScript = `
      # Definisi P/Invoke untuk ShowWindowAsync dan SetForegroundWindow
      $ShowWindowAsyncSig = @"
      [System.Runtime.InteropServices.DllImport("user32.dll")]
      public static extern bool ShowWindowAsync(System.IntPtr hWnd, int nCmdShow);
"@
      $SetForegroundWindowSig = @"
      [System.Runtime.InteropServices.DllImport("user32.dll")]
      [return: System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.Bool)]
      public static extern bool SetForegroundWindow(System.IntPtr hWnd);
"@
      # Tambahkan tipe P/Invoke ke sesi PowerShell saat ini
      try {
        Add-Type -MemberDefinition $ShowWindowAsyncSig -Name WinAPIShowWindowAsync -Namespace User32 -ErrorAction Stop
        Add-Type -MemberDefinition $SetForegroundWindowSig -Name WinAPISetForegroundWindow -Namespace User32 -ErrorAction Stop
      } catch {
        Write-Warning "Gagal menambahkan tipe P/Invoke User32. Kontrol jendela mungkin kurang optimal."
      }

      $dslrProcess = Get-Process -Name "${dslrBoothProcessName}" -ErrorAction SilentlyContinue

      if ($dslrProcess) {
        Write-Host "Proses dslrBooth (${dslrBoothProcessName}) ditemukan (PID: $($dslrProcess.Id)). Mencoba mengaktifkan."
        $mainWindowHandle = $dslrProcess.MainWindowHandle
        if ($mainWindowHandle -ne [System.IntPtr]::Zero) {
          # Mencoba me-restore jendela jika minimized (SW_RESTORE = 9)
          try { [User32.WinAPIShowWindowAsync]::ShowWindowAsync($mainWindowHandle, 9) | Out-Null } catch { Write-Warning "Gagal ShowWindowAsync(RESTORE)" }
          Start-Sleep -Milliseconds 250 # Jeda singkat agar jendela sempat merespons
          # Mencoba membawa jendela ke depan
          try { [User32.WinAPISetForegroundWindow]::SetForegroundWindow($mainWindowHandle) | Out-Null } catch { Write-Warning "Gagal SetForegroundWindow" }
          Write-Host "Perintah aktivasi dan restore dikirim ke jendela dslrBooth yang ada."
          $OutputMessage = "dslrBooth sedang berjalan dan upaya aktivasi telah dilakukan."
        } else {
          Write-Warning "Proses dslrBooth ditemukan, tapi handle jendela utama tidak tersedia. Mencoba AppActivate berdasarkan judul."
          try {
            Add-Type -AssemblyName Microsoft.VisualBasic # Untuk AppActivate
            [Microsoft.VisualBasic.Interaction]::AppActivate("${dslrBoothWindowTitleHint}")
            Write-Host "AppActivate berdasarkan judul dikirim ke dslrBooth yang ada."
            $OutputMessage = "dslrBooth sedang berjalan dan AppActivate berdasarkan judul dicoba."
          } catch {
            Write-Warning "AppActivate berdasarkan judul gagal. Mungkin perlu intervensi manual atau dslrBooth akan menangani instance baru."
            # Sebagai fallback, kita bisa coba jalankan lagi, dslrBooth mungkin single-instance
            Start-Process -FilePath "${dslrBoothPath}" -ErrorAction SilentlyContinue
            $OutputMessage = "dslrBooth ditemukan tapi aktivasi kurang optimal, perintah jalankan ulang dikirim."
          }
        }
      } else {
        Write-Host "Proses dslrBooth (${dslrBoothProcessName}) tidak ditemukan. Meluncurkan instance baru."
        Start-Process -FilePath "${dslrBoothPath}" -ErrorAction SilentlyContinue
        # Beri waktu sedikit untuk aplikasi terbuka sebelum mencoba AppActivate (opsional)
        Start-Sleep -Milliseconds 2000 # Tunggu 2 detik
        try {
          Add-Type -AssemblyName Microsoft.VisualBasic
          [Microsoft.VisualBasic.Interaction]::AppActivate("${dslrBoothWindowTitleHint}")
          Write-Host "AppActivate berdasarkan judul dikirim ke dslrBooth yang baru diluncurkan."
        } catch {
          Write-Warning "AppActivate berdasarkan judul gagal untuk dslrBooth yang baru diluncurkan."
        }
        $OutputMessage = "dslrBooth telah diluncurkan."
      }
      Write-Output $OutputMessage # Outputkan pesan status akhir
    `;

    // Eksekusi skrip PowerShell
    // Perhatikan penggunaan tanda kutip dan escape karakter jika skripnya kompleks
    // Menggunakan single quote untuk membungkus skrip di PowerShell agar variabel PowerShell dievaluasi dengan benar
    const command = `powershell -ExecutionPolicy Bypass -NoProfile -Command "& {${psScript}}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error saat menjalankan skrip PowerShell: ${error.message}`);
        return reject(`Error PowerShell: ${error.message}`);
      }
      if (stderr) {
        // Stderr PowerShell tidak selalu berarti error fatal, bisa jadi hanya warning
        console.warn(`PowerShell stderr: ${stderr}`);
      }
      console.log(`PowerShell stdout untuk kontrol dslrBooth: ${stdout}`);
      resolve(stdout.trim() || "Skrip kontrol dslrBooth dieksekusi.");
    });
  });
}
function launchDslrBooth() {
  return new Promise((resolve, reject) => {
    const dslrBoothPath = config.dslrbooth.executablePath;

    if (!dslrBoothPath) {
      console.error('Path ke dslrBooth.exe tidak dikonfigurasi di config.js');
      return reject('Path ke dslrBooth.exe tidak dikonfigurasi.');
    }

    console.log(`Mencoba membuka dslrBooth dari path: ${dslrBoothPath}`);

    // Menggunakan spawn untuk kontrol yang lebih baik dan menghindari masalah dengan spasi di path
    // Opsi detached agar proses dslrBooth bisa berjalan independen dari aplikasi Electron
    try {
      const child = spawn(dslrBoothPath, [], {
        detached: true,
        stdio: 'ignore' // Abaikan output stdio dari child process
      });

      child.on('error', (err) => {
        console.error(`Gagal memulai dslrBooth: ${err.message}`);
        if (err.message.includes('ENOENT')) {
          reject(`File dslrBooth.exe tidak ditemukan di path: ${dslrBoothPath}. Pastikan path benar.`);
        } else {
          reject(`Gagal memulai dslrBooth: ${err.message}`);
        }
      });

      // Unref agar parent process (Electron) bisa exit tanpa menunggu child process
      child.unref();

      console.log('Perintah untuk membuka dslrBooth telah dikirim.');
      // Kita tidak bisa langsung tahu apakah dslrBooth benar-benar terbuka dan fokus dari sini.
      // Untuk fokus, mungkin perlu skrip eksternal atau metode yang lebih canggih.

      // Berikan sedikit waktu sebelum resolve, asumsi perintah berhasil jika tidak ada error spawn langsung
      setTimeout(() => {
        resolve('Perintah untuk membuka dslrBooth berhasil dikirim.');
      }, 500); // Waktu tunggu singkat

    } catch (error) {
        console.error(`Error saat spawn dslrBooth: ${error.message}`);
        reject(`Error saat spawn dslrBooth: ${error.message}`);
    }
  });
}

/**
 * (Opsional) Mencoba memfokuskan jendela dslrBooth menggunakan PowerShell.
 * Keandalan metode ini bisa bervariasi.
 * @returns {Promise<string>} Pesan output atau error.
 */
function focusDslrBoothWindow() {
  return new Promise((resolve, reject) => {
    // Perintah PowerShell ini mencoba mencari proses dslrBooth dan mengaktifkan jendelanya.
    // "dslrBooth" adalah asumsi nama proses atau bagian dari judul jendela. Perlu disesuaikan.
    const command = `
      $Process = Get-Process | Where-Object {$_.ProcessName -eq 'dslrBooth' -or $_.MainWindowTitle -like '*dslrBooth*'};
      if ($Process) {
        Add-Type -AssemblyName Microsoft.VisualBasic;
        [Microsoft.VisualBasic.Interaction]::AppActivate($Process[0].MainWindowTitle);
        Write-Output "Upaya fokus ke dslrBooth dikirim.";
      } else {
        Write-Output "Proses dslrBooth tidak ditemukan.";
      }
    `;

    exec(`powershell -ExecutionPolicy Bypass -Command "${command}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error saat mencoba fokus dslrBooth: ${error.message}`);
        return reject(`Error PowerShell: ${error.message}`);
      }
      if (stderr) {
        console.warn(`Stderr PowerShell saat fokus: ${stderr}`);
        // Stderr tidak selalu berarti error fatal di PowerShell, bisa jadi warning
      }
      console.log(`Output fokus dslrBooth: ${stdout}`);
      resolve(stdout.trim());
    });
  });
}


module.exports = {
  launchDslrBooth,
    ensureDslrBoothActive,
  focusDslrBoothWindow
};