/**
 * Mock postal-code lookup. Real build: bundle Japan Post KEN_ALL or call zipcloud
 * (PRD 2.3), and validate ward_code against the allowed list in Settings (D20).
 */
export interface PostalHit {
  prefecture: string;
  city: string;
  town: string;
  wardEn: string;
  /** true when the address is inside Tokyo's 23 wards */
  deliverable: boolean;
}

const TABLE: Record<string, PostalHit> = {
  "1530061": { prefecture: "東京都", city: "目黒区", town: "中目黒", wardEn: "Meguro-ku", deliverable: true },
  "1500001": { prefecture: "東京都", city: "渋谷区", town: "神宮前", wardEn: "Shibuya-ku", deliverable: true },
  "1060032": { prefecture: "東京都", city: "港区", town: "六本木", wardEn: "Minato-ku", deliverable: true },
  "1000001": { prefecture: "東京都", city: "千代田区", town: "千代田", wardEn: "Chiyoda-ku", deliverable: true },
  "1800004": { prefecture: "東京都", city: "武蔵野市", town: "吉祥寺本町", wardEn: "Musashino-shi", deliverable: false },
  "2310001": { prefecture: "神奈川県", city: "横浜市中区", town: "新港", wardEn: "Yokohama", deliverable: false },
};

export function normalisePostal(input: string): string {
  return input.replace(/[^0-9０-９]/g, "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

export function lookupPostal(input: string): PostalHit | null {
  const key = normalisePostal(input);
  if (key.length !== 7) return null;
  return TABLE[key] ?? null;
}
