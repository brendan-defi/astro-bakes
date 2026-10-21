import { describe, expect, it } from "vitest";
import { settings as publicDefaults } from "./data";
import { httpsLink, SETTING_DEFAULTS, SETTING_FIELDS, settingField, settingValue, validateSettings } from "./settings-fields";

/** The form as it arrives untouched: every default, numbers as text. */
const form = (over: Record<string, unknown> = {}) => ({ ...Object.fromEntries(Object.entries(SETTING_DEFAULTS).map(([k, v]) => [k, typeof v === "number" ? String(v) : v])), ...over });
const errorsFor = (over: Record<string, unknown>) => {
  const r = validateSettings(form(over));
  return r.ok ? {} : r.errors;
};

describe("settings fields", () => {
  it("has one entry per key, and its defaults pass its own validation", () => {
    expect(new Set(SETTING_FIELDS.map((f) => f.key)).size).toBe(SETTING_FIELDS.length);
    const r = validateSettings(form());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values).toEqual(SETTING_DEFAULTS);
  });

  it("keeps the owner's private details off the public side", () => {
    const priv = SETTING_FIELDS.filter((f) => f.private).map((f) => f.key);
    expect(priv).toEqual(expect.arrayContaining(["owner_email", "notify_new_order", "jp_sender_name", "jp_sender_postal", "jp_sender_line1", "jp_sender_phone"]));
    expect(priv).not.toContain("contact_email");
    expect(priv).not.toContain("legal_seller_name");
  });

  it("trims and normalises: lower-case emails, half-width digits, the owner's phone hyphens, 123-4567 postal codes", () => {
    const r = validateSettings(form({ contact_email: "  Hello@AstroBakes.xyz ", shipping_fee: "５００", legal_phone: "０３ー１２３４ー５６７８", jp_sender_postal: "１５３００６１", legal_seller_name: "  並川洋美  " }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toMatchObject({ contact_email: "hello@astrobakes.xyz", shipping_fee: 500, legal_phone: "03-1234-5678", jp_sender_postal: "153-0061", legal_seller_name: "並川洋美" });
  });

  it("explains what's wrong with each bad field, and saves nothing", () => {
    const errors = errorsFor({
      contact_email: "",
      owner_email: "not-an-email",
      instagram_url: "http://instagram.com/astrobakes",
      line_url: "lin.ee/abc",
      legal_phone: "12345",
      jp_sender_postal: "15300",
      shipping_fee: "-1",
      arrival_offset_days: "1.5",
      jp_sender_name: "x".repeat(26),
      jp_item_name: " ",
      notify_new_order: "yes",
    });
    expect(Object.keys(errors).sort()).toEqual(["arrival_offset_days", "contact_email", "instagram_url", "jp_item_name", "jp_sender_name", "jp_sender_postal", "legal_phone", "line_url", "notify_new_order", "owner_email", "shipping_fee"].sort());
    expect(errors.contact_email).toBe("Required.");
    expect(errors.instagram_url).toMatch(/https/);
    expect(errors.jp_sender_name).toBe("At most 25 characters (this is 26).");
    expect(errors.arrival_offset_days).toBe("A whole number from 1 to 7.");
  });

  it("lets optional fields be empty, which the site reads as 'not set'", () => {
    const r = validateSettings(form({ owner_email: "", instagram_url: "", legal_phone: "", jp_sender_postal: "" }));
    expect(r.ok && r.values).toMatchObject({ owner_email: "", instagram_url: "", legal_phone: "", jp_sender_postal: "" });
  });

  it("ignores keys that aren't settings, and refuses a form missing one", () => {
    const r = validateSettings(form({ hold_minutes: 1, role: "admin" }));
    expect(r.ok && Object.keys(r.values)).not.toContain("hold_minutes");
    const { contact_email: _gone, ...missing } = form();
    expect(validateSettings(missing)).toMatchObject({ ok: false, errors: { contact_email: "Missing." } });
  });

  it("stores links in the parser's canonical form, which resolves to the same place from a shop page", () => {
    const r = validateSettings(form({ instagram_url: "HTTPS://www.instagram.com/astrobakes", line_url: "https:lin.ee/abc123" }));
    expect(r.ok && r.values).toMatchObject({ instagram_url: "https://www.instagram.com/astrobakes", line_url: "https://lin.ee/abc123" });
    if (!r.ok) return;
    for (const k of ["instagram_url", "line_url"]) {
      const stored = r.values[k] as string;
      expect(new URL(stored, "https://astrobakes.xyz/en/").href).toBe(stored);
      // And the form reads back exactly what was saved.
      expect(settingValue(settingField(k)!, stored)).toBe(stored);
    }
  });

  it("turns down links with credentials or no real host", () => {
    for (const bad of ["https://user:pw@lin.ee/x", "https://localhost/x", "https://", "lin.ee/abc", "javascript:alert(1)"]) expect(httpsLink(bad)).toBeNull();
    expect(errorsFor({ line_url: "https://user:pw@lin.ee/x" }).line_url).toMatch(/https/);
  });

  it("keeps the public defaults in step with the field list", () => {
    expect(publicDefaults).toMatchObject({
      contactEmail: SETTING_DEFAULTS.contact_email,
      shippingFee: SETTING_DEFAULTS.shipping_fee,
      arrivalOffsetDays: SETTING_DEFAULTS.arrival_offset_days,
      legalSellerName: SETTING_DEFAULTS.legal_seller_name,
      legalOperator: SETTING_DEFAULTS.legal_operator,
      legalAddress: SETTING_DEFAULTS.legal_address,
      legalPhone: SETTING_DEFAULTS.legal_phone,
    });
  });

  it("reads stored values by type, and the seed's '#notify' placeholder as an unset link", () => {
    expect(settingValue(settingField("line_url")!, "#notify")).toBe("");
    expect(settingValue(settingField("instagram_url")!, "https://instagram.com/astrobakes")).toBe("https://instagram.com/astrobakes");
    // A link stored before canonicalisation still reads (canonically) rather than as empty.
    expect(settingValue(settingField("instagram_url")!, "HTTPS://www.instagram.com/astrobakes")).toBe("https://www.instagram.com/astrobakes");
    expect(settingValue(settingField("shipping_fee")!, "800")).toBe(0);
    expect(settingValue(settingField("notify_new_order")!, undefined)).toBe(true);
    expect(settingValue(settingField("legal_seller_name")!, "並川洋美")).toBe("並川洋美");
  });
});
