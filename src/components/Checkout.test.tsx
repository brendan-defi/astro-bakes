import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider } from "@/lib/cart";
import { boxes } from "@/lib/data";
import { startHold } from "@/lib/hold";
import { getStrings } from "@/lib/i18n";
import { Checkout, type CheckoutCustomer, type CheckoutDrop } from "./Checkout";

// The step comes from the URL; tests swap `nav.params` and rerender to move between steps.
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), router: { push: () => {}, replace: () => {}, refresh: () => {} } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/en/checkout", useSearchParams: () => nav.params }));
const actions = vi.hoisted(() => ({ placeOrderAction: vi.fn(), startCheckoutAction: vi.fn() }));
vi.mock("@/app/[locale]/checkout/actions", () => actions);
vi.mock("@/app/[locale]/auth/actions", () => ({ requestSignInAction: vi.fn(), verifyCodeAction: vi.fn() }));

const t = getStrings("en");
const CHECKOUT_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const drop: CheckoutDrop = { id: "drop-03", number: 3, name: "Drop 03 · October", closeAt: "2026-10-18T12:00:00Z", shipAt: "2026-10-24T15:00:00Z", arriveAt: "2026-10-25T15:00:00Z" };
const customer: CheckoutCustomer = { email: "you@example.com", name: "山田 花子", phone: "090-1234-5678", postal: "1530061", line1: "1-2-3", line2: "" };

/** A signed-in customer with a live reservation, at the given checkout step. */
function mountAt(step: "delivery" | "pay") {
  const held = { checkoutId: CHECKOUT_ID, revision: 1, expiresAt: Date.now() + 600_000, items: { "cookie-box": 1 } };
  startHold({ checkoutId: held.checkoutId, revision: held.revision, expires: held.expiresAt });
  const tree = () => (
    <CartProvider dropId="drop-03" boxes={boxes} shippingFee={800}>
      <Checkout locale="en" drop={drop} lineUrl="#" held={held} customer={customer} />
    </CartProvider>
  );
  nav.params = new URLSearchParams(`step=${step}`);
  const view = render(tree());
  return { goTo: (next: "delivery" | "pay") => { nav.params = new URLSearchParams(`step=${next}`); view.rerender(tree()); } };
}

const giftField = () => document.getElementById("co-gift") as HTMLTextAreaElement;
const placeOrder = () => fireEvent.click(screen.getAllByRole("button", { name: /^Place order and pay/ })[0]);

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  actions.placeOrderAction.mockReset().mockResolvedValue({ ok: false, error: "hold_expired" });
});
afterEach(cleanup);

describe("Checkout gift message", () => {
  it("shows the example only as a placeholder, and sends no message when left blank", async () => {
    const { goTo } = mountAt("delivery");
    fireEvent.click(screen.getByLabelText(t.giftToggle));
    expect(giftField().value).toBe("");
    expect(giftField().placeholder).toBe(t.giftPlaceholder);

    goTo("pay");
    expect(screen.queryByText(t.giftCard)).toBeNull();
    placeOrder();
    await waitFor(() => expect(actions.placeOrderAction).toHaveBeenCalledTimes(1));
    expect(actions.placeOrderAction.mock.calls[0][0]).toMatchObject({ gift: null });
  });

  it("treats a whitespace-only message as blank", async () => {
    const { goTo } = mountAt("delivery");
    fireEvent.click(screen.getByLabelText(t.giftToggle));
    fireEvent.change(giftField(), { target: { value: "   " } });
    goTo("pay");
    placeOrder();
    await waitFor(() => expect(actions.placeOrderAction).toHaveBeenCalledTimes(1));
    expect(actions.placeOrderAction.mock.calls[0][0]).toMatchObject({ gift: null });
  });

  it("sends and shows the message the customer typed", async () => {
    const { goTo } = mountAt("delivery");
    fireEvent.click(screen.getByLabelText(t.giftToggle));
    fireEvent.change(giftField(), { target: { value: "Happy birthday, Mum!" } });
    goTo("pay");
    expect(screen.getByText("Happy birthday, Mum!")).toBeTruthy();
    placeOrder();
    await waitFor(() => expect(actions.placeOrderAction).toHaveBeenCalledTimes(1));
    expect(actions.placeOrderAction.mock.calls[0][0]).toMatchObject({ gift: "Happy birthday, Mum!", checkoutId: CHECKOUT_ID, revision: 1 });
  });
});
