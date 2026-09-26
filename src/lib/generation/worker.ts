import { z } from "zod";

import {
  buildWebsiteAnalysisInput,
  parseWebsiteAnalysisV1,
  type WebsiteAnalysisInputV1,
  type WebsiteAnalysisV1,
  validateHalalAnalysisSafety,
  validateWebsiteAnalysisGrounding,
  getWebsiteAnalysisRepairIssues,
  getTestimonialSectionDiagnostic,
  hasTestimonialEvidence,
  normalizeWebsiteAnalysisAllowedClaims,
  normalizeWebsiteAnalysisAllowedClaimsOutput,
  normalizeUnsupportedTestimonialClaims,
} from "@/lib/server/website-analysis";
import {
  getSiteContentValidationDiagnostics,
  normalizeSiteContentWhatsAppCtas,
  normalizeAndValidateSiteContentV1,
  validateSiteContentV1Semantics,
} from "@/lib/site-content/validation";
import type { SiteContentV1 } from "@/lib/site-content/schema";
import type { GeneratedImageStorageV1, ImageGenerationProviderV1 } from "./images/contracts";
import { runImagePipelineV1 } from "./images/pipeline";
import type { ImageRequestContextV1 } from "./images/requests";

const JobIdSchema = z.string().uuid();

export type ClaimedGenerationJob = {
  job_id: string;
  site_id: string;
  job_type: string;
  status: "ANALYZING";
  retry_count: number;
  input_snapshot: unknown;
};

export type GenerationProvider = {
  generateAnalysis(input: WebsiteAnalysisInputV1): Promise<unknown>;
  repairAnalysis?: (input: {
    source: WebsiteAnalysisInputV1;
    previous: unknown;
    validationIssues: string[];
  }) => Promise<unknown>;
  correctAnalysis?: (input: {
    source: WebsiteAnalysisInputV1;
    previous: unknown;
    invalidPath: string;
  }) => Promise<unknown>;
  generateContent(input: { source: WebsiteAnalysisInputV1; analysis: WebsiteAnalysisV1 }): Promise<unknown>;
};

export type GenerationWorkerClient = {
  rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
  readGenerationJobStatus(jobId: string): Promise<{ status: string } | null>;
};

export type GenerationWorkerDeps = {
  client: GenerationWorkerClient;
  provider: GenerationProvider;
  commitContent: (job: ClaimedGenerationJob, content: SiteContentV1) => Promise<void>;
  imageProvider?: ImageGenerationProviderV1;
  imageStorage?: GeneratedImageStorageV1;
  log?: (event: string, fields?: Record<string, unknown>) => void;
};

export type GenerationWorkerResult =
  | { kind: "no_work" }
  | { kind: "committed"; jobId: string }
  | { kind: "failed"; jobId: string; errorCode: string };

class WorkerFailure extends Error {
  constructor(readonly errorCode: string, message: string) {
    super(message);
  }
}

const ACTIVE_FAILURE_STAGES = new Set([
  "ANALYZING",
  "GENERATING_CONTENT",
  "GENERATING_IMAGES",
  "RENDERING",
]);

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? row as Record<string, unknown> : null;
}

async function callRpc(client: GenerationWorkerClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await client.rpc(name, args);
  if (result.error) throw new WorkerFailure(`${name.toUpperCase()}_FAILED`, result.error.message ?? name);
  return result.data;
}

function claimedJob(data: unknown): ClaimedGenerationJob | null {
  const row = firstRow(data);
  if (!row) return null;
  const parsed = z.object({
    job_id: JobIdSchema,
    site_id: JobIdSchema,
    job_type: z.string(),
    status: z.literal("ANALYZING"),
    retry_count: z.number().int().nonnegative(),
    input_snapshot: z.unknown(),
  }).safeParse(row);
  return parsed.success ? parsed.data : null;
}

