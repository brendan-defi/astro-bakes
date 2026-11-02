import { requireAdmin } from "@/lib/admin";
import { japanPostLabels } from "@/lib/fulfilment";

/**
 * The drop's Japan Post label file for Webゆうパックプリント (PRD 4.6): CP932 CSV, one row per order still to ship. While
 * the file can't be made (sender details missing, no orders, too many) it answers 409 with the reasons, which the
 * pack list shows before offering the link.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  const labels = /^[a-z0-9-]{1,64}$/.test(slug) ? await japanPostLabels(slug) : null;
  if (!labels) return new Response("No such drop.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (labels.file.fileProblems.length) {
    return new Response(labels.file.fileProblems.join("\n"), { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return new Response(new Uint8Array(labels.file.bytes), {
    headers: {
      "Content-Type": "text/csv; charset=Shift_JIS",
      "Content-Disposition": `attachment; filename="japan-post-${slug}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
