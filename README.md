# Kasir Kite - build APK lewat GitHub

Repo ini membuat file APK Android otomatis di GitHub Actions. Tidak perlu Android Studio.

## Cara build
1. Buat repo baru di GitHub, lalu unggah **semua isi folder ini**, termasuk folder `.github`.
   Jika `.github` tidak ikut terunggah, buat manual: *Add file > Create new file*, ketik
   `.github/workflows/build-apk.yml`, lalu tempel isi file `build-apk.yml`.
2. Buka tab **Actions > Build APK > Run workflow** (build juga jalan otomatis tiap push ke `main`).
3. Tunggu sekitar 5-10 menit sampai centang hijau. Buka run tersebut, bagian **Artifacts**,
   unduh `kasir-kite-apk`, ekstrak, lalu pasang `app-debug.apk` di HP
   (izinkan "instal dari sumber tidak dikenal").
4. Ingin APK di halaman Releases? Beri tag versi: `git tag v1.0.0 && git push --tags`.

## Yang perlu diketahui
- `www/` berisi aplikasi web. Ubah file di sini lalu push; APK baru akan dibuat otomatis.
- Ganti `appId` di `capacitor.config.json` (mis. `com.tokoanda.kasir`) sebelum dipakai serius.
  Setelah APK dipasang, jangan ganti `appId` lagi agar data tidak terpisah.
- Ini APK **debug** (cukup untuk dipasang langsung). Untuk Google Play perlu APK/AAB rilis bertanda tangan.
- Di APK: ekspor XLSX dan kirim data (Sync) dibuka lewat menu **Bagikan**, karena WebView Android tidak mendukung unduhan browser.
- **Cetak struk ke printer thermal (Bluetooth):**
  1. Pasangkan printer di Pengaturan Bluetooth HP (PIN umumnya 0000 atau 1234).
  2. Di aplikasi, buka struk lalu ketuk **Hubungkan Printer**. Saat pertama kali, Android meminta izin **Perangkat di sekitar**.
  3. Pilih printer dari daftar. Pilihan tersimpan, jadi seterusnya cukup ketuk **Cetak Struk**.
  Printer klasik (SPP, paling umum untuk printer 57/58 mm) dicetak lewat plugin `BtPrinter` buatan sendiri di `native/`.
  Printer BLE bisa dipilih lewat "Cari perangkat Bluetooth LE" dan dicetak lewat plugin `@capacitor-community/bluetooth-le`.
  Lebar struk 32 karakter per baris (kertas 57/58 mm); ubah di `buildEscPos` di `www/app.js` bila kertas berbeda.
- **Nama dan logo di struk:** ubah `STORE_NAME` di `www/app.js`. Jarak kosong atas/bawah struk diatur `FEED_TOP` dan `FEED_BOTTOM`.
  Logo digambar di fungsi `receiptHeaderCanvas`. Printer yang tidak mendukung gambar bisa memakai pilihan BLE (nama dicetak sebagai teks besar).
- Data produk/transaksi tersimpan di dalam aplikasi (localStorage). Cadangkan lewat menu Sync.
