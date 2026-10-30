import { ORDER_STATE_LABEL, type DisplayState } from "@/lib/order-admin-rules";
import s from "@/app/admin/admin.module.css";

/** An order's state as the admin sees it (an unpaid order past its hold reads as expired; order-admin-rules.ts). */
export function OrderStatePill({ state }: { state: DisplayState }) {
  return <span className={`${s.pill} ${s[`order_${state}`] ?? ""}`}>{ORDER_STATE_LABEL[state]}</span>;
}
