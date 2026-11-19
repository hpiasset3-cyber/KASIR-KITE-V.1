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
- Di APK: ekspor XLSX, kirim data (Sync), dan struk dibuka lewat menu **Bagikan** karena WebView Android
  tidak mendukung unduhan dan cetak browser. Struk dibagikan sebagai teks (bisa ke aplikasi printer seperti RawBT).
  Pencetakan langsung ke printer Bluetooth belum ada (lihat bagian Bluetooth).
- **Bluetooth:** tombol pilih printer di APK memakai plugin `@capacitor-community/bluetooth-le`. Saat pertama dipakai,
  Android meminta izin **Perangkat di sekitar** (Android 12+) atau **Lokasi** (Android 11 ke bawah). Daftar perangkat sekitar
  tampil, lalu aplikasi menyambungkan ke perangkat yang dipilih. Plugin ini hanya untuk Bluetooth LE (BLE); printer yang
  hanya mendukung Bluetooth klasik (SPP) tidak muncul di daftar. Izinnya ditambahkan otomatis ke AndroidManifest oleh workflow.
- Data produk/transaksi tersimpan di dalam aplikasi (localStorage). Cadangkan lewat menu Sync.
