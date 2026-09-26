import { z } from "zod";

const MAX_TEXT = 5000;
const SafeText = z.string().min(1).max(MAX_TEXT);
const OptionalText = z.string().max(MAX_TEXT).optional();
const Id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const SiteContentSectionTypes = [
  "hero",
  "about",
  "feature_grid",
  "item_grid",
  "steps",
  "benefits",
  "faq",
  "cta",
  "contact",
  "text",
] as const;

export const SiteContentCtaKinds = ["internal", "anchor", "whatsapp", "email", "external"] as const;

const CtaSchema = z
  .object({
    label: SafeText.max(120),
    kind: z.enum(SiteContentCtaKinds),
    target: SafeText.max(500),
  })
  .strict();

const ImageSchema = z.string().min(1).max(1000);
const SectionBase = {
  id: Id,
};
const CardItemSchema = z
  .object({
    title: SafeText.max(200),
    body: SafeText.max(1000),
    image: ImageSchema.optional(),
    cta: CtaSchema.optional(),
  })
  .strict();

const HeroSectionSchema = z
  .object({
    ...SectionBase,
    type: z.literal("hero"),
    eyebrow: OptionalText,
    title: SafeText.max(200),
    body: OptionalText,
    image: ImageSchema.optional(),
    cta: CtaSchema.optional(),
  })
  .strict();

const AboutSectionSchema = z
  .object({
    ...SectionBase,
    type: z.literal("about"),
    title: SafeText.max(200),
    body: SafeText.max(3000),
    image: ImageSchema.optional(),
  })
  .strict();

const FeatureGridSectionSchema = z
  .object({
    ...SectionBase,
    type: z.literal("feature_grid"),
    title: SafeText.max(200),
    intro: OptionalText,
    items: z.array(CardItemSchema.omit({ image: true, cta: true })).min(1).max(12),
  })
  .strict();

const ItemGridSectionSchema = z
  .object({
    ...SectionBase,
    type: z.literal("item_grid"),
    title: SafeText.max(200),
    intro: OptionalText,
    items: z.array(CardItemSchema).min(1).max(12),
  })
  .strict();

const StepsSectionSchema = z
  .object({
    ...SectionBase,
    type: z.literal("steps"),
    title: SafeText.max(200),
    steps: z
      .array(z.object({ number: z.number().int().min(1).max(99), title: SafeText.max(200), body: SafeText.max(1000) }).strict())
      .min(1)
      .max(10),
  })
  .strict();

const BenefitsSectionSchema = z
  .object({
    ...SectionBase,
    type: z.literal("benefits"),
    title: SafeText.max(200),
    items: z.array(CardItemSchema.omit({ image: true, cta: true })).min(1).max(12),
  })
  .strict();

const FaqSectionSchema = z
  .object({
    ...SectionBase,
    type: z.literal("faq"),
    title: SafeText.max(200),
    items: z.array(z.object({ question: SafeText.max(300), answer: SafeText.max(2000) }).strict()).min(1).max(12),
  })
  .strict();

const CtaSectionSchema = z
  .object({
    ...SectionBase,
    type: z.literal("cta"),
    title: SafeText.max(200),
    body: OptionalText,
    cta: CtaSchema,
  })
  .strict();

const ContactSectionSchema = z
  .object({
    ...SectionBase,
    type: z.literal("contact"),
    title: SafeText.max(200),
    body: OptionalText,
    email: z.string().email().max(320).optional(),
    phone: z.string().max(30).optional(),
    address: z.string().max(1000).optional(),
    cta: CtaSchema.optional(),
  })
  .strict();

const TextSectionSchema = z
  .object({
    ...SectionBase,
    type: z.literal("text"),
    title: SafeText.max(200),
    body: SafeText.max(5000),
  })
  .strict();

export const SiteContentSectionSchema = z.discriminatedUnion("type", [
  HeroSectionSchema,
  AboutSectionSchema,
  FeatureGridSectionSchema,
  ItemGridSectionSchema,
  StepsSectionSchema,
  BenefitsSectionSchema,
  FaqSectionSchema,
  CtaSectionSchema,
  ContactSectionSchema,
  TextSectionSchema,
]);

const NavigationSchema = z
  .object({
    label: SafeText.max(120),
    target: Id,
  })
  .strict();

const SiteSchema = z
  .object({
    name: SafeText.max(200),
    slug: Id,
    description: OptionalText,
    whatsapp: z.string().max(30).optional(),
  })
  .strict();

const SeoSchema = z
  .object({
    title: SafeText.max(200),
    description: SafeText.max(320),
    image: ImageSchema.optional(),
    canonical: z.string().max(500).optional(),
  })
  .strict();

const ThemeSchema = z
  .object({
    style: z.enum(["minimal", "editorial", "playful", "corporate", "organic"]),
    primaryColor: HexColor,
    accentColor: HexColor,
    fontStyle: z.enum(["sans", "serif", "display"]),
    borderRadius: z.enum(["none", "sm", "md", "lg"]),
    density: z.enum(["compact", "comfortable", "spacious"]),
  })
  .strict();

const HeaderSchema = z
  .object({
    logo: ImageSchema.optional(),
    navigation: z.array(NavigationSchema).max(10),
    cta: CtaSchema.optional(),
  })
  .strict();

const FooterSchema = z
  .object({
    description: OptionalText,
    links: z.array(NavigationSchema).max(12),
    copyright: z.string().max(200).optional(),
  })
  .strict();

export const SiteContentV1Schema = z
  .object({
    schemaVersion: z.literal("site_content_v1"),
    site: SiteSchema,
    seo: SeoSchema,
    theme: ThemeSchema,
    header: HeaderSchema,
    sections: z.array(SiteContentSectionSchema).min(1).max(20),
    footer: FooterSchema,
  })
  .strict();

export const SiteContentV1 = SiteContentV1Schema;
export type SiteContentV1 = z.infer<typeof SiteContentV1Schema>;
export type SiteContentSection = SiteContentV1["sections"][number];
export type SiteContentCta = z.infer<typeof CtaSchema>;