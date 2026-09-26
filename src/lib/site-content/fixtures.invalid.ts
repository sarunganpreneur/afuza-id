import { validSiteContentFixtures } from "./fixtures";
import type { SiteContentV1 } from "./schema";

const source = validSiteContentFixtures.umkmKuliner;
const copy = (): SiteContentV1 => structuredClone(source);
const hero = (value: SiteContentV1) => value.sections[0] as Extract<SiteContentV1["sections"][number], { type: "hero" }>;
const about = (value: SiteContentV1) => value.sections[1] as Extract<SiteContentV1["sections"][number], { type: "about" }>;

export const invalidSiteContentFixtures = {
  scriptInjection: (() => { const value = copy(); about(value).body = "<script>alert(1)</script>"; return value; })(),
  javascriptUrl: (() => { const value = copy(); hero(value).cta = { label: "Lihat", kind: "external", target: "javascript:alert(1)" }; return value; })(),
  dataUri: (() => { const value = copy(); hero(value).image = "data:image/png;base64,AAAA"; return value; })(),
  httpExternalUrl: (() => { const value = copy(); hero(value).image = "http://example.com/hero.jpg"; return value; })(),
  duplicateSectionId: (() => { const value = copy(); value.sections[1].id = "hero"; return value; })(),
  anchorWithoutTarget: (() => { const value = copy(); hero(value).cta = { label: "Lihat", kind: "anchor", target: "#missing" }; return value; })(),
  heroNotFirst: (() => { const value = copy(); [value.sections[0], value.sections[1]] = [value.sections[1], value.sections[0]]; return value; })(),
  twoHeroes: (() => { const value = copy(); value.sections.push({ ...value.sections[0], id: "hero-kedua" }); return value; })(),
  moreThanTwentySections: (() => { const value = copy(); value.sections = Array.from({ length: 21 }, (_, index) => ({ id: `text-${index}`, type: "text", title: "Bagian", body: "Isi" })); return value; })(),
  invalidWhatsApp: (() => { const value = copy(); value.site.whatsapp = "not-a-phone"; return value; })(),
  unknownField: (() => { const value = copy(); Object.assign(value.sections[0], { unknown: true }); return value; })(),
  rawHtml: (() => { const value = copy(); value.site.description = "<div>raw</div>"; return value; })(),
  stringTooLong: (() => { const value = copy(); value.sections[0].title = "x".repeat(201); return value; })(),
} as const;