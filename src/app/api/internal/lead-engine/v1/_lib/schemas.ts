import { z } from "zod";

const OptionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional();

export const LeadUpsertSchema = z
  .object({
    lead_id: z.string().trim().min(1).max(160),
    business_name: z.string().trim().min(1).max(240),
    category: OptionalText(160),
    city: OptionalText(160),
    phone: OptionalText(64),
    whatsapp: OptionalText(64),
    website: OptionalText(500),
    instagram: OptionalText(500),
    google_maps_url: OptionalText(1000),
    source: z.string().trim().min(1).max(120),
    raw_source_id: OptionalText(240),
    notes: OptionalText(4000),
    observation: OptionalText(4000),
    rating: z.number().min(0).max(5).nullable().optional(),
    review_count: z.number().int().min(0).nullable().optional(),
    has_no_website: z.boolean().optional(),
    website_low_quality: z.boolean().optional(),
    has_public_whatsapp: z.boolean().optional(),
    public_contact_verified: z.boolean().optional(),
    google_maps_active: z.boolean().optional(),
    instagram_active: z.boolean().optional(),
    recent_reviews: z.boolean().optional(),
    clear_offer: z.boolean().optional(),
    business_active: z.boolean().optional(),
    do_not_contact: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type LeadUpsertInput = z.infer<typeof LeadUpsertSchema>;

export const LeadIdSchema = z.string().trim().min(1).max(160);
