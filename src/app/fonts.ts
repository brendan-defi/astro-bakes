import { Pacifico, Titan_One, Zen_Maru_Gothic } from "next/font/google";

/** The three brand faces, shared by the shop's and the admin portal's root layouts; globals.css reads the --font-* variables. */
const display = Titan_One({ weight: "400", subsets: ["latin"], variable: "--font-display", display: "swap" });
const logo = Pacifico({ weight: "400", subsets: ["latin"], variable: "--font-logo", display: "swap" });
const body = Zen_Maru_Gothic({ weight: ["500", "700", "900"], subsets: ["latin"], variable: "--font-body", display: "swap" });

export const fontVariables = `${display.variable} ${logo.variable} ${body.variable}`;
