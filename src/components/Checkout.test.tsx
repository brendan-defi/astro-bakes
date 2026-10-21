import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider } from "@/lib/cart";
import { boxes } from "@/lib/data";
import { startHold } from "@/lib/hold";
import { getStrings } from "@/lib/i18n";
import { restoreMotion, stubAnimate, stubMatchMedia } from "@/test/motion";
import { Checkout, type CheckoutCustomer, type CheckoutDrop } from "./Checkout";

// The step comes from the URL; tests swap `nav.params` and rerender to move between steps.
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), router: { push: () => {}, replace: () => {}, refresh: () => {} } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/en/checkout", useSearchParams: () => nav.params }));
const actions = vi.hoisted(() => ({ placeOrderAction: vi.fn(), startCheckoutAction: vi.fn() }));
vi.mock("@/app/[locale]/checkout/actions", () => actions);
const auth = vi.hoisted(() => ({ requestSignInAction: vi.fn(), verifyCodeAction: vi.fn() }));
vi.mock("@/app/[locale]/auth/actions", () => auth);
const particles = vi.hoisted(() => ({ celebrate: vi.fn(), burst: vi.fn(), flyTo: vi.fn() }));
vi.mock("@/lib/particles", () => particles);

const t = getStrings("en");
const CHECKOUT_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const drop: CheckoutDrop = { id: "drop-03", number: 3, name: "Drop 03 · October", closeAt: "2026-10-18T12:00:00Z", shipAt: "2026-10-24T15:00:00Z", arriveAt: "2026-10-25T15:00:00Z" };
const customer: CheckoutCustomer = { email: "you@example.com", name: "山田 花子", phone: "090-1234-5678", postal: "1530061", line1: "1-2-3", line2: "" };

/** A signed-in customer with a live reservation, at the given checkout step. */
function mountAt(step: "delivery" | "pay" | "done", who: CheckoutCustomer = customer) {
  const held = { checkoutId: CHECKOUT_ID, revision: 1, expiresAt: Date.now() + 600_000, items: { "cookie-box": 1 } };
  startHold({ checkoutId: held.checkoutId, revision: held.revision, expires: held.expiresAt });
  const tree = () => (
    <CartProvider dropId="drop-03" boxes={boxes} shippingFee={800}>
      <Checkout locale="en" drop={drop} lineUrl="#" held={held} customer={who} />
    </CartProvider>
  );
  nav.params = new URLSearchParams(`step=${step}`);
  const view = render(tree());
  return { goTo: (next: "delivery" | "pay" | "done") => { nav.params = new URLSearchParams(`step=${next}`); view.rerender(tree()); } };
}

const giftField = () => document.getElementById("co-gift") as HTMLTextAreaElement;
const placeOrder = () => fireEvent.click(screen.getAllByRole("button", { name: /^Place order and pay/ })[0]);

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  actions.placeOrderAction.mockReset().mockResolvedValue({ ok: false, error: "hold_expired" });
  particles.celebrate.mockReset();
});
afterEach(cleanup);

