# Vinote

Aplikasi catatan bergaya vintage — PWA + build APK Android via Capacitor & GitHub Actions.

## Struktur folder

```
├── assets/
│   └── icon.png              ← KAMU yang isi (lihat spesifikasi di bawah)
├── www/                      ← seluruh source code app (webDir Capacitor)
│   ├── index.html
│   ├── manifest.json
│   ├── service-worker.js
│   ├── icons/                ← auto-dibuat oleh GitHub Action dari assets/icon.png
│   ├── css/
│   │   ├── styles.css
│   │   └── tailwind-input.css
│   └── js/
│       ├── storage.js
│       ├── undo-redo.js
│       ├── navigation.js
│       ├── bubble.js
│       ├── editor.js
│       ├── settings.js
│       ├── ui.js
│       ├── app.js
│       └── tailwind-config.js
├── capacitor.config.json
├── package.json
├── tailwind.config.js
└── .github/workflows/build-apk.yml
```

## Yang perlu kamu lakukan

1. Upload semua isi folder ini ke repo GitHub kamu (root repo), lewat GitHub app / web di HP — tinggal drag semua file & folder, pertahankan strukturnya persis seperti di atas.
2. Buat folder `assets/` di root repo, lalu upload **satu file**: `icon.png`.
3. Push ke branch `main` (atau jalankan workflow manual dari tab **Actions** → *Build Android APK* → *Run workflow*).
4. Tunggu Action selesai, lalu download APK dari tab **Actions** → run terakhir → bagian **Artifacts** → `Vinote-App-APK`.

## Spesifikasi `assets/icon.png`

| Hal | Nilai |
|---|---|
| Ukuran | **1024 × 1024 px** (persegi/rasio 1:1, wajib) |
| Format | PNG |
| Ukuran file | Idealnya di bawah **500 KB** (batasnya longgar, tapi jangan sampai puluhan MB) |
| Isi gambar | Full-bleed, tanpa bikin sudut membulat sendiri — Android yang otomatis masking jadi bulat/squircle sesuai launcher. Hindari elemen penting mepet ke tepi (±10% dari tepi rawan terpotong di beberapa launcher). |

Dari satu file ini, workflow otomatis membuat:
- Icon native Android (semua ukuran/density) via `@capacitor/assets`.
- Icon PWA (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png` di `www/icons/`) — di-commit balik otomatis ke repo kamu jadi tetap kepakai walau kamu buka appnya sebagai PWA (bukan APK).

## Fitur baru yang ditambahkan

1. **Hapus stabilo** — tombol baru (ikon ✕) persis di sebelah 3 warna stabilo di bubble seleksi teks (halaman kedua, buka via tombol ›). Menghapus warna stabilo dari teks yang dipilih, pakai teknik yang sama (`execCommand('hiliteColor', ...)`) seperti tombol stabilo lainnya.
2. Teks pratinjau di halaman Pengaturan sudah diganti sesuai yang kamu minta.

## Fullscreen, notch, & tombol back (requirement kamu)

- **Fullscreen immersive**: `MainActivity.java` disuntik oleh workflow (sama seperti project Phygo lama kamu) — status bar & nav bar disembunyikan total, muncul lagi sebentar kalau di-swipe dari tepi.
- **Aman dari notch**: `layoutInDisplayCutoutMode` dibiarkan menggambar sampai ke tepi, tapi `www/css/styles.css` menambahkan padding otomatis (`env(safe-area-inset-*)`) di `#appRoot` dan halaman Pengaturan, jadi konten tidak ketutupan notch/poni kamera atau gesture bar bawah.
- **Tombol back Android**: `www/js/app.js` mendaftarkan listener resmi dari `@capacitor/app` — back pertama menutup bubble/menu/Pengaturan/editor sesuai prioritas yang sudah ada di `navigation.js`, dan kalau sudah di halaman utama, back sekali cuma munculin toast "Tekan sekali lagi untuk keluar", baru keluar app di tekan kedua (mencegah kepencet keluar app gak sengaja).

## Offline

- Sebagai **PWA** (dibuka lewat browser HP / diinstal ke homescreen): `service-worker.js` meng-cache semua file app + font + Tailwind CDN saat pertama kali dibuka (butuh sekali online), sesudah itu jalan offline.
- Sebagai **APK native**: workflow build meng-compile Tailwind jadi CSS statis dan menyalin semua font Google Fonts ke `www/libs/fonts`, lalu menulis ulang `www/index.html` (khusus untuk build APK — file di repo kamu tidak berubah) supaya APK-nya 100% offline dari pertama buka, tanpa perlu internet sama sekali.

## Catatan lain

- `capacitor.config.json` pakai `appId: com.vinote.app` — ganti kalau kamu sudah pernah publish dengan appId lain (appId tidak bisa diganti-ganti setelah publish ke Play Store).
- `android/`, `www/libs/`, `node_modules/`, dan `www/css/tailwind.compiled.css` sengaja di-`.gitignore`-kan karena semuanya dibuat ulang otomatis oleh workflow — tidak perlu (dan sebaiknya tidak) kamu upload manual.
