import Link from "next/link";
import NewSiteForm from "./new-site-form";

export default function NewSitePage() {
  return (
    <main className="rounded-3xl border border-[var(--line)] bg-white p-8 shadow-sm">
      <Link href="/dashboard" className="text-sm font-semibold text-[var(--brand)]">Kembali ke Website Saya</Link>
      <p className="mt-8 text-sm font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Mulai di sini</p>
      <h1 className="mt-3 text-3xl font-bold text-[var(--brand-dark)]">Buat website pertama Anda</h1>
      <p className="mt-4 max-w-2xl text-[var(--muted)]">
        Ceritakan bisnis Anda. AI akan membantu membuat konten, gambar, dan website.
      </p>
      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ["01", "Ceritakan bisnis Anda"],
          ["02", "AI membuat website"],
          ["03", "Review lalu publish"],
        ].map(([number, label]) => <li key={number} className="rounded-2xl border border-[var(--line)] bg-[var(--background)] p-4">
          <span className="text-xs font-bold text-[var(--brand)]">{number}</span>
          <p className="mt-2 text-sm font-semibold text-[var(--brand-dark)]">{label}</p>
        </li>)}
      </ol>
      <NewSiteForm />
    </main>
  );
}
