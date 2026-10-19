"use client";

import { useSearchParams } from "next/navigation";
import { demoEnabled } from "./demo";

/** Keeps the ?state= demo switch on links between the homepage and the checkout, outside production. */
export function useDemoQuery(): string {
  const sp = useSearchParams();
  const state = demoEnabled ? sp.get("state") : null;
  return state ? `?state=${encodeURIComponent(state)}` : "";
}
