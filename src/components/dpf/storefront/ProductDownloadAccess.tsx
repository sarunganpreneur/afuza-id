"use client";

import { useState } from "react";

export function ProductDownloadAccess({ productId }: { productId: string }) {
  const [assetUrls, setAssetUrls] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function requestAccess() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/storefront/delivery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const result = await response.json() as { assetUrls?: string[]; error?: string };
      if (!response.ok || !result.assetUrls?.length) throw new Error(result.error ?? "File belum tersedia.");
      setAssetUrls(result.assetUrls);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "File belum tersedia.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button className="dpf-button" type="button" onClick={requestAccess} disabled={pending}>
        {pending ? "Memeriksa akses..." : "Akses file"}
      </button>
      {error && <p role="alert">{error}</p>}
      {assetUrls?.map((url, index) => <a className="dpf-inline-link" href={url} key={url} target="_blank" rel="noreferrer">Unduh file {index + 1}</a>)}
    </div>
  );
}