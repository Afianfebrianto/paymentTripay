// src/services/dslrboothService.js
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs'); // fs biasa cukup untuk mengecek keberadaan file
const { app } = require('electron'); // Impor 'app' dari Electron
const config = require('../utils/config');

/**
 * Memastikan dslrBooth berjalan, aktif, dan di depan menggunakan AutoHotkey.
 * @returns {Promise<string>} Pesan status.
 */
async function ensureDslrBoothActive() {
  const dslrBoothPathFromConfig = config.dslrbooth.executablePath;

  // Path ke AutoHotkey.exe (pertimbangkan untuk membuatnya bisa dikonfigurasi di config.js)
  const autoHotkeyExePath = config.autoHotkey?.executablePath || "C:\\Program Files\\AutoHotkey\\AutoHotkey.exe"; // Default path

  // Path ke skrip .ahk kamu
  const SCRIPT_FOLDER_NAME = 'scripts'; // Nama folder tempat kamu menyimpan activate_dslrbooth.ahk
  let ahkScriptPath;

  if (app.isPackaged) {
    // Saat aplikasi di-package, resourcesPath adalah tempat yang baik untuk file tambahan
    // Pastikan folder 'scripts' di-copy ke 'resources/scripts' saat build
    // Atau jika 'scripts' ada di root app.asar.unpacked:
    // ahkScriptPath = path.join(process.resourcesPath, 'app.asar.unpacked', SCRIPT_FOLDER_NAME, 'activate_dslrbooth.ahk');
    // Cara paling umum adalah jika 'scripts' di-copy ke root dari resources
    ahkScriptPath = path.join(process.resourcesPath, SCRIPT_FOLDER_NAME, 'activate_dslrbooth.ahk');
    // Jika kamu menggunakan extraResource: ['./scripts/'] di forge.config.js,
    // maka pathnya akan relatif terhadap process.resourcesPath (jika tidak di dalam asar)
    // atau app.getAppPath() + '/scripts/' (jika di dalam asar dan terekstrak atau tidak di asar)
    // Untuk lebih pastinya, console.log(process.resourcesPath) dan console.log(app.getAppPath()) setelah di-package.
    // Cara yang lebih aman:
    // ahkScriptPath = path.resolve(app.getAppPath(), SCRIPT_FOLDER_NAME, 'activate_dslrbooth.ahk');
    // Jika 'scripts' ada di root package:
    // const baseAppPath = app.getAppPath().replace('app.asar', 'app.asar.unpacked'); // Jika diunpack
    // ahkScriptPath = path.join(baseAppPath, SCRIPT_FOLDER_NAME, 'activate_dslrbooth.ahk');
  } else {
    // Saat development, asumsikan 'scripts' ada di root proyekmu (selevel package.json)
    ahkScriptPath = path.join(process.cwd(), SCRIPT_FOLDER_NAME, 'activate_dslrbooth.ahk');
  }
  console.log(`Menggunakan path skrip AHK: ${ahkScriptPath}`);


  if (!dslrBoothPathFromConfig || dslrBoothPathFromConfig.trim() === '') {
    return Promise.reject('Path ke dslrBooth.exe tidak dikonfigurasi di config.js.');
  }

  // Cek keberadaan file sebelum eksekusi
  try {
    if (!fs.existsSync(autoHotkeyExePath)) {
      const msg = `AutoHotkey.exe tidak ditemukan di ${autoHotkeyExePath}. Pastikan AutoHotkey terinstal dan path benar (bisa diatur di config.js bagian autoHotkey.executablePath).`;
      console.error(msg);
      return Promise.reject(msg);
    }
    if (!fs.existsSync(ahkScriptPath)) {
      const msg = `Skrip AutoHotkey activate_dslrbooth.ahk tidak ditemukan di ${ahkScriptPath}. Pastikan file ada dan path benar.`;
      console.error(msg);
      return Promise.reject(msg);
    }
  } catch (e) {
    return Promise.reject(`Error saat mengecek path file: ${e.message}`);
  }

  return new Promise((resolve, reject) => {
    // Kirim path dslrBooth.exe sebagai argumen ke skrip AHK
    const args = [ahkScriptPath, dslrBoothPathFromConfig];

    execFile(autoHotkeyExePath, args, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error saat menjalankan skrip AutoHotkey: ${error.message}`);
        console.error(`AutoHotkey stderr (jika ada): ${stderr}`);
        return reject(`Error AutoHotkey: ${error.message}. Stderr: ${stderr}`);
      }
      if (stderr) {
        // stderr AHK tidak selalu berarti error fatal
        console.warn(`AutoHotkey stderr: ${stderr}`);
      }
      console.log(`AutoHotkey stdout: ${stdout}`); // stdout AHK biasanya kosong jika hanya aksi GUI
      resolve(stdout.trim() || "Skrip AutoHotkey untuk dslrBooth berhasil dieksekusi.");
    });
  });
}

module.exports = {
  ensureDslrBoothActive,
};