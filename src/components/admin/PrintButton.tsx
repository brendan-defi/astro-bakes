"use client";

import s from "@/app/admin/admin.module.css";

/** Prints the page; the admin's print styles leave out the navigation and the buttons. */
export function PrintButton() {
  return <button type="button" className={`btn btn-secondary ${s.btnSm} ${s.noPrint}`} onClick={() => window.print()}>Print</button>;
}
