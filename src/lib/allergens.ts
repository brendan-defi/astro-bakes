/**
 * Allergens a box can list (PRD 4.3): the 特定原材料 that 食品表示法 requires on
 * labels, and the recommended ones (推奨表示). Boxes store the English name;
 * the shop shows it as is in English and by this list in Japanese (i18n.ts),
 * and the box editor offers exactly these. Client-safe.
 *
 * Source: Consumer Affairs Agency, 食物アレルギー表示に関する情報, as of the
 * notice of 2026-04-01, which added cashew to 特定原材料 (9 required, 19
 * recommended):
 * https://www.caa.go.jp/policies/policy/food_labeling/food_sanitation/allergy/
 * When the agency changes the lists, move entries between the two groups
 * here; stored box data keeps working, since it's keyed by name.
 */
export interface Allergen {
  /** What boxes.allergens stores and English pages show. */
  name: string;
  ja: string;
}

export const REQUIRED_ALLERGENS: Allergen[] = [
  { name: "Egg", ja: "卵" },
  { name: "Milk", ja: "乳" },
  { name: "Wheat", ja: "小麦" },
  { name: "Buckwheat", ja: "そば" },
  { name: "Peanut", ja: "落花生" },
  { name: "Shrimp", ja: "えび" },
  { name: "Crab", ja: "かに" },
  { name: "Walnut", ja: "くるみ" },
  { name: "Cashew", ja: "カシューナッツ" },
];

export const RECOMMENDED_ALLERGENS: Allergen[] = [
  { name: "Almond", ja: "アーモンド" },
  { name: "Abalone", ja: "あわび" },
  { name: "Squid", ja: "いか" },
  { name: "Salmon roe", ja: "いくら" },
  { name: "Orange", ja: "オレンジ" },
  { name: "Kiwi", ja: "キウイフルーツ" },
  { name: "Beef", ja: "牛肉" },
  { name: "Sesame", ja: "ごま" },
  { name: "Salmon", ja: "さけ" },
  { name: "Mackerel", ja: "さば" },
  { name: "Soy", ja: "大豆" },
  { name: "Chicken", ja: "鶏肉" },
  { name: "Banana", ja: "バナナ" },
  { name: "Pork", ja: "豚肉" },
  { name: "Macadamia", ja: "マカダミアナッツ" },
  { name: "Peach", ja: "もも" },
  { name: "Yam", ja: "やまいも" },
  { name: "Apple", ja: "りんご" },
  { name: "Gelatin", ja: "ゼラチン" },
];

export const ALLERGENS: Allergen[] = [...REQUIRED_ALLERGENS, ...RECOMMENDED_ALLERGENS];

/** The listed allergen with this name, matched loosely ("egg", " Egg "); undefined for anything else. */
export const allergenNamed = (name: string) => ALLERGENS.find((a) => a.name.toLowerCase() === name.trim().toLowerCase());