describe("Checkout delivery time slot (D21)", () => {
  it("sends no preference by default and says so on the review", async () => {
    const { goTo } = mountAt("delivery");
    expect((screen.getByLabelText(t.deliverySlots.none) as HTMLInputElement).checked).toBe(true);
    goTo("pay");
    expect(screen.getAllByText((_, el) => el?.textContent?.endsWith(`, ${t.deliverySlots.none}`) ?? false).length).toBeGreaterThan(0);
    placeOrder();
    await waitFor(() => expect(actions.placeOrderAction).toHaveBeenCalledTimes(1));
    expect(actions.placeOrderAction.mock.calls[0][0]).toMatchObject({ timeSlot: "none" });
  });

  it("states the fixed date in the question, and carries the chosen time to the review and the order", async () => {
    const { goTo } = mountAt("delivery");
    expect(screen.getByText(/^Arrives .*When suits you\?$/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(t.deliverySlots["14_16"]));
    goTo("pay");
    expect(screen.getAllByText((_, el) => el?.textContent?.endsWith(`, ${t.deliverySlots["14_16"]}`) ?? false).length).toBeGreaterThan(0);
    placeOrder();
    await waitFor(() => expect(actions.placeOrderAction).toHaveBeenCalledTimes(1));
    expect(actions.placeOrderAction.mock.calls[0][0]).toMatchObject({ timeSlot: "14_16" });
  });
});

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

describe("Checkout phone number", () => {
  it("drops letters, and won't continue with a number that isn't one", () => {
    const push = vi.spyOn(nav.router, "push");
    mountAt("delivery", { ...customer, phone: "dsfasd" }); // saved before phone numbers were checked
    const phone = document.getElementById("co-phone") as HTMLInputElement;
    const next = () => fireEvent.click(screen.getByRole("button", { name: t.continueToPayment }));
    next();
    expect(push).not.toHaveBeenCalled();
    expect(phone.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(t.phoneInvalid)).toBeTruthy();

    fireEvent.change(phone, { target: { value: "090-1234-5678abc" } });
    expect(phone.value).toBe("090-1234-5678");
    next();
    expect(push).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("step=pay"));
    push.mockRestore();
  });
});

describe("Checkout celebration", () => {
  const order = { number: "AB-003-001", lines: [{ name: "4 Cookie Box", qty: 1, lineTotal: 1000 }], subtotal: 1000, shippingFee: 800, total: 1800, email: "you@example.com" };

  it("celebrates once when this tab places the order", async () => {
    actions.placeOrderAction.mockResolvedValue({ ok: true, order });
    const { goTo } = mountAt("pay");
    placeOrder();
    await waitFor(() => expect(window.sessionStorage.getItem("ab-last-order")).not.toBeNull());
    goTo("done");
    await waitFor(() => expect(particles.celebrate).toHaveBeenCalledTimes(1));
    expect((particles.celebrate.mock.calls[0][0] as HTMLElement).querySelector("img")).not.toBeNull();
    goTo("done");
    expect(particles.celebrate).toHaveBeenCalledTimes(1);
  });

  it("doesn't celebrate again when a reload restores the order", async () => {
    window.sessionStorage.setItem("ab-last-order", JSON.stringify({ ...order, address: { name: "山田 花子", phone: "", postal: "1530061", line1: "1-2-3", line2: "" }, hit: { prefecture: "東京都", city: "目黒区", town: "中目黒", wardEn: "Meguro-ku", wardCode: "13110", deliverable: true }, gift: null }));
    mountAt("done");
    await waitFor(() => expect(screen.getByText(/AB-003-001/)).toBeTruthy());
    expect(particles.celebrate).not.toHaveBeenCalled();
  });
});

describe("Checkout sign-in", () => {
  /** Signed out, on the code step, with an email already sent from this tab. */
  function mountOnCodeStep() {
    window.sessionStorage.setItem("ab-auth-pending", JSON.stringify({ email: "you@example.com", resendAt: 0 }));
    const tree = (who: CheckoutCustomer | null) => (
      <CartProvider dropId="drop-03" boxes={boxes} shippingFee={800}>
        <Checkout locale="en" drop={drop} lineUrl="#" held={null} customer={who} />
      </CartProvider>
    );
    nav.params = new URLSearchParams("step=code");
    const view = render(tree(null));
    return { goTo: (step: string, who: CheckoutCustomer | null) => { nav.params = new URLSearchParams(`step=${step}`); view.rerender(tree(who)); } };
  }

  it("skips the email steps for someone who just signed in with a code, even on coming back to them", async () => {
    auth.verifyCodeAction.mockResolvedValue({ ok: true, next: "/en/checkout?step=delivery" });
    const replace = vi.spyOn(nav.router, "replace");
    try {
      const { goTo } = mountOnCodeStep();
      fireEvent.change(document.getElementById("co-code")!, { target: { value: "123456" } }); // submits itself
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/checkout?step=delivery"));
      goTo("delivery", customer); // the check's re-render brings the session
      replace.mockClear();
      goTo("signin", customer); // Back to the email step, still signed in
      expect(replace).toHaveBeenCalledWith("/en/checkout?step=delivery");
    } finally {
      replace.mockRestore();
    }
  });

  it("fills the delivery form from the saved details when the session arrives, then keeps the customer's edits", () => {
    const { goTo } = mountOnCodeStep();
    goTo("delivery", customer); // the code check's re-render brings the session
    const field = (id: string) => document.getElementById(id) as HTMLInputElement;
    expect([field("co-name").value, field("co-phone").value, field("co-postal").value, field("co-line1").value]).toEqual([customer.name, customer.phone, customer.postal, customer.line1]);
    fireEvent.change(field("co-phone"), { target: { value: "03-1234-5678" } });
    goTo("delivery", { ...customer }); // a later render, same session
    expect(field("co-phone").value).toBe("03-1234-5678");
  });
});

