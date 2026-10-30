/** A Japanese delivery address on one line, as it's printed on labels: "〒153-0061 東京都目黒区中目黒1-2-3 ビル101". */
export function addressLine(o: { postalCode: string; prefecture: string; city: string; town: string | null; line1: string; line2: string | null }): string {
  return `〒${o.postalCode.slice(0, 3)}-${o.postalCode.slice(3)} ${o.prefecture}${o.city}${o.town ?? ""}${o.line1}${o.line2 ? ` ${o.line2}` : ""}`;
}