async function recordGenerationFailureSafely(client: GenerationWorkerClient, jobId: string, currentStage: string, errorCode: string, errorMessage: string, log: GenerationWorkerDeps["log"]): Promise<void> {
  const recordFailure = async (expectedStatus: string): Promise<void> => {
    await callRpc(client, "fail_generation_job", {
      p_job_id: jobId,
      p_expected_status: expectedStatus,
      p_error_code: errorCode.slice(0, 100),
      p_error_message: errorMessage.slice(0, 2000),
    });
  };
  let attemptedStatus = currentStage;
  let lastError: unknown;

  try {
    await recordFailure(attemptedStatus);
    return;
  } catch (error) {
    lastError = error;
  }

  let actualStatus: string | null = null;
  try {
    actualStatus = (await client.readGenerationJobStatus(jobId))?.status ?? null;
  } catch (error) {
    lastError = error;
  }

  if (actualStatus === "ERROR") return;
  if (actualStatus && ACTIVE_FAILURE_STAGES.has(actualStatus)) {
    attemptedStatus = actualStatus;
  }

  try {
    await recordFailure(attemptedStatus);
    return;
  } catch (error) {
    lastError = error;
  }

  log?.("failure_recording_failed", {
    jobId,
    errorCode,
    attemptedStatus,
    actualStatus,
    recorderErrorCode: lastError instanceof WorkerFailure ? lastError.errorCode : "FAIL_GENERATION_JOB_FAILED",
    recorderMessage: lastError instanceof Error ? lastError.message.slice(0, 240) : "unknown",
  });
}

