import type { Locale } from ".";

/** Shown when a profile has no guide of its own. Profiles can replace it per locale. */
export const defaultGuide: Record<Locale, string> = {
  en: `# What you need

- A computer with **Google Chrome** or **Microsoft Edge**.
- A USB **data** cable. Charge-only cables aren't detected.
- The profile and app files from your administrator.

# Prepare the device

> A factory reset erases everything on the device. Only reset devices that are meant to be set up.

1. Factory reset the device.
2. When it restarts, **skip every setup screen**. Don't sign in to a Google account.
3. Open **Settings › About** and tap **Build number** seven times.
4. Open **Settings › System › Developer options** and turn on **USB debugging**.

# Provision it

1. Load the **profile**, then the **app files** it lists.
2. Plug in the device and press **Connect device**. Choose the device, then tap **Allow** on its screen. Tick **Always allow from this computer**.
3. Make sure every check in the Device panel is green.
4. Fill in the **unit details** if the profile asks for them.
5. Press **Provision device**. Keep the cable in until every step is done.

# Check the result

- The app opens full screen.
- Home and Recents don't leave the app (if the app uses kiosk mode).

For many devices, turn on **Batch mode**: each newly connected device starts on its own, and a sound plays when it's done.

# If something goes wrong

## The device isn't listed

Press **Run a USB check** in the Device panel. The usual causes are: the page opened inside a preview (download the file and open it in Chrome or Edge), a charge-only cable, USB debugging off, or on Windows a missing USB driver.

## "In use by another program"

Another program holds the USB connection. Run this, quit Android Studio, then replug:

\`\`\`
adb kill-server
\`\`\`

## A red check

- **Accounts signed in:** remove them in Settings › Accounts, or factory reset again without signing in.
- **More than one user:** delete other users in Settings › System › Multiple users.
- **Managed by another app:** stop. Don't reset; report the serial number to your administrator.

## A step failed

Read the reason under the failed step, fix it, then press **Retry from failed step**. Steps that already worked are not repeated.

# Installing adb (optional)

Ownerkit doesn't need adb. Install it only to stop a running adb or for scripting.

## macOS

\`\`\`
brew install --cask android-platform-tools
\`\`\`

## Windows

\`\`\`
winget install Google.PlatformTools
\`\`\`

## Linux (Debian, Ubuntu)

\`\`\`
sudo apt install adb android-sdk-platform-tools-common
\`\`\`

Check it works with \`adb version\`, and see connected devices with \`adb devices\`.
`,
  id: `# Yang Anda perlukan

- Komputer dengan **Google Chrome** atau **Microsoft Edge**.
- Kabel USB **data**. Kabel khusus pengisian daya tidak terdeteksi.
- File profil dan aplikasi dari administrator.

# Siapkan perangkat

> Reset pabrik menghapus semua isi perangkat. Reset hanya perangkat yang memang akan disiapkan.

1. Reset pabrik perangkat.
2. Setelah menyala lagi, **lewati semua layar pengaturan awal**. Jangan masuk ke akun Google.
3. Buka **Pengaturan › Tentang** dan ketuk **Nomor versi** tujuh kali.
4. Buka **Pengaturan › Sistem › Opsi developer** dan aktifkan **Debugging USB**.

# Pasang

1. Muat **profil**, lalu **file aplikasi** yang tercantum.
2. Colokkan perangkat dan tekan **Hubungkan perangkat**. Pilih perangkat, lalu ketuk **Izinkan** di layarnya. Centang **Selalu izinkan dari komputer ini**.
3. Pastikan semua pemeriksaan di panel Perangkat berwarna hijau.
4. Isi **data unit** jika profil memintanya.
5. Tekan **Pasang ke perangkat**. Jangan cabut kabel sampai semua langkah selesai.

# Periksa hasil

- Aplikasi terbuka layar penuh.
- Tombol Home dan Recents tidak keluar dari aplikasi (jika aplikasi memakai mode kios).

Untuk banyak perangkat, aktifkan **Mode massal**: setiap perangkat yang baru dihubungkan langsung dimulai, dan suara berbunyi saat selesai.

# Jika ada masalah

## Perangkat tidak muncul

Tekan **Jalankan pemeriksaan USB** di panel Perangkat. Penyebab umum: halaman terbuka di dalam pratinjau (unduh file dan buka di Chrome atau Edge), kabel khusus pengisian daya, Debugging USB belum aktif, atau di Windows driver USB belum terpasang.

## "In use by another program"

Program lain memakai koneksi USB. Jalankan perintah ini, tutup Android Studio, lalu colokkan ulang:

\`\`\`
adb kill-server
\`\`\`

## Pemeriksaan merah

- **Ada akun masuk:** hapus di Pengaturan › Akun, atau reset pabrik lagi tanpa masuk akun.
- **Lebih dari satu pengguna:** hapus pengguna lain di Pengaturan › Sistem › Beberapa pengguna.
- **Dikelola aplikasi lain:** berhenti. Jangan reset; laporkan nomor seri ke administrator.

## Langkah gagal

Baca penyebab di bawah langkah yang gagal, perbaiki, lalu tekan **Ulangi dari langkah gagal**. Langkah yang sudah berhasil tidak diulang.

# Memasang adb (opsional)

Ownerkit tidak memerlukan adb. Pasang hanya untuk menghentikan adb yang berjalan atau untuk skrip.

## macOS

\`\`\`
brew install --cask android-platform-tools
\`\`\`

## Windows

\`\`\`
winget install Google.PlatformTools
\`\`\`

## Linux (Debian, Ubuntu)

\`\`\`
sudo apt install adb android-sdk-platform-tools-common
\`\`\`

Periksa dengan \`adb version\`, dan lihat perangkat terhubung dengan \`adb devices\`.
`,
};
