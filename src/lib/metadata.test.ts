import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { publicPage } from "./metadata";

describe("publicPage", () => {
  it("leaves the brand to the layout's title template, but spells it out for the link preview", () => {
    const m = publicPage("en", "/custom-orders", "Parties & custom orders", "Cookies for parties.");
    expect(m.title).toBe("Parties & custom orders");
    expect(m.openGraph).toMatchObject({ title: "Parties & custom orders · Astro Bakes", description: "Cookies for parties.", url: "/en/custom-orders", siteName: "Astro Bakes", locale: "en_US", alternateLocale: "ja_JP" });
    expect(publicPage("ja", "/custom-orders", "パーティー・特別注文", "…").openGraph).toMatchObject({ title: "パーティー・特別注文｜Astro Bakes", locale: "ja_JP" });
    // The page's own openGraph replaces the layout's, so it has to bring the shared preview card along.
    expect(m.openGraph?.images).toEqual([expect.objectContaining({ url: "/en/opengraph-image/card", width: 1200, height: 630 })]);
  });

  it("points search engines at this language's URL and its translation", () => {
    expect(publicPage("ja", "/custom-orders", "x", "y").alternates).toEqual({ canonical: "/ja/custom-orders", languages: { en: "/en/custom-orders", ja: "/ja/custom-orders" } });
  });
});

describe("sitemap", () => {
  it("lists the custom-orders page in both languages", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://astrobakes.xyz/en/custom-orders");
    expect(urls).toContain("https://astrobakes.xyz/ja/custom-orders");
  });
});
