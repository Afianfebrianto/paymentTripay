// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Mengirim permintaan untuk membuat transaksi dan menunggu hasilnya (invoke)
  requestCreatePayment: (paymentData) => ipcRenderer.invoke('tripay:createPayment', paymentData),

  // Menerima update status pembayaran dari main process (on)
  onPaymentStatusUpdate: (callback) => {
    // Pastikan kita hanya menambahkan listener sekali atau membersihkannya jika perlu
    // Untuk kesederhanaan, kita asumsikan callback yang sama akan selalu digunakan.
    // Jika tidak, gunakan ipcRenderer.removeListener atau semacamnya.
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('payment:statusUpdate', subscription);
    // Kembalikan fungsi untuk unsubscribe jika diperlukan
    return () => ipcRenderer.removeListener('payment:statusUpdate', subscription);
  },

  // Menerima update status dslrbooth dari main process
  onDslrBoothStatusUpdate: (callback) => {
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('dslrbooth:statusUpdate', subscription);
    return () => ipcRenderer.removeListener('dslrbooth:statusUpdate', subscription);
  },

  // Opsional: jika ada link pembayaran eksternal yang ingin dibuka di browser default
  // openExternalLink: (url) => ipcRenderer.send('app:openExternalLink', url)
});

console.log('preload.js loaded and electronAPI exposed.');