describe("Checkout sign-in: leaving during the \"you're in\" moment", () => {
  afterEach(() => {
    restoreMotion();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Signed out on the code step, with motion: enters a good code and stops partway into the celebration. */
  async function celebrating() {
    stubMatchMedia(false);
    stubAnimate();
    vi.useFakeTimers();
    auth.verifyCodeAction.mockReset().mockResolvedValue({ ok: true, next: "/en/checkout?step=delivery" });
    const spies = { push: vi.spyOn(nav.router, "push"), replace: vi.spyOn(nav.router, "replace"), refresh: vi.spyOn(nav.router, "refresh") };
    window.sessionStorage.setItem("ab-auth-pending", JSON.stringify({ email: "you@example.com", resendAt: 0 }));
    const tree = (who: CheckoutCustomer | null) => (
      <CartProvider dropId="drop-03" boxes={boxes} shippingFee={800}>
        <Checkout locale="en" drop={drop} lineUrl="#" held={null} customer={who} />
      </CartProvider>
    );
    nav.params = new URLSearchParams("step=code");
    const view = render(tree(null));
    const goTo = (query: string) => { nav.params = new URLSearchParams(query); view.rerender(tree(customer)); };
    fireEvent.change(document.getElementById("co-code")!, { target: { value: "123456" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); }); // the code lands, submits, and is accepted
    goTo("step=code"); // the check's re-render brings the session
    expect(document.querySelector("[data-state]")?.getAttribute("data-state")).toBe("done");
    for (const spy of Object.values(spies)) spy.mockClear();
    return { ...spies, goTo };
  }

  /** Browser Back mid-moment, with the destination slow to land: the moment winds down while the code step still shows. */
  async function backWhileLoading() {
    const spies = await celebrating();
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(spies.replace).not.toHaveBeenCalled(); // nothing jumps ahead of the page they chose while it loads
    return spies;
  }

  it("Back to the cart lands on the cart, even when it's slow to load", async () => {
    const { replace, refresh, goTo } = await backWhileLoading();
    goTo("");
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(replace).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled(); // the moment's own continuation never ran
  });

  it("Back to the email step skips it once it lands, since they're signed in, and nothing is stuck busy", async () => {
    const { replace, refresh, goTo } = await backWhileLoading();
    goTo("step=signin");
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(refresh).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledExactlyOnceWith("/en/checkout?step=delivery");
  });

  it("the back button takes the customer where they asked, not on to delivery when the moment would have ended", async () => {
    const { push, replace, refresh, goTo } = await celebrating();
    fireEvent.click(screen.getByRole("button", { name: t.back }));
    expect(push).toHaveBeenCalledWith("/en/checkout");
    expect(replace).not.toHaveBeenCalled(); // nothing jumps ahead of their step while it loads
    goTo("");
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(replace).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
