import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { generatedImageStoragePath } from "@/lib/generation/images/storage";
import { IMAGE_STORAGE_BUCKET_V1 } from "@/lib/generation/images/supabase-storage";
import { AUTH_RESULT, authenticateWorkerRequest } from "@/lib/server/worker/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

const UploadEnvelopeSchema = z
  .object({
    siteId: z.string().uuid(),
    generationJobId: z.string().uuid(),
    requestId: z.string().min(1).regex(SAFE_ID),
    retryCount: z.number().int().nonnegative(),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    bytesBase64: z.string().min(1),
  })
  .strict();

function jsonError(status: number, code: string) {
  return NextResponse.json(
    { ok: false, code },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function decodeBase64(value: string): Uint8Array | null {
  if (value.length % 4 !== 0) {
    return null;
  }

  try {
    const bytes = Buffer.from(value, "base64");

    if (bytes.byteLength === 0) {
      return null;
    }

    if (bytes.toString("base64") !== value) {
      return null;
    }

    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  return Buffer.from(left).equals(Buffer.from(right));
}

function isStorageCollision(error: {
  statusCode?: string;
  message?: string;
} | null | undefined) {
  const message = String(error?.message ?? "").toLowerCase();

  return (
    String(error?.statusCode ?? "") === "409" ||
    message.includes("already exists") ||
    message.includes("duplicate")
  );
}

function successResponse(input: {
  storagePath: string;
  publicUrl: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}) {
  return NextResponse.json(
    {
      ok: true,
      storagePath: input.storagePath,
      publicUrl: input.publicUrl,
      mimeType: input.mimeType,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: Request) {
  const auth = authenticateWorkerRequest(request);

  if (auth.status === AUTH_RESULT.UNAUTHORIZED) {
    return jsonError(401, "UNAUTHORIZED");
  }

  if (auth.status === AUTH_RESULT.MISCONFIGURED) {
    return jsonError(503, "WORKER_AUTH_UNAVAILABLE");
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "MALFORMED_JSON");
  }

  const envelope = UploadEnvelopeSchema.safeParse(payload);

  if (!envelope.success) {
    return jsonError(400, "INVALID_IMAGE_UPLOAD_ENVELOPE");
  }

  if (envelope.data.bytesBase64.length > MAX_BASE64_LENGTH) {
    const estimatedBytes = Math.floor(
      (envelope.data.bytesBase64.length * 3) / 4,
    );

    if (estimatedBytes > MAX_IMAGE_BYTES + 2) {
      return jsonError(413, "IMAGE_SIZE_LIMIT_EXCEEDED");
    }
  }

  const bytes = decodeBase64(envelope.data.bytesBase64);

  if (!bytes) {
    return jsonError(400, "INVALID_IMAGE_DATA");
  }

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return jsonError(413, "IMAGE_SIZE_LIMIT_EXCEEDED");
  }

  const supabase = await getServiceRoleClient();

  if (!supabase) {
    return jsonError(503, "GENERATION_IMAGE_UPLOAD_UNAVAILABLE");
  }

  try {
    const { data: job, error: jobError } = await supabase
      .from("generation_jobs")
      .select("id, site_id, status")
      .eq("id", envelope.data.generationJobId)
      .maybeSingle();

    if (jobError) {
      console.warn(
        JSON.stringify({
          route: "/api/internal/generation/images/upload",
          operation: "read_job",
          database_error_code: "GENERATION_IMAGE_JOB_QUERY_ERROR",
          code: jobError.code,
        }),
      );

      return jsonError(500, "GENERATION_IMAGE_UPLOAD_FAILED");
    }

    if (!job) {
      return jsonError(404, "GENERATION_JOB_NOT_FOUND");
    }

    if (
      typeof job !== "object" ||
      job.id !== envelope.data.generationJobId ||
      job.site_id !== envelope.data.siteId ||
      job.status !== "GENERATING_IMAGES"
    ) {
      return jsonError(409, "GENERATION_IMAGE_UPLOAD_CONFLICT");
    }

    const storagePath = generatedImageStoragePath({
      siteId: envelope.data.siteId,
      generationJobId: envelope.data.generationJobId,
      requestId: envelope.data.requestId,
      retryCount: envelope.data.retryCount,
      mimeType: envelope.data.mimeType,
    });

    const bucket = supabase.storage.from(IMAGE_STORAGE_BUCKET_V1);

    const upload = await bucket.upload(
      storagePath,
      new Blob([bytes as unknown as BlobPart], {
        type: envelope.data.mimeType,
      }),
      {
        contentType: envelope.data.mimeType,
        upsert: false,
      },
    );

    const publicUrl = bucket.getPublicUrl(storagePath).data.publicUrl;

    if (!upload.error) {
      return successResponse({
        storagePath,
        publicUrl,
        mimeType: envelope.data.mimeType,
      });
    }

    if (isStorageCollision(upload.error)) {
      const { data: existing, error: downloadError } =
        await bucket.download(storagePath);

      if (downloadError) {
        const statusCode = String(downloadError.statusCode ?? "");

        if (statusCode === "400" || statusCode === "404") {
          return jsonError(409, "GENERATION_IMAGE_STORAGE_CONFLICT");
        }

        console.warn(
          JSON.stringify({
            route: "/api/internal/generation/images/upload",
            operation: "verify_replay",
            storage_error_code: "IMAGE_STORAGE_DOWNLOAD_ERROR",
            statusCode,
          }),
        );

        return jsonError(500, "GENERATION_IMAGE_UPLOAD_FAILED");
      }

      if (!existing || typeof existing.arrayBuffer !== "function") {
        return jsonError(409, "GENERATION_IMAGE_STORAGE_CONFLICT");
      }

      const existingBytes = new Uint8Array(await existing.arrayBuffer());

      if (!bytesEqual(existingBytes, bytes)) {
        return jsonError(409, "GENERATION_IMAGE_STORAGE_CONFLICT");
      }

      return successResponse({
        storagePath,
        publicUrl,
        mimeType: envelope.data.mimeType,
      });
    }

    console.warn(
      JSON.stringify({
        route: "/api/internal/generation/images/upload",
        operation: "upload",
        storage_error_code: "IMAGE_STORAGE_UPLOAD_ERROR",
        statusCode: upload.error.statusCode,
      }),
    );

    return jsonError(500, "GENERATION_IMAGE_UPLOAD_FAILED");
  } catch {
    console.warn(
      JSON.stringify({
        route: "/api/internal/generation/images/upload",
        operation: "upload",
        storage_error_code: "IMAGE_STORAGE_UPLOAD_EXCEPTION",
      }),
    );

    return jsonError(500, "GENERATION_IMAGE_UPLOAD_FAILED");
  }
}
