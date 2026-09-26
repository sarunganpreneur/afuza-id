import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";

import { createOpenAiGenerationProvider, OPENAI_MODEL, OpenAiProviderError } from "../src/lib/generation/openai";
import {
  buildWebsiteAnalysisInput,
  getWebsiteAnalysisRepairIssues,
  getWebsiteAnalysisGroundingDiagnostic,
  getTestimonialSectionDiagnostic,
  hasTestimonialEvidence,
  normalizeWebsiteAnalysisAllowedClaims,
  isWebsiteAnalysisDomainCompletionIssue,
  parseWebsiteAnalysisV1,
  validateHalalAnalysisSafety,
  validateWebsiteAnalysisGrounding,
} from "../src/lib/server/website-analysis";
import type { WebsiteAnalysisInputV1, WebsiteAnalysisV1 } from "../src/lib/server/website-analysis";
import type { SiteContentV1 } from "../src/lib/site-content/schema";
import { SiteContentV1Schema } from "../src/lib/site-content/schema";
import { getSiteContentSemanticDiagnostics, getSiteContentValidationDiagnostics, normalizeAndValidateSiteContentV1, normalizeSiteContentInternalTargets, validateSafeTarget } from "../src/lib/site-content/validation";
import { MockImageGenerationProviderV1 } from "../src/lib/generation/images/mock-provider";
import { controlledStorageCleanupSucceeded, createGeneratedImageStorage } from "../src/lib/generation/images/storage";
import { runImagePipelineV1 } from "../src/lib/generation/images/pipeline";
import { createOpenAiImageGenerationProvider } from "../src/lib/generation/images/openai";
import { createSupabaseGeneratedImageStorageV1, IMAGE_STORAGE_BUCKET_V1 } from "../src/lib/generation/images/supabase-storage";
import type { ImageRole } from "../src/lib/generation/images/contracts";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  const value = process.argv.find((entry) => entry.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() || null : null;
}

function integerArgument(name: string, fallback: number): number {
  const value = argument(name);
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`Invalid --${name}`);
  return parsed;
}

