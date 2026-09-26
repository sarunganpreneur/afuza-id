import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BriefForm from "./brief-form";

type BriefPageProps = {
  params: Promise<{ siteId: string }>;
};

export default async function BriefPage({ params }: BriefPageProps) {
  const { siteId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id, name, slug, status, current_content_version, business_id")
    .eq("id", siteId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (siteError || !site) notFound();

  const [{ data: business, error: businessError }, { data: brief, error: briefError }] = await Promise.all([
    supabase
      .from("businesses")
      .select("name, business_type, target_market, products_services, usp, whatsapp, address, halal_status")
      .eq("id", site.business_id)
      .eq("owner_id", user.id)
      .maybeSingle(),
    supabase
      .from("site_briefs")
      .select("website_goal, primary_cta, style_preference, color_preference, reference_urls, notes, image_mode, extra_answers")
      .eq("site_id", site.id)
      .maybeSingle(),
  ]);

  if (businessError || briefError || !business) notFound();

  const values = {
    business_type: business.business_type ?? "",
    target_market: business.target_market ?? "",
    products_services: business.products_services ?? "",
    usp: business.usp ?? "",
    whatsapp: business.whatsapp ?? "",
    address: business.address ?? "",
    website_goal: brief?.website_goal ?? "",
    primary_cta: brief?.primary_cta ?? "",
    style_preference: brief?.style_preference ?? "",
    color_preference: brief?.color_preference ?? "",
    reference_urls: brief?.reference_urls ?? "",
    notes: brief?.notes ?? "",
    image_mode: brief?.image_mode ?? "AI",
    halal_status: brief?.extra_answers?.halal_status ?? business.halal_status ?? "",
  };

  return (
    <main className="rounded-3xl border border-[var(--line)] bg-white p-8 shadow-sm">
      <Link href="/dashboard" className="text-sm font-semibold text-[var(--brand)]">Kembali ke Website Saya</Link>
      <Link href={`/dashboard/sites/${site.id}/review`} className="ml-4 text-sm font-semibold text-[var(--brand)]">Review</Link>
      <p className="mt-8 text-sm font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Website draft</p>
      <h1 className="mt-3 text-3xl font-bold text-[var(--brand-dark)]">Lengkapi Brief Website</h1>
      <p className="mt-4 max-w-2xl text-[var(--muted)]">
        Lengkapi informasi berikut agar Afuza.id dapat memahami bisnis dan menyusun website yang sesuai.
      </p>

      <dl className="mt-8 grid gap-5 rounded-2xl border border-[var(--line)] bg-[var(--background)] p-6 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-[var(--muted)]">Nama Website</dt>
          <dd className="mt-1 font-bold text-[var(--brand-dark)]">{site.name}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--muted)]">Slug</dt>
          <dd className="mt-1 font-bold text-[var(--brand-dark)]">{site.slug}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--muted)]">Status</dt>
          <dd className="mt-1 font-bold uppercase text-[var(--brand)]">{site.status}</dd>
        </div>
      </dl>
      <BriefForm siteId={site.id} businessName={business.name} currentContentVersion={site.current_content_version} values={values} />
    </main>
  );
}
