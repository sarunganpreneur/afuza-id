import { z } from "zod";

import {
  SiteContentV1Schema,
  type SiteContentCta,
  type SiteContentV1,
} from "./schema";

const HTML_OR_HANDLER_PATTERN = /<\/?[a-z][^>]*>|\bon[a-z]+\s*=|<script|<iframe/i;
const SECTION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INTERNAL_PATH_PATTERN = /^\/(?!\/)[^\s<>\\]*$/;
const ANCHOR_PATTERN = /^#[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export type SiteContentValidationDiagnostic = {
  path: string;
  code: string;
  ruleIdentifier?: string;
};

export type SiteContentSemanticDiagnostic = SiteContentValidationDiagnostic & { category?: string };

export function getSiteContentValidationDiagnostics(
  result: ReturnType<typeof safeParseSiteContentV1>,
  limit = 10,
): SiteContentValidationDiagnostic[] {
  if (result.success) return [];
  return result.error.issues.slice(0, limit).map((issue) => ({
    path: issue.path.length ? issue.path.map(String).join(".") : "root",
    code: issue.code,
    ...(issue.code === "custom" ? { ruleIdentifier: issue.message } : {}),
  }));
}

function invalid(...errors: string[]): { ok: false; errors: string[] } {
  return { ok: false, errors };
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !value.startsWith("//");
  } catch {
    return false;
  }
}

function isSafeInternalPath(value: string): boolean {
  return INTERNAL_PATH_PATTERN.test(value) && !value.includes("javascript:") && !value.includes("data:") && !value.includes("file:");
}

export function classifyImageUrl(value: string): string {
  if (/^data:/i.test(value)) return "data URL";
  if (/^javascript:/i.test(value)) return "javascript";
  if (value.startsWith("//")) return "protocol-relative";
  if (/^https?:\/\//i.test(value)) return value.toLowerCase().startsWith("https://") ? "external https" : "external http";
  if (value.startsWith("/")) return "safe internal path";
  try {
    new URL(value);
    return "unsupported URL scheme";
  } catch {
    return "invalid relative path";
  }
}

function hasUnsafeString(value: string): boolean {
  return HTML_OR_HANDLER_PATTERN.test(value) || /^(?:javascript|data|file):/i.test(value.trim()) || value.trim().startsWith("//");
}

export function normalizeWhatsAppNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /[^\d+\s().-]/.test(trimmed) || (trimmed.match(/\+/g) ?? []).length > 1) return null;

  let digits = trimmed.replace(/[\s().-]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  if (!/^\d{8,15}$/.test(digits) || digits.startsWith("0")) return null;
  return digits;
}

function normalizeWhatsAppCtas(value: unknown, whatsapp: string | null): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeWhatsAppCtas(item, whatsapp));
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const normalized = Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, normalizeWhatsAppCtas(item, whatsapp)]),
  );
  const cta = record.cta;
  if (!cta || typeof cta !== "object" || Array.isArray(cta)) return normalized;

  const ctaRecord = cta as Record<string, unknown>;
  if (ctaRecord.kind !== "whatsapp") return normalized;
  if (whatsapp) {
    normalized.cta = { ...ctaRecord, target: whatsapp };
  } else if (record.type !== "cta") {
    delete normalized.cta;
  }
  return normalized;
}

export function normalizeSiteContentWhatsAppCtas(value: unknown, authoritativeWhatsApp: string | null | undefined): unknown {
  const normalizedWhatsApp = typeof authoritativeWhatsApp === "string"
    ? normalizeWhatsAppNumber(authoritativeWhatsApp)
    : null;
  return normalizeWhatsAppCtas(value, normalizedWhatsApp);
}

export function validateSafeTarget(target: string, kind?: SiteContentCta["kind"]): ValidationResult {
  if (!target || hasUnsafeString(target)) return invalid("UNSAFE_TARGET");

  if (kind === "anchor") return ANCHOR_PATTERN.test(target) ? { ok: true } : invalid("INVALID_ANCHOR_TARGET");
  if (kind === "internal") return isSafeInternalPath(target) ? { ok: true } : invalid("INVALID_INTERNAL_TARGET");
  if (kind === "external") return isHttpsUrl(target) ? { ok: true } : invalid("EXTERNAL_TARGET_MUST_USE_HTTPS");
  if (kind === "email") return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(target) ? { ok: true } : invalid("INVALID_EMAIL_TARGET");
  if (kind === "whatsapp") return normalizeWhatsAppNumber(target) ? { ok: true } : invalid("INVALID_WHATSAPP_TARGET");

  return isSafeInternalPath(target) || isHttpsUrl(target) || ANCHOR_PATTERN.test(target)
    ? { ok: true }
    : invalid("UNSAFE_TARGET");
}