function present(value: string | null | undefined): "PRESENT" | "ABSENT" {
  return value?.trim() ? "PRESENT" : "ABSENT";
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function customIssueCategory(message: string): string {
  if (message.includes("SUPERLATIVE") || message.includes("QUALITY")) return "unsupported quality/superiority claim";
  if (message.includes("TESTIMONIAL")) return "testimonial/social-proof claim";
  if (message.includes("PRICE") || message.includes("PRODUCT")) return "price/product claim";
  if (message.includes("SERVICE") || message.includes("FOOD")) return "unsupported factual claim";
  return "other custom validation";
}

function reportContentGuardrails(value: unknown, issues: readonly { path: PropertyKey[]; code: string; message: string }[]): void {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const guardrails = record.content_guardrails && typeof record.content_guardrails === "object"
    ? record.content_guardrails as Record<string, unknown>
    : {};
  const allowedClaims = Array.isArray(guardrails.allowed_claims) ? guardrails.allowed_claims : [];
  const prohibitedClaims = Array.isArray(guardrails.prohibited_claims) ? guardrails.prohibited_claims : [];
  const guardrailIssues = issues.filter((issue) => issue.path[0] === "content_guardrails" || issue.path[0] === "section_plan");
  console.log("Provider structural output:");
  console.log(`content_guardrails fields: ${Object.keys(guardrails).sort().join(",") || "none"}`);
  console.log(`halal_status type: ${typeof guardrails.halal_status}`);
  console.log(`halal_status category: ${typeof guardrails.halal_status === "string" ? "enum" : "invalid"}`);
  console.log(`allowed_claims type: ${Array.isArray(guardrails.allowed_claims) ? "array" : typeof guardrails.allowed_claims}`);
  console.log(`allowed_claims count: ${allowedClaims.length}`);
  console.log(`prohibited_claims type: ${Array.isArray(guardrails.prohibited_claims) ? "array" : typeof guardrails.prohibited_claims}`);
  console.log(`prohibited_claims count: ${prohibitedClaims.length}`);
  console.log(`custom grounding rule: ${guardrailIssues.some((issue) => issue.code === "custom" && issue.path.join(".") === "content_guardrails") ? "FAIL" : "PASS"}`);
  console.log(`custom allowed-claims rule: ${guardrailIssues.some((issue) => issue.message === "UNSUPPORTED_ALLOWED_CLAIM") ? "FAIL" : "PASS"}`);
  console.log(`custom testimonial-section rule: ${guardrailIssues.some((issue) => issue.message === "UNSUPPORTED_TESTIMONIAL_CLAIM") ? "FAIL" : "PASS"}`);
  for (const issue of guardrailIssues.filter((candidate) => candidate.code === "custom")) {
    console.log(`failed rule: ${issue.message}`);
  }
}

function productsServicesCount(value: string): number {
  return value.split(/[\n,;]/).map((entry) => entry.trim()).filter(Boolean).length;
}

function sourceFactsCount(input: WebsiteAnalysisInputV1): number {
  const values: unknown[] = [
    input.site.name,
    input.business.name,
    input.business.business_type,
    input.business.target_market,
    input.business.products_services,
    input.business.usp,
    input.business.whatsapp,
    input.business.address,
    input.brief.website_goal,
    input.brief.primary_cta,
    input.brief.style_preference,
    input.brief.color_preference,
    input.brief.notes,
    input.brief.reference_urls,
  ];
  return values.filter((value) => Array.isArray(value) ? value.length > 0 : nonEmptyString(value)).length;
}

function reportInputSufficiency(input: WebsiteAnalysisInputV1): void {
  const briefText = [input.brief.website_goal, input.brief.primary_cta, input.brief.style_preference, input.brief.color_preference, input.brief.notes]
    .filter(nonEmptyString)
    .join(" ");
  console.log("Input sufficiency:");
  console.log(`business/site name: ${present(input.business.name)}`);
  console.log(`business type: ${present(input.business.business_type)}`);
  console.log(`target market: ${present(input.business.target_market)}`);
  console.log(`products/services count: ${productsServicesCount(input.business.products_services)}`);
  console.log(`USP: ${present(input.business.usp)}`);
  console.log(`CTA: ${present(input.brief.primary_cta)}`);
  console.log(`source facts count: ${sourceFactsCount(input)}`);
  console.log(`brief text length: ${briefText.length}`);
  console.log("analysis input schema valid: YES");
}

function invalidInternalCtaPaths(content: SiteContentV1): string[] {
  const paths: string[] = [];
  if (content.header.cta?.kind === "internal" && !validateSafeTarget(content.header.cta.target, "internal").ok) paths.push("content.header.cta");
  content.sections.forEach((section, index) => {
    const cta = "cta" in section ? section.cta : undefined;
    if (cta?.kind === "internal" && !validateSafeTarget(cta.target, "internal").ok) paths.push(`content.sections[${index}].cta`);
  });
  return paths;
}

function reportTargetNormalization(raw: unknown): void {
  const structural = SiteContentV1Schema.safeParse(raw);
  if (!structural.success) {
    console.log("SiteContentV1 structural validation: FAIL");
    return;
  }
  const content = structural.data;
  const normalized = normalizeSiteContentInternalTargets(content);
  const invalidNavigation = content.header.navigation
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !content.sections.some((section) => section.id === item.target));
  console.log("SiteContentV1 structural validation: PASS");
  console.log(`Section count: ${content.sections.length}`);
  console.log(`Navigation items before: ${content.header.navigation.length}`);
  const invalidFooterNavigation = content.footer.links
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !content.sections.some((section) => section.id === item.target));
  console.log(`Invalid navigation targets: ${invalidNavigation.map(({ index }) => `header.navigation[${index}]`).concat(invalidFooterNavigation.map(({ index }) => `footer.links[${index}]`)).join(",") || "none"}`);
  console.log(`Footer links before: ${content.footer.links.length}`);
  console.log(`Invalid footer links: ${invalidFooterNavigation.map(({ index }) => `footer.links[${index}]`).join(",") || "none"}`);
  console.log(`Navigation items after: ${normalized.header.navigation.length}`);
  console.log(`Footer links after: ${normalized.footer.links.length}`);
  const invalidHeaderCta = content.header.cta?.kind === "internal" && !validateSafeTarget(content.header.cta.target, "internal").ok;
  console.log(`Invalid header CTA target: ${invalidHeaderCta ? "header.cta" : "none"}`);
  console.log(`Header CTA after: ${normalized.header.cta ? `${normalized.header.cta.kind}:existing-target` : "REMOVED"}`);
  const invalidSectionCtas = invalidInternalCtaPaths(content).filter((path) => path !== "content.header.cta");
  console.log(`Invalid section CTA targets: ${invalidSectionCtas.join(",") || "none"}`);
  const normalizedSectionCtas = normalized.sections
    .map((section, index) => {
      const cta = "cta" in section ? section.cta : undefined;
      return cta ? `sections[${index}]:${cta.kind}:existing-target` : null;
    })
    .filter((value): value is string => value !== null);
  console.log(`Section CTA after: ${normalizedSectionCtas.join(",") || "none"}`);
  const semanticDiagnostics = getSiteContentSemanticDiagnostics(content);
  const imageDiagnostics = semanticDiagnostics.filter((diagnostic) => diagnostic.code === "UNSAFE_IMAGE_URL");
  console.log(`Unsafe image rule: ${imageDiagnostics.length ? imageDiagnostics[0].code : "none"}`);
  console.log(`Unsafe image path: ${imageDiagnostics.map((diagnostic) => diagnostic.path).join(",") || "none"}`);
  console.log(`Unsafe image category: ${imageDiagnostics.map((diagnostic) => diagnostic.category).join(",") || "none"}`);
  console.log("Image field optional/required: optional");
  console.log(`Image normalization/correction: ${imageDiagnostics.length ? "REMOVED_UNSAFE_OPTIONAL_FIELDS" : "UNCHANGED"}`);
  console.log(`Internal target normalization: ${invalidNavigation.length || invalidFooterNavigation.length || invalidHeaderCta || invalidSectionCtas.length ? "APPLIED" : "UNCHANGED"}`);
}

