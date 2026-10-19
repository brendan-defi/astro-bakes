import type { ReactNode } from "react";
import { TruckIcon } from "./icons";

export function InfoStrip({ children, align = "center", className = "" }: { children: ReactNode; align?: "center" | "start"; className?: string }) {
  return (
    <div className={`strip ${className}`} style={{ alignItems: align === "start" ? "flex-start" : "center" }}>
      <TruckIcon style={align === "start" ? { marginTop: 2 } : undefined} />
      <div>{children}</div>
    </div>
  );
}
