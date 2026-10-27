import type { DropState } from "@/lib/data";
import s from "@/app/admin/admin.module.css";

const LABEL: Record<DropState, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  open: "Open",
  closed: "Closed",
  baking: "Baking",
  shipped: "Shipped",
  complete: "Complete",
  cancelled: "Cancelled",
};

/** A drop's state as the shop sees it now (the stored state moved on by the clock; effectiveState). */
export function DropStatePill({ state }: { state: DropState }) {
  return <span className={`${s.pill} ${s[`state_${state}`] ?? ""}`}>{LABEL[state]}</span>;
}
