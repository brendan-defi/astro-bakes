/**
 * Carts and reservations are records keyed by box slug ({ "cookie-box": 2 }). A plain object also answers for names on
 * Object.prototype, so a box slugged "constructor" would read as a function, not as zero. Read quantities through
 * this: own properties only. Client-safe.
 */
export function qtyOf(q: Record<string, number>, id: string): number {
  return Object.hasOwn(q, id) ? q[id] : 0;
}
