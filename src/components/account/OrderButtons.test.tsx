import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boxes } from "@/lib/data";
import { CancelOrderButton, ReorderButton } from "./OrderButtons";

const cancelOrderAction = vi.fn();
const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("@/app/[locale]/account/actions", () => ({ cancelOrderAction: (...a: unknown[]) => cancelOrderAction(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("CancelOrderButton", () => {
  beforeEach(() => { cancelOrderAction.mockReset(); router.refresh.mockReset(); });
  afterEach(cleanup);

  async function confirmCancel() {
    render(<CancelOrderButton locale="en" number="AB-003-001" />);
    fireEvent.click(screen.getByText("Cancel this order"));
    await act(async () => { fireEvent.click(screen.getByText("Yes, cancel it")); });
  }

  it("refreshes the page after a successful cancellation", async () => {
    cancelOrderAction.mockResolvedValue({ ok: true, refunded: true });
    await confirmCancel();
    expect(cancelOrderAction).toHaveBeenCalledWith("AB-003-001");
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains a refusal and shows the server's state", async () => {
    cancelOrderAction.mockResolvedValue({ ok: false, error: "closed" });
    await confirmCancel();
    expect(screen.getByRole("alert").textContent).toMatch(/drop has closed/);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("when the request itself fails, says so and refreshes the authoritative order", async () => {
    cancelOrderAction.mockRejectedValue(new Error("network"));
    await confirmCancel();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't reach the server/);
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByText("Cancel this order")).toBeTruthy(); // back to the button, not stuck confirming
  });
});

describe("ReorderButton", () => {
  beforeEach(() => { window.localStorage.clear(); router.push.mockReset(); });
  afterEach(cleanup);

  it("adds the order's boxes to what is already in the cart, clamped, and goes to the checkout", () => {
    window.localStorage.setItem("ab-cart:drop-03", JSON.stringify({ "banana-bread": 1 }));
    render(<ReorderButton locale="en" dropId="drop-03" items={{ "cookie-box": 2, "banana-bread": 9 }} boxes={boxes} />);
    fireEvent.click(screen.getByText("Order again"));
    expect(JSON.parse(window.localStorage.getItem("ab-cart:drop-03")!)).toEqual({ "cookie-box": 2, "banana-bread": 3 }); // 1 + 9, clamped to the 3 left
    expect(router.push).toHaveBeenCalledWith("/en/checkout");
  });
});
