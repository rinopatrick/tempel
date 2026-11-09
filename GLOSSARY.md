# GLOSARIUM — Tempel

Bahasa domain untuk secret sharing sekali-buka (burn-after-read).
Acuan visual: file `design` (export HTML kanvas `tempel.pen` yang disetujui:
Homepage, Reveal, Result).

## Secret

Data rahasia asli milik pengirim (mis. password, API key) yang hanya pernah
ada dalam bentuk plaintext di browser pengirim dan — sesaat — di browser
penerima. Tidak pernah dikirim atau disimpan sebagai plaintext di server.

## State

Status lifecycle sebuah Secret di server. Transisi satu arah, atomik.

| State | Arti |
|---|---|
| `Created` | Ciphertext tersimpan, belum pernah dibuka. Satu-satunya state yang bisa di-reveal. |
| `Viewable` | Jendela baca terbuka: reveal diminta dan disetujui, link belum hangus. Hanya ada di antara keputusan reveal dan burn atomik. |
| `Burned` | Link hangus karena sudah dibuka. Ciphertext dihapus. Reveal berikutnya ditolak. |
| `Expired` | Link hangus karena lewat batas waktu (TTL). Ciphertext dihapus. Reveal ditolak. |

Urutan legal: `Created → Viewable → Burned`, atau `Created → Expired`.
Tidak ada transisi keluar dari `Burned` atau `Expired`.

## Ciphertext

Hasil enkripsi Secret (AES-256-GCM, di browser pengirim) yang disimpan server.
Server hanya melihat dan menyimpan bentuk ini — tidak bisa membaca isinya
karena tidak pernah memegang kunci.

## Fragment Key

Kunci dekripsi yang hidup di fragment URL (`#...`) link rahasia.
Tidak pernah terkirim ke server (fragment tidak ikut dalam HTTP request).
Penerima butuh Ciphertext (dari server) + Fragment Key (dari URL) untuk
mendekripsi secara lokal.

## Burn

Penghapusan Ciphertext di server secara atomik pada saat reveal, sehingga
link hanya bisa dibuka satu kali. Setelah Burn, Secret berstate `Burned`.
Store adalah SQLite file dengan burn atomik; memori hanya fallback dev
tanpa garansi burn lintas restart. Kontrak API tidak berubah.

## Reveal

Aksi penerima membuka link: menyatakan niat baca (`Created → Viewable`),
server mengembalikan Ciphertext lalu Burn (`Viewable → Burned`), dan browser
mendekripsi lokal dengan Fragment Key untuk menampilkan Secret sekali.
