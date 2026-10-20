import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { boxes } from "@/lib/data";
import { BoxPhoto } from "./BoxPhoto";

afterEach(cleanup);

describe("BoxPhoto", () => {
  it("shows the box's photo when it has one", () => {
    render(<BoxPhoto box={{ ...boxes[0], photo: "/images/boxes/cookie-box.jpg" }} placeholder="Product photo — 4 Cookie Box" />);
    expect(screen.getByRole("img", { name: "4 Cookie Box" }).getAttribute("src")).toContain(encodeURIComponent("/images/boxes/cookie-box.jpg"));
    expect(screen.queryByText("Product photo — 4 Cookie Box")).toBeNull();
  });

  it("keeps the labelled placeholder until a photo is added", () => {
    render(<BoxPhoto box={{ ...boxes[1], photo: undefined }} placeholder="Product photo — Nebula Banana Bread" />);
    expect(screen.getByText("Product photo — Nebula Banana Bread")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Nebula Banana Bread" })).toBeNull();
  });

  it("renders overlays such as the menu tag either way", () => {
    render(<BoxPhoto box={boxes[0]} placeholder=""><span>In the next drop</span></BoxPhoto>);
    expect(screen.getByText("In the next drop")).toBeTruthy();
  });
});
