"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { publishSiteVersion, unpublishSite } from "@/app/actions/publish";
import { publicSiteUrl, publishViewState } from "@/lib/sites/publish-view";

export default function ReviewControls({ siteId, versionNumber, siteStatus, publishedVersion, slug }: {
  siteId: string;
  versionNumber?: number;
  siteStatus: string;
  publishedVersion: number | null;
  slug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  if (!versionNumber) return null;

  const state = publishViewState(siteStatus, publishedVersion, versionNumber);
  const url = publicSiteUrl(slug);
  const publish = () => {
    if (pending || state === "published" || !window.confirm("Versi yang sedang direview akan menjadi versi publik website.")) return;
    startTransition(async () => {
      const result = await publishSiteVersion(siteId, versionNumber);
      setMessage(result.ok ? "Website sudah online" : "Website belum berhasil dipublish. Silakan coba lagi.");
      if (result.ok) router.refresh();
    });
  };
  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const unpublish = () => {
    if (!window.confirm("Unpublish website ini?")) return;
    startTransition(async () => {
      const result = await unpublishSite(siteId);
      setMessage(result.ok ? "Website berhasil di-unpublish." : "Website belum dapat di-unpublish.");
      if (result.ok) router.refresh();
    });
  };

  if (state === "published") {
    return <div className="review-controls">
      <strong>Website sudah online</strong>
      <p>Website Anda sudah dapat diakses oleh publik.</p>
      <div className="flex flex-wrap gap-3">
        <Link href={url} target="_blank" rel="noreferrer">Buka Website</Link>
        <button type="button" onClick={copyLink} disabled={pending}>Salin Link</button>
        <button type="button" onClick={unpublish} disabled={pending}>Unpublish</button>
      </div>
      {copied && <p role="status">Link berhasil disalin</p>}
      {message && <p role="status">{message}</p>}
    </div>;
  }

  return <div className="review-controls">
    {state === "newer" && <p>Versi ini belum dipublish.</p>}
    <p>Versi yang sedang direview akan menjadi versi publik website.</p>
    <button type="button" aria-label="Publish version" onClick={publish} disabled={pending}>{pending ? "Sedang mempublish..." : state === "newer" ? "Publish Versi Ini" : "Publish Website"}</button>
    {message && <p role="status">{message}</p>}
  </div>;
}