async function main(): Promise<void> {
  const contentMode = process.argv.includes("--content");
  const imagesMode = process.argv.includes("--images");
  const realImageProvider = process.argv.includes("--real-image-provider");
  const realImageStorage = process.argv.includes("--real-image-storage");
  const imageLimit = integerArgument("image-limit", 4);
  const imageRole = argument("image-role") as ImageRole | null;
  if (imageRole !== null && !["hero", "product", "section"].includes(imageRole)) {
    console.error("Invalid --image-role; expected hero, product, or section");
    process.exitCode = 2;
    return;
  }
  if (realImageProvider && (!imagesMode || imageLimit !== 1 || imageRole !== "hero")) {
    console.error("--real-image-provider requires --content --images --image-limit=1 --image-role=hero");
    process.exitCode = 2;
    return;
  }
  if (realImageStorage && (!realImageProvider || !imagesMode || imageLimit !== 1 || imageRole !== "hero")) {
    console.error("--real-image-storage requires --real-image-provider --content --images --image-limit=1 --image-role=hero");
    process.exitCode = 2;
    return;
  }
  if (imagesMode && !contentMode) {
    console.error("--images requires --content; dry-run image mode does not mutate lifecycle or storage");
    process.exitCode = 2;
    return;
  }
  console.log(contentMode ? "# SITE CONTENT V1 DRY-RUN" : "# ANALYSIS SEMANTIC COMPLETION V3");
  const slug = argument("site-slug");
  if (!slug) {
    console.error("Missing --site-slug");
    process.exitCode = 2;
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase read-only configuration is missing");
    process.exitCode = 2;
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (siteError || !site) {
    console.error(`Site lookup failed: ${siteError?.code ?? "NOT_FOUND"}`);
    process.exitCode = 1;
    return;
  }

  const { data: job, error: jobError } = await supabase
    .from("generation_jobs")
    .select("id, input_snapshot, output_summary")
    .eq(argument("job-id") ? "id" : "site_id", argument("job-id") ?? site.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (jobError || !job) {
    console.error(`Generation input lookup failed: ${jobError?.code ?? "NOT_FOUND"}`);
    process.exitCode = 1;
    return;
  }

  if (contentMode) {
    console.log(`Model: ${OPENAI_MODEL}`);
    const inputResult = buildWebsiteAnalysisInput(job.input_snapshot);
    const outputSummary = job.output_summary && typeof job.output_summary === "object"
      ? job.output_summary as Record<string, unknown>
      : {};
    const analysis = outputSummary.analysis;
    if (!inputResult.success || !analysis) {
      console.log("Content provider response received: NO");
      console.log("SiteContentV1 validation: NOT_RUN");
      console.log("Decision: CONTENT DRY-RUN BLOCKED (persisted analysis unavailable)");
      process.exitCode = 1;
      return;
    }

    const parsedAnalysis = parseWebsiteAnalysisV1(analysis);
    if (!parsedAnalysis.success) {
      console.log("Content provider response received: NO");
      console.log("SiteContentV1 validation: NOT_RUN");
      console.log("Decision: CONTENT DRY-RUN BLOCKED (persisted analysis invalid)");
      process.exitCode = 1;
      return;
    }

    let rawContent: unknown;
    try {
      rawContent = await createOpenAiGenerationProvider().generateContent({
        source: inputResult.data,
        analysis: parsedAnalysis.data as WebsiteAnalysisV1,
      });
    } catch (error) {
      if (error instanceof OpenAiProviderError) {
        console.log("Provider response received: NO");
        console.log(`HTTP status: ${error.status}`);
        console.log(`error type: ${error.type ?? "null"}`);
        console.log(`error code: ${error.code ?? "null"}`);
        console.log(`error param: ${error.param ?? "null"}`);
        console.log(`error message: ${error.message}`);
        console.log("SiteContentV1 validation: NOT_RUN");
        console.log("Decision: STRUCTURED OUTPUT REQUEST REJECTED");
        process.exitCode = 1;
        return;
      }
      throw error;
    }
    console.log("Content provider response received: YES");
    reportTargetNormalization(rawContent);
    const contentResult = normalizeAndValidateSiteContentV1(rawContent);
    console.log(`SiteContentV1 validation: ${contentResult.success ? "PASS" : "FAIL"}`);
    if (!contentResult.success) {
      for (const diagnostic of getSiteContentValidationDiagnostics(contentResult)) {
        console.log(`- ${diagnostic.path}:${diagnostic.code}`);
        if (diagnostic.ruleIdentifier) console.log(`  rule identifier: ${diagnostic.ruleIdentifier}`);
      }
      console.log("Decision: CONTENT CONTRACT FAILURE IDENTIFIED");
      process.exitCode = 1;
      return;
    }
    console.log("SiteContentV1 semantic validation: PASS");
    if (imagesMode) {
      const imageStorage = realImageStorage
        ? createSupabaseGeneratedImageStorageV1({ storage: supabase.storage })
        : createGeneratedImageStorage({
          publicUrlForPath: (path) => `https://dry-run.invalid/${path}`,
          put: async () => undefined,
        });
      const imageProvider = realImageProvider ? createOpenAiImageGenerationProvider() : new MockImageGenerationProviderV1();
      let providerResult: { mimeType: string; width: number; height: number; bytes: number } | null = null;
      let providerDiagnostic: { status: number | null; type: string | null; code: string | null; param: string | null; stage: string; elapsed_ms: number | null; message: string } | null = null;
      let storedImage: { storagePath: string; publicUrl: string; mimeType: string } | null = null;
      let uploadCount = 0;
      let imageResult;
      try {
        imageResult = await runImagePipelineV1(contentResult.data, {
          siteId: site.id,
          generationJobId: job.id,
          retryCount: 0,
          source: inputResult.data,
          analysis: parsedAnalysis.data,
        }, {
          provider: imageProvider,
          storage: imageStorage,
          maxImages: imageLimit,
          roles: imageRole ? [imageRole] : undefined,
          onImageGenerated: (result) => {
            providerResult = { mimeType: result.mimeType, width: result.width, height: result.height, bytes: result.bytes.byteLength };
          },
          onImageStored: (stored) => {
            storedImage = stored;
            uploadCount += 1;
          },
          onImageError: (error) => {
            if (realImageStorage && error instanceof Error && error.message.startsWith("IMAGE_STORAGE_")) throw error;
            if (!realImageProvider) return;
            const diagnostic = error && typeof error === "object" && "diagnostic" in error
              ? (error as { diagnostic: { status: number | null; type: string | null; code: string | null; param: string | null; stage: string; elapsed_ms: number | null } }).diagnostic
              : null;
            providerDiagnostic = {
              status: diagnostic?.status ?? null,
              type: diagnostic?.type ?? null,
              code: diagnostic?.code ?? null,
              param: diagnostic?.param ?? null,
              stage: diagnostic?.stage ?? "unknown",
              elapsed_ms: diagnostic?.elapsed_ms ?? null,
              message: error instanceof Error ? error.message : "IMAGE_PROVIDER_FAILED",
            };
          },
        });
      } catch (error) {
        if (realImageProvider) {
          const diagnostic = error && typeof error === "object" && "diagnostic" in error
            ? (error as { diagnostic: { status: number | null; type: string | null; code: string | null; param: string | null; stage: string; elapsed_ms: number | null } }).diagnostic
            : null;
          console.log(`provider_error_status: ${diagnostic?.status ?? "null"}`);
          console.log(`provider_error_type: ${diagnostic?.type ?? "null"}`);
          console.log(`provider_error_code: ${diagnostic?.code ?? "null"}`);
          console.log(`provider_error_param: ${diagnostic?.param ?? "null"}`);
          console.log(`provider_error_stage: ${diagnostic?.stage ?? "unknown"}`);
          console.log(`provider_error_elapsed_ms: ${diagnostic?.elapsed_ms ?? "null"}`);
          console.log(`provider_error_message: ${error instanceof Error ? error.message : "IMAGE_PROVIDER_FAILED"}`);
        }
        throw error;
      }
      const roleCounts = imageResult.requests.reduce<Record<string, number>>((counts, request) => {
        counts[request.role] = (counts[request.role] ?? 0) + 1;
        return counts;
      }, {});
      console.log(`Image provider: ${realImageProvider ? "REAL_OPENAI" : "MOCK"}`);
      console.log(`Image storage: ${realImageStorage ? "SUPABASE_PUBLIC" : "IN-MEMORY"}`);
      console.log(`image_requests_discovered: ${imageResult.summary.image_requests}`);
      console.log(`image_selected: ${imageResult.summary.image_requests - imageResult.summary.image_skipped}`);
      console.log(`image_hero: ${roleCounts.hero ?? 0}`);
      console.log(`image_product: ${roleCounts.product ?? 0}`);
      console.log(`image_section: ${roleCounts.section ?? 0}`);
      console.log(`image_generated: ${imageResult.summary.image_generated}`);
      console.log(`image_failed: ${imageResult.summary.image_failed}`);
      console.log(`image_skipped: ${imageResult.summary.image_skipped}`);
      if (realImageProvider && providerDiagnostic) {
        const diagnostic = providerDiagnostic as { status: number | null; type: string | null; code: string | null; param: string | null; stage: string; elapsed_ms: number | null; message: string };
        console.log(`provider_error_status: ${diagnostic.status}`);
        console.log(`provider_error_type: ${diagnostic.type}`);
        console.log(`provider_error_code: ${diagnostic.code}`);
        console.log(`provider_error_param: ${diagnostic.param}`);
        console.log(`provider_error_stage: ${diagnostic.stage}`);
        console.log(`provider_error_elapsed_ms: ${diagnostic.elapsed_ms ?? "null"}`);
        console.log(`provider_error_message: ${diagnostic.message}`);
      }
      if (realImageProvider && imageResult.summary.image_generated > 0) {
        const metadata = providerResult as { mimeType: string; width: number; height: number; bytes: number } | null;
        console.log(`provider_called: YES`);
        console.log(`provider_mime_type: ${metadata?.mimeType ?? "unknown"}`);
        console.log(`provider_dimensions: ${metadata?.width ?? 0}x${metadata?.height ?? 0}`);
        console.log(`provider_bytes: ${metadata?.bytes ?? 0}`);
      }
      if (realImageStorage && storedImage) {
        const object = storedImage as { storagePath: string; publicUrl: string; mimeType: string };
        if (uploadCount !== 1 || object.mimeType !== "image/webp") throw new Error("CONTROLLED_STORAGE_UPLOAD_CONTRACT_FAILED");
        const publicResponse = await fetch(object.publicUrl, { method: "HEAD" });
        console.log(`storage_bucket: ${IMAGE_STORAGE_BUCKET_V1}`);
        console.log(`storage_path: ${object.storagePath}`);
        console.log(`storage_mime: ${object.mimeType}`);
        console.log(`storage_upload_count: ${uploadCount}`);
        console.log("storage_upsert: false");
        console.log(`public_verification_status: ${publicResponse.status}`);
        console.log(`public_verification_content_type: ${publicResponse.headers.get("content-type") ?? "null"}`);
        if (!publicResponse.ok || !(publicResponse.headers.get("content-type") ?? "").toLowerCase().startsWith("image/webp")) throw new Error("CONTROLLED_STORAGE_PUBLIC_VERIFY_FAILED");
        const cleanupResult = await supabase.storage.from(IMAGE_STORAGE_BUCKET_V1).remove([object.storagePath]);
        if (cleanupResult.error) throw new Error(`CONTROLLED_STORAGE_CLEANUP_FAILED:${cleanupResult.error.message}`);
        const separator = object.storagePath.lastIndexOf("/");
        const parentPath = object.storagePath.slice(0, separator);
        const objectName = object.storagePath.slice(separator + 1);
        const listing = await supabase.storage.from(IMAGE_STORAGE_BUCKET_V1).list(parentPath, {
          limit: 100,
          offset: 0,
          sortBy: { column: "name", order: "asc" },
        });
        if (listing.error) throw new Error(`CONTROLLED_STORAGE_CLEANUP_LOOKUP_FAILED:${listing.error.message}`);
        const exactObjectExists = (listing.data ?? []).some((entry) => entry.name === objectName);
        const postDeleteResponse = await fetch(object.publicUrl, { method: "HEAD" });
        console.log("cleanup_delete_count: 1");
        console.log(`cleanup_exact_object_exists: ${exactObjectExists ? "YES" : "NO"}`);
        console.log(`cleanup_post_delete_status: ${postDeleteResponse.status}`);
        if (!controlledStorageCleanupSucceeded({ exactObjectExists, publicStatus: postDeleteResponse.status, publicContentType: postDeleteResponse.headers.get("content-type") })) throw new Error("CONTROLLED_STORAGE_POST_DELETE_VERIFY_FAILED");
      }
      console.log("final_validation: PASS");
      console.log("Database mutation: NO");
    }
    console.log("Decision: CONTENT DRY-RUN PASS");
    return;
  }

  const inputResult = buildWebsiteAnalysisInput(job.input_snapshot);
  if (!inputResult.success) {
    console.log("Input sufficiency:");
    console.log("business/site name: ABSENT");
    console.log("business type: ABSENT");
    console.log("target market: ABSENT");
    console.log("products/services count: 0");
    console.log("USP: ABSENT");
    console.log("CTA: ABSENT");
    console.log("source facts count: 0");
    console.log("brief text length: 0");
    console.log("analysis input schema valid: NO");
    console.log("Provider:");
    console.log("first response validation: FAIL");
    console.log("repair invoked: NO");
    console.log("repair validation: NOT_RUN");
    console.log("Decision: STILL INVALID");
    process.exitCode = 1;
    return;
  }

  try {
    const provider = createOpenAiGenerationProvider();
    const rawAnalysis = await provider.generateAnalysis(inputResult.data);
    reportInputSufficiency(inputResult.data);
    let analysisResult = parseWebsiteAnalysisV1(rawAnalysis);
    const firstResponseValidation = analysisResult.success ? "PASS" : "FAIL";
    const firstIssues = analysisResult.success ? [] : analysisResult.error.issues.slice(0, 10);
    const repairIssues = analysisResult.success ? null : getWebsiteAnalysisRepairIssues(analysisResult.error.issues);
    let repairInvoked = false;
    let repairValidation = "NOT_RUN";
    if (repairIssues && provider.repairAnalysis) {
        repairInvoked = true;
        const validationIssues = repairIssues.map((issue) => `${issue.path.join(".") || "root"}:${issue.code}`);
        const repaired = await provider.repairAnalysis({ source: inputResult.data, previous: rawAnalysis, validationIssues });
        analysisResult = parseWebsiteAnalysisV1(repaired);
        repairValidation = analysisResult.success ? "PASS" : "FAIL";
    }

    console.log("Provider:");
    console.log(`first response validation: ${firstResponseValidation}`);
    reportContentGuardrails(rawAnalysis, firstIssues);
    console.log("First validation paths:");
    for (const issue of firstIssues) {
      const path = issue.path.join(".") || "root";
      console.log(`- ${path}:${issue.code}`);
      if (issue.code === "custom") {
        console.log(`  rule identifier: ${issue.message}`);
        console.log(`  category: ${customIssueCategory(issue.message)}`);
      }
      console.log(`  ${isWebsiteAnalysisDomainCompletionIssue(issue) ? "REPAIRABLE: semantic completeness" : "NON_REPAIRABLE: structural, safety, grounding, or transport issue"}`);
    }
    console.log(`Repair eligible: ${repairIssues ? "YES" : "NO"}`);
    console.log(`repair invoked: ${repairInvoked ? "YES" : "NO"}`);
    console.log(`repair validation: ${repairValidation}`);

    if (!analysisResult.success) {
      console.log("Final:");
      console.log("schema validation: FAIL");
      console.log("Decision: STILL INVALID");
      process.exitCode = 1;
      return;
    }

    let correctionInvoked = false;
    const testimonialDiagnostic = getTestimonialSectionDiagnostic(analysisResult.data, inputResult.data);
    if (!hasTestimonialEvidence(inputResult.data) && testimonialDiagnostic && provider.correctAnalysis) {
      correctionInvoked = true;
      const corrected = await provider.correctAnalysis({
        source: inputResult.data,
        previous: analysisResult.data,
        invalidPath: testimonialDiagnostic.path,
      });
      analysisResult = parseWebsiteAnalysisV1(corrected);
      if (!analysisResult.success) {
        console.log("Final:");
        console.log("schema validation: FAIL");
        console.log("Decision: STILL INVALID");
        process.exitCode = 1;
        return;
      }
    }

    const normalizedClaims = normalizeWebsiteAnalysisAllowedClaims(analysisResult.data, inputResult.data);
    analysisResult = parseWebsiteAnalysisV1(normalizedClaims.analysis);
    if (!analysisResult.success) {
      console.log("Final:");
      console.log("schema validation: FAIL");
      console.log("Decision: STILL INVALID");
      process.exitCode = 1;
      return;
    }
    const analysis = analysisResult.data;
    const groundingResult = validateWebsiteAnalysisGrounding(analysis, inputResult.data);
    const halalResult = validateHalalAnalysisSafety(analysis);
    console.log("Final:");
    console.log(`audience.needs count: ${analysis.audience.needs.length}`);
    console.log(`audience.objections count: ${analysis.audience.objections.length}`);
    console.log(`section_plan count: ${analysis.section_plan.length}`);
    console.log(`first key_points count: ${analysis.section_plan[0]?.key_points.length ?? 0}`);
    console.log(`website_goal non-empty: ${analysis.conversion.website_goal.trim().length > 0 ? "YES" : "NO"}`);
    console.log(`strategy non-empty: ${analysis.conversion.strategy.trim().length > 0 ? "YES" : "NO"}`);
    console.log(`usp_summary non-empty: ${analysis.offer.usp_summary.trim().length > 0 ? "YES" : "NO"}`);
    console.log(`value_proposition non-empty: ${analysis.offer.value_proposition.trim().length > 0 ? "YES" : "NO"}`);
    console.log(`allowed_claims before count: ${normalizedClaims.beforeCount}`);
    console.log(`unsupported removed count: ${normalizedClaims.removedCount}`);
    console.log(`allowed_claims after count: ${normalizedClaims.afterCount}`);
    console.log(`testimonial correction invoked: ${correctionInvoked ? "YES" : "NO"}`);
    console.log("schema validation: PASS");
    console.log(`grounding validation: ${groundingResult.ok ? "PASS" : "FAIL"}`);
    if (!groundingResult.ok) {
      const diagnostic = getWebsiteAnalysisGroundingDiagnostic(analysis, inputResult.data);
      if (diagnostic) {
        console.log(`grounding rule identifier: ${diagnostic.ruleIdentifier}`);
        console.log(`grounding path: ${diagnostic.path}`);
        console.log(`grounding code: ${diagnostic.code}`);
        console.log(`grounding category: ${diagnostic.category}`);
      }
    }
    console.log(`halal safety validation: ${halalResult.ok ? "PASS" : "FAIL"}`);
    const passed = groundingResult.ok && halalResult.ok;
    console.log("Decision:");
    console.log(passed ? "READY FOR THIRD CONTROLLED RETRY" : "STILL INVALID");
    if (!passed) process.exitCode = 1;
  } catch {
    reportInputSufficiency(inputResult.data);
    console.log("Provider:");
    console.log("first response validation: FAIL");
    console.log("repair invoked: NO");
    console.log("repair validation: NOT_RUN");
    console.log("Decision: STILL INVALID");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.log("Decision: STILL INVALID");
  console.error(error instanceof Error ? error.name : "runtime error");
  process.exitCode = 1;
});