export function validateSafeImageUrl(value: string): ValidationResult {
  if (!value || hasUnsafeString(value)) return invalid("UNSAFE_IMAGE_URL");
  return isHttpsUrl(value) || isSafeInternalPath(value) ? { ok: true } : invalid("IMAGE_URL_MUST_BE_HTTPS_OR_INTERNAL");
}

export function validateSafeCanonicalUrl(value: string): ValidationResult {
  if (!value || hasUnsafeString(value)) return invalid("UNSAFE_CANONICAL_URL");
  return isHttpsUrl(value) || isSafeInternalPath(value) ? { ok: true } : invalid("CANONICAL_URL_MUST_BE_HTTPS_OR_INTERNAL");
}

function inspectStrings(value: unknown, path: string, errors: string[]): void {
  if (typeof value === "string" && hasUnsafeString(value)) errors.push(`UNSAFE_STRING:${path}`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectStrings(item, `${path}[${index}]`, errors));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => inspectStrings(item, `${path}.${key}`, errors));
  }
}

function validateCta(cta: SiteContentCta, sectionIds: Set<string>, errors: string[], path: string): void {
  const targetResult = validateSafeTarget(cta.target, cta.kind);
  if (!targetResult.ok) errors.push(`${path}.${targetResult.errors[0]}`);
  if (cta.kind === "anchor" && !sectionIds.has(cta.target.slice(1))) errors.push(`${path}.ANCHOR_TARGET_NOT_FOUND`);
}

function collectCtas(value: unknown, path: string, sectionIds: Set<string>, errors: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectCtas(item, `${path}[${index}]`, sectionIds, errors));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => {
      if (key === "cta" && item && typeof item === "object" && !Array.isArray(item)) {
        validateCta(item as SiteContentCta, sectionIds, errors, `${path}.${key}`);
      } else {
        collectCtas(item, `${path}.${key}`, sectionIds, errors);
      }
    });
  }
}

export function validateSiteContentV1Semantics(content: SiteContentV1): ValidationResult {
  const errors: string[] = [];
  const sectionIds = new Set(content.sections.map((section) => section.id));

  if (content.sections.filter((section) => section.type === "hero").length !== 1) errors.push("EXACTLY_ONE_HERO_REQUIRED");
  if (content.sections[0]?.type !== "hero") errors.push("HERO_MUST_BE_FIRST");
  if (sectionIds.size !== content.sections.length) errors.push("DUPLICATE_SECTION_ID");

  const targets = [...content.header.navigation, ...content.footer.links];
  targets.forEach((navigation, index) => {
    if (!SECTION_ID_PATTERN.test(navigation.target) || !sectionIds.has(navigation.target)) errors.push(`NAVIGATION_TARGET_NOT_FOUND:${index}`);
  });

  collectCtas(content, "content", sectionIds, errors);
  inspectStrings(content, "content", errors);

  const imagePaths: string[] = [];
  const visitImages = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visitImages);
    if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, item]) => {
        if (key === "image" || key === "logo") imagePaths.push(item as string);
        else visitImages(item);
      });
    }
  };
  visitImages(content);
  imagePaths.forEach((image) => {
    if (!validateSafeImageUrl(image).ok) errors.push("UNSAFE_IMAGE_URL");
  });

  if (content.seo.canonical && !validateSafeCanonicalUrl(content.seo.canonical).ok) errors.push("UNSAFE_CANONICAL_URL");

  if (content.site.whatsapp && !normalizeWhatsAppNumber(content.site.whatsapp)) errors.push("INVALID_SITE_WHATSAPP");
  return errors.length ? invalid(...[...new Set(errors)]) : { ok: true };
}

