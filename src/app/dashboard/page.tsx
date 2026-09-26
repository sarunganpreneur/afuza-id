import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardSites from "./dashboard-sites";

export default function DashboardPage() {
  return <DashboardContent />;
}

async function DashboardContent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: sites, error } = await supabase
    .from("sites")
    .select("id, name, slug, status, current_content_version, published_version, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="rounded-3xl border border-[var(--line)] bg-white p-8 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Ruang kerja</p>
        <h1 className="mt-3 text-3xl font-bold text-[var(--brand-dark)]">Website Saya</h1>
        <p className="mt-4 text-[var(--muted)]">Website belum dapat dimuat. Silakan coba kembali.</p>
      </main>
    );
  }

  const siteIds = (sites ?? []).map((site) => site.id);
  const [{ data: jobs }, { data: versions }] = siteIds.length === 0 ? [{ data: [] }, { data: [] }] : await Promise.all([
    supabase.from("generation_jobs").select("id, site_id, status, retry_count, created_at").in("site_id", siteIds).order("created_at", { ascending: false }),
    supabase.from("site_versions").select("id, site_id, version_number, content_snapshot").in("site_id", siteIds).order("version_number", { ascending: false }),
  ]);
  const dashboardSites = (sites ?? []).map((site) => {
    const latestJob = (jobs ?? []).find((job) => job.site_id === site.id);
    const latestVersion = (versions ?? []).find((version) => version.site_id === site.id && version.content_snapshot?.schemaVersion === "site_content_v1");
    return {
      id: site.id,
      name: site.name,
      slug: site.slug,
      siteStatus: site.status,
      currentContentVersion: site.current_content_version,
      publishedVersion: site.published_version,
      latestJobStatus: latestJob?.status ?? null,
      latestValidVersion: latestVersion ? { versionNumber: latestVersion.version_number, schemaVersion: latestVersion.content_snapshot.schemaVersion } : null,
      createdAt: site.created_at,
    };
  });

  return (
    <main className="space-y-6">
      <section className="flex flex-col justify-between gap-5 rounded-3xl border border-[var(--line)] bg-white p-8 shadow-sm sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Ruang kerja</p>
          <h1 className="mt-3 text-3xl font-bold text-[var(--brand-dark)]">Website Saya</h1>
          <p className="mt-4 text-[var(--muted)]">Kelola rancangan website bisnis Anda di satu tempat.</p>
        </div>
        <Link href="/dashboard/sites/new" className="rounded-full bg-[var(--brand)] px-5 py-3 text-center text-sm font-bold text-white hover:bg-[var(--brand-dark)]">Buat Website dengan AI</Link>
      </section>

      {sites.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[var(--line)] bg-white p-8">
          <h2 className="text-xl font-bold text-[var(--brand-dark)]">Belum ada website</h2>
          <p className="mt-2 text-[var(--muted)]">Buat website pertama Anda dengan AI.</p>
          <Link href="/dashboard/sites/new" className="mt-6 inline-block rounded-full border border-[var(--brand)] px-5 py-3 text-sm font-bold text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white">Mulai Buat Website</Link>
        </section>
      ) : (
        <DashboardSites sites={dashboardSites} />
      )}
    </main>
  );
}