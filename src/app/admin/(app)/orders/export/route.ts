import { requireAdmin } from "@/lib/admin";
import { parseOrderFilters, toCsv } from "@/lib/order-admin-rules";
import { ordersForCsv } from "@/lib/orders-admin";

/** The orders matching the list's filters as a CSV file (PRD 4.4, for the accounts). */
export async function GET(req: Request) {
  await requireAdmin();
  const filters = parseOrderFilters(Object.fromEntries(new URL(req.url).searchParams));
  const csv = toCsv(await ordersForCsv({ ...filters, page: 1 }));
  const day = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const name = `astro-bakes-orders${filters.drop ? `-${filters.drop}` : ""}${filters.state ? `-${filters.state}` : ""}-${day}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