export function getSiteContentSemanticDiagnostics(content: SiteContentV1): SiteContentSemanticDiagnostic[] {
  const diagnostics: SiteContentSemanticDiagnostic[] = [];
  const sectionIds = new Set(content.sections.map((section) => section.id));
  content.header.navigation.forEach((item, index) => {
    if (!SECTION_ID_PATTERN.test(item.target) || !sectionIds.has(item.target)) diagnostics.push({ path: `header.navigation[${index}].target`, code: "NAVIGATION_TARGET_NOT_FOUND" });
  });
  content.footer.links.forEach((item, index) => {
    if (!SECTION_ID_PATTERN.test(item.target) || !sectionIds.has(item.target)) diagnostics.push({ path: `footer.links[${index}].target`, code: "NAVIGATION_TARGET_NOT_FOUND" });
  });
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}[${index}]`));
    if (!value || typeof value !== "object") return;
    Object.entries(value).forEach(([key, item]) => {
      if ((key === "image" || key === "logo") && typeof item === "string" && !validateSafeImageUrl(item).ok) {
        diagnostics.push({ path: `${path}.${key}`, code: "UNSAFE_IMAGE_URL", category: classifyImageUrl(item) });
      } else {
        visit(item, `${path}.${key}`);
      }
    });
  };
  visit(content, "content");
  return diagnostics;
}

function sectionIdForTarget(target: string, sections: SiteContentV1["sections"]): string | null {
  const normalized = target.startsWith("#") ? target.slice(1) : target;
  const byId = sections.find((section) => section.id === normalized);
  if (byId) return byId.id;
  const byType = sections.filter((section) => section.type === normalized);
  return byType.length === 1 ? byType[0].id : null;
}

function normalizeCtas(value: unknown, sections: SiteContentV1["sections"], path: string, heroId: string): unknown {
  if (Array.isArray(value)) return value.map((item, index) => normalizeCtas(item, sections, `${path}[${index}]`, heroId));
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const normalized = Object.fromEntries(Object.entries(record)
    .filter(([key, item]) => !((key === "image" || key === "logo") && typeof item === "string" && !validateSafeImageUrl(item).ok))
    .map(([key, item]) => [key, normalizeCtas(item, sections, `${path}.${key}`, heroId)]));
  if (record.cta && typeof record.cta === "object" && !Array.isArray(record.cta)) {
    const cta = record.cta as Record<string, unknown>;
    if ((cta.kind === "internal" || cta.kind === "anchor") && typeof cta.target === "string") {
      const target = cta.target;
      const targetIsValid = validateSafeTarget(target, cta.kind).ok && (cta.kind !== "anchor" || sections.some((section) => section.id === target.slice(1)));
      if (targetIsValid) return normalized;
      const targetSectionId = sectionIdForTarget(target, sections);
      if (targetSectionId) {
        normalized.cta = { ...cta, kind: "anchor", target: `#${targetSectionId}` };
      } else if (record.type === "cta") {
        normalized.cta = { ...cta, kind: "anchor", target: `#${heroId}` };
      } else {
        delete normalized.cta;
      }
    }
  }
  return normalized;
}

export function normalizeSiteContentInternalTargets(content: SiteContentV1): SiteContentV1 {
  const sections = content.sections;
  const heroId = sections.find((section) => section.type === "hero")?.id ?? sections[0].id;
  const normalizeNavigation = (items: SiteContentV1["header"]["navigation"]) => items
    .map((item) => {
      if (SECTION_ID_PATTERN.test(item.target) && sections.some((section) => section.id === item.target)) return item;
      const targetSectionId = sectionIdForTarget(item.target, sections);
      return targetSectionId ? { ...item, target: targetSectionId } : null;
    })
    .filter((item): item is SiteContentV1["header"]["navigation"][number] => item !== null);

  const header = { ...content.header, navigation: normalizeNavigation(content.header.navigation) };
  const footer = { ...content.footer, links: normalizeNavigation(content.footer.links) };
  return normalizeCtas({ ...content, header, footer }, sections, "content", heroId) as SiteContentV1;
}

export function normalizeAndValidateSiteContentV1(value: unknown) {
  const structural = SiteContentV1Schema.safeParse(value);
  if (!structural.success) return structural;
  return safeParseSiteContentV1(normalizeSiteContentInternalTargets(structural.data));
}

export function safeParseSiteContentV1(value: unknown) {
  const parsed = SiteContentV1Schema.safeParse(value);
  if (!parsed.success) return parsed;
  const semantics = validateSiteContentV1Semantics(parsed.data);
  if (semantics.ok) return parsed;
  return {
    success: false as const,
    error: new z.ZodError(semantics.errors.map((message) => ({ code: "custom", path: [], message }))),
  };
}

export function parseSiteContentV1(value: unknown) {
  return safeParseSiteContentV1(value);
}