export async function runGenerationOnce(deps: GenerationWorkerDeps): Promise<GenerationWorkerResult> {
  const log = deps.log ?? (() => undefined);
  let job: ClaimedGenerationJob | null = null;
  let currentStage = "ANALYZING";

  try {
    const claimData = await callRpc(deps.client, "claim_next_generation_job", {});
    job = claimedJob(claimData);
    if (!job) return { kind: "no_work" };

    const inputResult = buildWebsiteAnalysisInput(job.input_snapshot);
    if (!inputResult.success) throw new WorkerFailure("ANALYSIS_INPUT_INVALID", inputResult.error);

    const rawAnalysis = await deps.provider.generateAnalysis(inputResult.data);
    const normalizedRawAnalysis = normalizeWebsiteAnalysisAllowedClaimsOutput(rawAnalysis, inputResult.data);
    let analysisResult = parseWebsiteAnalysisV1(normalizedRawAnalysis);
    if (!analysisResult.success) {
      const repairIssues = getWebsiteAnalysisRepairIssues(analysisResult.error.issues);
      if (repairIssues && deps.provider.repairAnalysis) {
        const validationIssues = repairIssues.map((issue) => `${issue.path.join(".") || "root"}:${issue.code}`);
        const repairedAnalysis = await deps.provider.repairAnalysis({
          source: inputResult.data,
          previous: rawAnalysis,
          validationIssues,
        });
        analysisResult = parseWebsiteAnalysisV1(repairedAnalysis);
      }
    }
    if (!analysisResult.success) {
      const issueSummary = analysisResult.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join(".") || "root"}:${issue.code}`)
        .join(",");
      throw new WorkerFailure("INVALID_ANALYSIS_OUTPUT", `Provider output did not match website_analysis_v1 (${issueSummary || "schema"})`);
    }
    const testimonialDiagnostic = getTestimonialSectionDiagnostic(analysisResult.data, inputResult.data);
    if (!hasTestimonialEvidence(inputResult.data) && testimonialDiagnostic && deps.provider.correctAnalysis) {
      const correctedAnalysis = await deps.provider.correctAnalysis({
        source: inputResult.data,
        previous: analysisResult.data,
        invalidPath: testimonialDiagnostic.path,
      });
      analysisResult = parseWebsiteAnalysisV1(correctedAnalysis);
      if (!analysisResult.success) {
        throw new WorkerFailure("INVALID_ANALYSIS_OUTPUT", "Provider correction did not match website_analysis_v1");
      }
    }
    const normalizedTestimonial = normalizeUnsupportedTestimonialClaims(analysisResult.data, inputResult.data);
    const normalizedClaims = normalizeWebsiteAnalysisAllowedClaims(normalizedTestimonial.analysis, inputResult.data);
    analysisResult = parseWebsiteAnalysisV1(normalizedClaims.analysis);
    if (!analysisResult.success) {
      throw new WorkerFailure("INVALID_ANALYSIS_OUTPUT", "Normalized analysis did not match website_analysis_v1");
    }
    const halalResult = validateHalalAnalysisSafety(analysisResult.data);
    if (!halalResult.ok) throw new WorkerFailure(halalResult.error, halalResult.error);
    const groundingResult = validateWebsiteAnalysisGrounding(analysisResult.data, inputResult.data);
    if (!groundingResult.ok) throw new WorkerFailure(groundingResult.error, groundingResult.error);

    await callRpc(deps.client, "complete_generation_analysis", {
      p_job_id: job.job_id,
      p_site_id: job.site_id,
      p_analysis_version: analysisResult.data.schema_version,
      p_analysis_payload: analysisResult.data,
    });
    currentStage = "GENERATING_CONTENT";

    const rawContent = await deps.provider.generateContent({ source: inputResult.data, analysis: analysisResult.data });
    const normalizedCtas = normalizeSiteContentWhatsAppCtas(rawContent, inputResult.data.business.whatsapp);
    const contentResult = normalizeAndValidateSiteContentV1(normalizedCtas);
    if (!contentResult.success) {
      const issueSummary = getSiteContentValidationDiagnostics(contentResult)
        .map((issue) => `${issue.path}:${issue.code}${issue.ruleIdentifier ? `:${issue.ruleIdentifier}` : ""}`)
        .join(",");
      throw new WorkerFailure("INVALID_SITE_CONTENT", `Provider output did not match site_content_v1 (${issueSummary || "schema"})`);
    }
    const semantics = validateSiteContentV1Semantics(contentResult.data);
    if (!semantics.ok) throw new WorkerFailure("INVALID_SITE_CONTENT_SEMANTICS", semantics.errors.join(","));

    if (deps.imageProvider && deps.imageStorage) {
      await callRpc(deps.client, "advance_generation_job", {
        p_job_id: job.job_id,
        p_expected_status: "GENERATING_CONTENT",
        p_next_status: "GENERATING_IMAGES",
      });
      currentStage = "GENERATING_IMAGES";
      const imageContext: ImageRequestContextV1 = {
        siteId: job.site_id,
        generationJobId: job.job_id,
        retryCount: job.retry_count,
        source: inputResult.data,
        analysis: analysisResult.data,
      };
      const imageResult = await runImagePipelineV1(contentResult.data, imageContext, {
        provider: deps.imageProvider,
        storage: deps.imageStorage,
      });
      await deps.commitContent(job, imageResult.content);
      await callRpc(deps.client, "advance_generation_job", {
        p_job_id: job.job_id,
        p_expected_status: "GENERATING_IMAGES",
        p_next_status: "RENDERING",
      });
      currentStage = "RENDERING";
      log("generation_committed", { jobId: job.job_id, ...imageResult.summary });
    } else {
      await deps.commitContent(job, contentResult.data);
      await callRpc(deps.client, "advance_generation_job", {
        p_job_id: job.job_id,
        p_expected_status: "GENERATING_CONTENT",
        p_next_status: "RENDERING",
      });
      currentStage = "RENDERING";
      log("generation_committed", { jobId: job.job_id });
    }
    return { kind: "committed", jobId: job.job_id };
  } catch (error) {
    const errorCode = error instanceof WorkerFailure ? error.errorCode : "GENERATION_WORKER_FAILED";
    const message = error instanceof Error ? error.message : "Generation worker failed";
    if (job) await recordGenerationFailureSafely(deps.client, job.job_id, currentStage, errorCode, message, log);
    if (job) {
      const fields: Record<string, unknown> = { jobId: job.job_id, errorCode };
      if (errorCode === "INVALID_SITE_CONTENT" || errorCode === "INVALID_SITE_CONTENT_SEMANTICS") {
        fields.diagnostics = message.slice(0, 2000);
      }
      log("generation_failed", fields);
    }
    return job ? { kind: "failed", jobId: job.job_id, errorCode } : Promise.reject(error);
  }
}