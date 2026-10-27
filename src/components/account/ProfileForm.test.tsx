import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileForm, type ProfileValues } from "./ProfileForm";

const updateProfileAction = vi.fn();
vi.mock("@/app/[locale]/account/actions", () => ({ updateProfileAction: (...a: unknown[]) => updateProfileAction(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const saved: ProfileValues = { name: "Hiromi", phone: "090-1234-5678", locale: "en", postal: "1530062", line1: "2-10-43", line2: "" };
const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const save = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save changes" })); });

describe("ProfileForm phone and postal code", () => {
  beforeEach(() => { updateProfileAction.mockReset(); });
  afterEach(cleanup);

  it("drops letters typed into the phone number and postal code", () => {
    render(<ProfileForm locale="en" initial={saved} />);
    fireEvent.change(field(/Phone/), { target: { value: "090-1234-5678dsfasd" } });
    expect(field(/Phone/).value).toBe("090-1234-5678");
    fireEvent.change(field(/Postal code/), { target: { value: "〒153-0062abc" } });
    expect(field(/Postal code/).value).toBe("153-0062");
  });

  it("won't save a number saved before this check, and says why", async () => {
    render(<ProfileForm locale="en" initial={{ ...saved, phone: "dsfasd" }} />);
    await save();
    expect(updateProfileAction).not.toHaveBeenCalled();
    expect(field(/Phone/).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Enter a Japanese phone number, like 090-1234-5678.")).toBeTruthy();
  });

  it("won't save a mobile number missing a digit", async () => {
    render(<ProfileForm locale="en" initial={{ ...saved, phone: "090-1234-567" }} />);
    await save();
    expect(updateProfileAction).not.toHaveBeenCalled();
  });

  it("saves a number typed through a Japanese IME", async () => {
    updateProfileAction.mockResolvedValue({ ok: true });
    render(<ProfileForm locale="en" initial={{ ...saved, phone: "" }} />);
    fireEvent.change(field(/Phone/), { target: { value: "０９０ー１２３４ー５６７８" } });
    await save();
    expect(updateProfileAction).toHaveBeenCalledWith(expect.objectContaining({ phone: "090-1234-5678" }));
    expect(screen.getByRole("status").textContent).toBe("Saved.");
  });
});

describe("ProfileForm missing fields", () => {
  beforeEach(() => { updateProfileAction.mockReset(); });
  afterEach(cleanup);
  const empty: ProfileValues = { name: "", phone: "", locale: "en", postal: "", line1: "", line2: "" };
  const describedBy = (el: HTMLElement) => document.getElementById(el.getAttribute("aria-describedby") ?? "")?.textContent ?? "";

  it("says nothing before the first save", () => {
    render(<ProfileForm locale="en" initial={empty} />);
    expect(document.querySelectorAll("[aria-invalid]").length).toBe(0);
    expect(screen.queryByText("Enter the recipient's name.")).toBeNull();
  });

  it("names each missing field, links the message to it, and focuses the first", async () => {
    render(<ProfileForm locale="en" initial={empty} />);
    await save();
    const name = field(/Recipient name/);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy(name)).toContain("Enter the recipient's name.");
    expect(document.activeElement).toBe(name);
    const postal = field(/Postal code/);
    expect(postal.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy(postal)).toContain("Enter a postal code and look it up.");
    const street = field(/Street number/);
    expect(street.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy(street)).toContain("Enter the street number.");
    expect(updateProfileAction).not.toHaveBeenCalled();
  });

  it("clears a field's message once it is filled, and moves on to the next problem", async () => {
    render(<ProfileForm locale="en" initial={empty} />);
    await save();
    fireEvent.change(field(/Recipient name/), { target: { value: "山田 花子" } });
    expect(field(/Recipient name/).getAttribute("aria-invalid")).toBeNull();
    expect(screen.queryByText("Enter the recipient's name.")).toBeNull();
    await save();
    expect(document.activeElement).toBe(field(/Phone/));
  });
});
