import type { Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import type { OrderStatus } from "@/lib/order-status";
import a from "../account.module.css";

const CLASS: Record<OrderStatus, string> = {
  awaiting_payment: a.pillWaiting,
  confirmed: a.pillConfirmed,
  baking: a.pillBaking,
  shipped: a.pillShipped,
  delivered: a.pillDelivered,
  cancelled: a.pillCancelled,
  expired: a.pillCancelled,
};

export function StatusPill({ locale, status }: { locale: Locale; status: OrderStatus }) {
  const t = getStrings(locale);
  return <span className={`${a.pill} ${CLASS[status]}`}>{t.orderStatus[status]}</span>;
}
