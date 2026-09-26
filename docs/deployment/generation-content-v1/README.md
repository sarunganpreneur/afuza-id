# Generation Content V1 Deployment Packet

> DOCUMENTATION DRIFT (marked 2026-09-15)
>
> This packet README still says the migration has not been run. That was true
> of the original commit. Production Generation V1 is live. Treat this folder
> as a historical operator packet: do not re-apply without a new preflight and
> explicit approval. See `docs/STALE_DOCUMENTS.md`.

## Tujuan

Packet ini menyiapkan hardening RPC untuk validasi dan persistence `SiteContentV1`. Perubahan memperbaiki konflik marker `analysis_version` versus numeric `version_number`, menjaga atomic commit, dan menolak first commit di luar status `GENERATING_CONTENT`.

## Status

Migration belum dijalankan. Tidak ada file dalam folder ini yang dipanggil otomatis oleh aplikasi. Packet ini hanya untuk review dan eksekusi manual oleh operator database yang berwenang.

## Urutan Eksekusi

1. Jalankan `01-preflight.sql` secara read-only.
2. Simpan timestamp dan hasil ringkas preflight tanpa menyimpan row atau payload pengguna.
3. Bandingkan expected result dengan contract live dan checklist di bawah.
4. Jalankan `02-apply.sql` hanya setelah approval eksplisit.
5. Jalankan `03-verify.sql` secara read-only.
6. Catat timestamp, operator, hasil verifikasi, dan migration identifier di change record.

`02-apply.sql` tidak boleh dijalankan melalui endpoint aplikasi, startup hook, build, test, atau deploy script.

## Expected Result

- Dua signature RPC tetap sama.
- `complete_generation_analysis` memakai `analysis_version`, `analysis`, dan `status`.
- Analysis berpindah ke `GENERATING_CONTENT` tanpa mengisi `completed_at`.
- `commit_generated_site_version` hanya menerima first commit dari `GENERATING_CONTENT`.
- `p_content.schemaVersion` wajib `site_content_v1`.
- Retry memakai numeric `output_summary.version_number`.
- Lock order tetap job lalu site.
- ACL worker tetap `service_role` only; `public`, `anon`, dan `authenticated` tidak memiliki execute.
- Tidak ada perubahan tabel atau repair row.

## Stop Conditions

Stop tanpa apply jika:

- signature, return type, owner, security mode, atau search path berbeda;
- ada marker `version_number` nonnumeric yang belum direview;
- preflight menemukan job/status drift yang tidak disetujui;
- privilege tidak sesuai;
- hasil Query 2 live untuk rollback tidak tersedia;
- operator tidak memiliki approval dan akses database yang tepat;
- ada indikasi packet sedang dijalankan terhadap production yang salah.

## Rollback Criteria

Gunakan `04-rollback.sql` hanya jika verification gagal atau perubahan harus dibatalkan berdasarkan change control. Sebelum menjalankannya, operator wajib membandingkan setiap function body di file tersebut dengan output `pg_get_functiondef` yang disimpan dari Query 2 live sebelum apply. Jika berbeda, stop dan buat rollback packet baru dari output live tersebut; jangan menebak atau menggabungkan definisi. Rollback mengembalikan definisi RPC live baseline sebelum hardening, termasuk behavior lama yang menulis marker analysis ke `output_summary.version_number`. Karena behavior lama memiliki konflik marker, rollback harus diikuti incident note dan tidak boleh dianggap sebagai state aman jangka panjang.

Rollback tidak menghapus row, content, site version, pointer, atau marker yang sudah terbentuk.

## Operator dan Credential Rules

Hanya database operator yang berwenang boleh menjalankan SQL. Jangan menaruh password, service-role key, worker token, API key, email, nomor WhatsApp, job ID, atau payload analysis di dokumen, command history, screenshot, atau laporan. Query packet hanya menampilkan metadata dan aggregate count.

## Timestamp Record

Catat timestamp UTC untuk preflight, apply, verify, dan bila perlu rollback pada change record eksternal yang disetujui. Jangan menulis credential atau row data ke record tersebut.