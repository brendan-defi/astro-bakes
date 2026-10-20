import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Stepper } from "./Stepper";

afterEach(cleanup);
const labels = { inc: "Add one", dec: "Remove one" };

describe("Stepper effects", () => {
  it("runs the flourish after the change, with the button that was pressed", () => {
    const order: string[] = [];
    const fx = { inc: vi.fn(() => order.push("fx")), dec: vi.fn() };
    render(<Stepper qty={1} max={5} onInc={() => order.push("inc")} onDec={() => {}} labels={labels} fx={fx} />);
    fireEvent.click(screen.getByRole("button", { name: "Add one" }));
    expect(order).toEqual(["inc", "fx"]);
    expect(fx.inc).toHaveBeenCalledWith(screen.getByRole("button", { name: "Add one" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove one" }));
    expect(fx.dec).toHaveBeenCalledWith(screen.getByRole("button", { name: "Remove one" }));
  });

  it("does nothing at the limit", () => {
    const fx = { inc: vi.fn() };
    const onInc = vi.fn();
    render(<Stepper qty={5} max={5} onInc={onInc} onDec={() => {}} labels={labels} fx={fx} />);
    fireEvent.click(screen.getByRole("button", { name: "Add one" }));
    expect(onInc).not.toHaveBeenCalled();
    expect(fx.inc).not.toHaveBeenCalled();
  });

  it("works without effects (the checkout's steppers)", () => {
    const onInc = vi.fn();
    render(<Stepper qty={0} max={5} onInc={onInc} onDec={() => {}} labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Add one" }));
    expect(onInc).toHaveBeenCalledOnce();
  });
});
