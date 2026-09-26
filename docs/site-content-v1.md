# Afuza Site Content Contract V1

Contract ini adalah payload konten publik yang sudah siap dirender. Versinya adalah `site_content_v1`; producer dan consumer wajib menolak versi yang tidak dikenal.

## Struktur Contract

Root object wajib strict dan hanya memiliki:

- `schemaVersion`: literal `site_content_v1`.
- `site`: `name`, `slug`, optional `description` dan `whatsapp`.
- `seo`: `title`, `description`, optional image dan canonical.
- `theme`: token terkontrol untuk `style`, `primaryColor`, `accentColor`, `fontStyle`, `borderRadius`, dan `density`.
- `header`: optional logo, navigation, dan CTA.
- `sections`: 1-20 section; tepat satu `hero`, dan hero harus pertama.
- `footer`: optional description/copyright dan navigation links.

Section memakai discriminated union berdasarkan `type`: `hero`, `about`, `feature_grid`, `item_grid`, `steps`, `benefits`, `faq`, `cta`, `contact`, atau `text`. Setiap section memiliki ID slug yang unik. Semua object strict, semua string dan array memiliki batas, dan HTML mentah tidak termasuk bagian dari contract.

CTA memiliki `label`, `kind`, dan `target`. Nilai `kind` adalah `internal`, `anchor`, `whatsapp`, `email`, atau `external`. Renderer membentuk URL WhatsApp; producer hanya mengirim nomor yang dapat dinormalisasi ke format internasional.

## Contoh JSON

```json
{
  "schemaVersion": "site_content_v1",
  "site": {
    "name": "Dapur Rasa",
    "slug": "dapur-rasa",
    "description": "Masakan rumahan untuk keluarga.",
    "whatsapp": "081234567890"
  },
  "seo": {
    "title": "Dapur Rasa",
    "description": "Pesan masakan rumahan Dapur Rasa.",
    "image": "/images/dapur-rasa.jpg"
  },
  "theme": {
    "style": "organic",
    "primaryColor": "#123456",
    "accentColor": "#F59E0B",
    "fontStyle": "sans",
    "borderRadius": "md",
    "density": "comfortable"
  },
  "header": {
    "navigation": [{ "label": "Tentang", "target": "about" }]
  },
  "sections": [
    {
      "id": "hero",
      "type": "hero",
      "title": "Masakan rumahan untuk hari istimewa",
      "body": "Pesan menu favorit untuk keluarga.",
      "image": "/images/hero.jpg",
      "cta": { "label": "Pesan sekarang", "kind": "whatsapp", "target": "081234567890" }
    },
    { "id": "about", "type": "about", "title": "Tentang kami", "body": "Kami memasak dengan bahan pilihan." }
  ],
  "footer": { "links": [{ "label": "Beranda", "target": "hero" }] }
}
```

## Producer Rules: Worker/Hermes

1. Worker/Hermes hanya menghasilkan JSON sesuai schema ini dan mengirim `schemaVersion` secara eksplisit.
2. Producer wajib memvalidasi dengan `safeParseSiteContentV1` sebelum menyimpan atau mengirim payload.
3. Producer tidak boleh mengarang testimonial, harga, sertifikasi, alamat, hasil, atau metadata yang tidak ada di brief/sumber yang disetujui.
4. Gunakan ID section yang stabil dan lowercase kebab-case. Navigation dan CTA anchor hanya boleh merujuk ID section yang ada.
5. Nomor WhatsApp boleh lokal atau berformat manusia; validator menormalkannya menjadi digit internasional tanpa tanda `+`. Producer tidak membentuk URL `wa.me`.
6. Gunakan URL gambar HTTPS atau path internal. Jangan menghasilkan HTML, CSS, JavaScript, `data:` URI, atau URL HTTP eksternal.
7. Jika data wajib tidak tersedia, producer harus memperbaiki payload atau menandainya untuk persetujuan; jangan mengisi dengan klaim fiktif.

## Consumer Rules: Renderer

1. Renderer mem-parse ulang payload yang diterima dan tidak merender data yang gagal validasi.
2. Renderer melakukan escaping teks sebagai teks biasa. Renderer tidak memakai `dangerouslySetInnerHTML` dan tidak menerima HTML dari contract.
3. Renderer memetakan theme hanya ke token design system yang telah ditentukan; tidak membuat style dari input CSS mentah.
4. Renderer memetakan `internal` ke route internal, `anchor` ke `#section-id`, `external` hanya ke HTTPS, `email` ke mail action, dan `whatsapp` ke URL WhatsApp yang dibentuk renderer dari nomor ternormalisasi.
5. Renderer tidak boleh mengubah semantic contract secara diam-diam. Payload yang tidak dikenal, tidak lengkap, atau memiliki versi baru harus masuk state error yang aman.

## Security Rules

- Tolak `javascript:`, `data:`, `file:`, protocol-relative URL (`//...`), dan HTML mentah.
- External URL wajib HTTPS. Image hanya HTTPS atau path internal yang aman.
- Internal path, anchor, navigation target, dan CTA anchor harus tervalidasi.
- Tolak script, iframe, event handler, dan semua unknown field pada object strict.
- Batasi panjang string, jumlah item array, jumlah section (maksimal 20), dan ukuran koleksi per section.
- Theme hanya menerima enum dan hex color enam digit; CSS mentah tidak diperbolehkan.

## Versioning Policy

`site_content_v1` immutable. Perubahan breaking membuat contract baru, misalnya `site_content_v2`; v1 tidak diinterpretasikan sebagai v2. Perubahan additive harus tetap mempertahankan strictness melalui versi baru atau rollout producer/consumer yang terkoordinasi. Payload selalu divalidasi berdasarkan versi yang dinyatakan, dan renderer menolak versi yang belum didukung.

## Mapping Field Brief

| Field brief | Contract / penggunaan | Klasifikasi |
| --- | --- | --- |
| `nama_usaha` | `site.name` | Publik |
| `slug` | `site.slug` | Publik |
| `action` | CTA utama: `cta.label` dan `cta.kind`/`target` | Memerlukan persetujuan |
| `status` | Status workflow/job, bukan konten publik | Operasional |
| `brief` | Sumber producer; diringkas ke section publik | Instruksi AI |
| `jenis_usaha` | Arah producer untuk memilih struktur dan copy | Instruksi AI |
| `target_market` | Dasar copy/audience; hanya tampil jika memang disetujui | Instruksi AI |
| `produk_layanan` | Isi `about`, `item_grid`, atau `feature_grid` setelah verifikasi | Publik |
| `usp` | Copy manfaat/hero setelah klaim disetujui | Memerlukan persetujuan |
| `cta` | CTA publik | Memerlukan persetujuan |
| `whatsapp` | `site.whatsapp` atau CTA `whatsapp` | Memerlukan persetujuan |
| `alamat` | `contact.address` | Publik |
| `style` | `theme.style` setelah dipetakan ke enum | Instruksi AI |
| `warna_utama` | `theme.primaryColor` setelah validasi hex | Instruksi AI |
| `referensi` | Input producer, bukan otomatis konten publik | Instruksi AI |
| `catatan` | Catatan internal producer/reviewer, bukan output publik | Operasional |

Field `status`, `brief`, `referensi`, dan `catatan` tidak boleh bocor ke payload publik kecuali telah dipetakan secara eksplisit ke field contract dan disetujui.