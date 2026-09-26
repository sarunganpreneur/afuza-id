"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { dashboardStateLabel, getDashboardSiteState, hasActiveDashboardGeneration, type DashboardSiteState } from "@/lib/sites/dashboard-state";

type DashboardSite = {
  id: string;
  name: string;
  slug: string;
  siteStatus: string;
  currentContentVersion: number;
  publishedVersion: number | null;
  latestJobStatus: string | null;
  latestValidVersion: { versionNumber: number; schemaVersion: string } | null;
  createdAt: string;
};

const stateStyles: Record<DashboardSiteState, string> = {
  ONLINE: "bg-emerald-50 text-emerald-800",
  READY_TO_REVIEW: "bg-amber-50 text-amber-800",
  GENERATING: "bg-sky-50 text-sky-800",
  FAILED: "bg-red-50 text-red-800",
  DRAFT: "bg-slate-100 text-slate-700",
};

export default function DashboardSites({ sites }: { sites: DashboardSite[] }) {
  const router = useRouter();
  const polling = hasActiveDashboardGeneration(sites.map((site) => site.latestJobStatus));

  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [polling, router]);

  return <section className="grid gap-4 md:grid-cols-2">
    {sites.map((site) => {
      const state = getDashboardSiteState(site);
      const label = dashboardStateLabel(state, site.latestJobStatus);
      const newerVersion = state === "ONLINE" && site.currentContentVersion > (site.publishedVersion ?? 0);
      const reviewHref = `/dashboard/sites/${site.id}/review?version=${site.currentContentVersion}`;
      return <article key={site.id} className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
          <div className="min-w-0 flex-1">
            <h2 title={site.name} className="line-clamp-2 break-words text-xl font-bold leading-tight text-[var(--brand-dark)]">{site.name}</h2>
            <p title={`/${site.slug}`} className="mt-2 truncate text-sm text-[var(--muted)]">/{site.slug}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${stateStyles[state]}`}>{label}</span>
        </div>
        {newerVersion && <p className="mt-4 text-sm font-semibold text-amber-800">Ada versi baru yang belum dipublish</p>}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {state === "ONLINE" && <>
            <Link href={newerVersion ? reviewHref : `/p/${site.slug}`} target={newerVersion ? undefined : "_blank"} rel={newerVersion ? undefined : "noreferrer"} className="rounded-full bg-[var(--brand)] px-4 py-2 text-center text-sm font-bold text-white hover:bg-[var(--brand-dark)]">{newerVersion ? "Review Versi Baru" : "Buka Website"}</Link>
            <Link href={`/dashboard/sites/${site.id}/review`} className="rounded-full border border-[var(--brand)] px-4 py-2 text-center text-sm font-bold text-[var(--brand)]">Review</Link>
          </>}
          {state === "READY_TO_REVIEW" && <Link href={reviewHref} className="rounded-full bg-[var(--brand)] px-4 py-2 text-center text-sm font-bold text-white hover:bg-[var(--brand-dark)]">Review Website</Link>}
          {state === "GENERATING" && <Link href={`/dashboard/sites/${site.id}/review`} className="rounded-full bg-[var(--brand)] px-4 py-2 text-center text-sm font-bold text-white hover:bg-[var(--brand-dark)]">Lihat Proses</Link>}
          {state === "FAILED" && <Link href={`/dashboard/sites/${site.id}/brief`} className="rounded-full bg-[var(--brand)] px-4 py-2 text-center text-sm font-bold text-white hover:bg-[var(--brand-dark)]">Edit Brief</Link>}
          {state === "DRAFT" && <Link href={`/dashboard/sites/${site.id}/brief`} className="rounded-full bg-[var(--brand)] px-4 py-2 text-center text-sm font-bold text-white hover:bg-[var(--brand-dark)]">Lengkapi Brief</Link>}
          {state !== "DRAFT" && <Link href={`/dashboard/sites/${site.id}/brief`} className="rounded-full border border-[var(--brand)] px-4 py-2 text-center text-sm font-bold text-[var(--brand)]">Edit</Link>}
        </div>
        <p className="mt-5 text-xs text-[var(--muted)]">Dibuat {new Date(site.createdAt).toLocaleDateString("id-ID")}</p>
      </article>;
    })}
  </section>;
}