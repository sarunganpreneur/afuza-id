import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import SiteRenderer from "@/components/site-renderer";
import { getOwnedSiteReview } from "@/lib/sites/review";
import { createClient } from "@/lib/supabase/server";
import ReviewControls from "./review-controls";
import ReviewProgress from "./review-progress";
import { isGenerationReviewReady } from "@/lib/generation/progress";

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ version?: string }> }) {
  const { siteId } = await params;
  const query = await searchParams;
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect("/login");
  const review = await getOwnedSiteReview(siteId);
  if (!review) notFound();
  const newestUnpublishedVersion = review.site.published_version !== null
    && review.site.current_content_version > review.site.published_version
    ? review.site.current_content_version
    : null;
  const explicitVersion = query.version ? Number(query.version) : null;
  const requestedVersion = explicitVersion !== null
    && Number.isInteger(explicitVersion)
    && explicitVersion > 0
    && review.versions.some((version) => version.version_number === explicitVersion)
    ? explicitVersion
    : newestUnpublishedVersion ?? review.site.published_version ?? review.versions[0]?.version_number;
  const selected = review.versions.find((version) => version.version_number === requestedVersion);
  const generationStatus = review.generationJobs[0]?.status ?? "";
  const reviewReady = isGenerationReviewReady({
    status: generationStatus,
    currentContentVersion: review.site.current_content_version,
    versions: review.versions,
  });
  return <main className="review-page">
    <div className="review-heading"><div><Link href={`/dashboard/sites/${siteId}/brief`}>Kembali ke brief</Link><p className="review-eyebrow">Review website</p><h1>{review.site.name}</h1><p>/{review.site.slug}</p></div>{review.site.published_version && <Link className="review-public-link" href={`/p/${review.site.slug}`}>Lihat Website</Link>}</div>
    <ReviewProgress status={generationStatus} reviewReady={reviewReady} />
    {reviewReady && <><section className="review-layout"><div className="review-toolbar"><div><h2>Version</h2><div className="review-version-links">{review.versions.length === 0 ? <p>Belum ada version yang dapat direview.</p> : review.versions.map((version) => <Link className={selected?.version_number === version.version_number ? "selected" : ""} key={version.id} href={`/dashboard/sites/${siteId}/review?version=${version.version_number}`}>v{version.version_number}{review.site.published_version === version.version_number ? " · Published" : ""}</Link>)}</div></div><p className="review-preview-note">Preview website</p></div><div className="review-preview">{selected ? <SiteRenderer content={selected.content} /> : <p>Version tidak valid atau snapshot belum aman untuk dirender.</p>}</div></section>
    <ReviewControls siteId={siteId} versionNumber={selected?.version_number} siteStatus={review.site.status} publishedVersion={review.site.published_version} slug={review.site.slug} /></>}
  </main>;
}