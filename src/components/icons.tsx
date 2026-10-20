import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size: number, p: P) => ({
  viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor",
  strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p,
});

export const CartIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}><path d="M5 8h14l-1.2 11H6.2L5 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
);
export const ClockIcon = ({ size = 15, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={2.6}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const TruckIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={2.2}><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></svg>
);
export const CheckIcon = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}><path d="M5 12l5 5 9-10" /></svg>
);
export const WarningIcon = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 3l10 18H2z" /><path d="M12 10v5" /><path d="M12 18h.01" /></svg>
);
export const InstagramIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={2.2}><rect x="4" y="4" width="16" height="16" rx="5" /><circle cx="12" cy="12" r="3.5" /><circle cx="16.8" cy="7.2" r=".6" /></svg>
);
export const ArrowDownIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={3}><path d="M12 4v15M5 13l7 7 7-7" /></svg>
);
export const ArrowLeftIcon = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={2.8}><path d="M15 5l-7 7 7 7" /></svg>
);
export const CameraIcon = ({ size = 28, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={2}><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
export const CardIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={2.2}><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /></svg>
);
/* Shape geometry shared with the particle art in lib/particle-art.ts. */
/** Paw on a 24×24 box: toe centres (each a 2.2×2.8 ellipse) and the pad. */
export const PAW_TOES = [[6, 10], [10, 5.5], [14.5, 5.5], [18.5, 10]] as const;
export const PAW_PAD = "M12.2 11c-3 0-5.7 3.2-5.7 6 0 1.8 1.4 2.8 3 2.8 1.2 0 1.8-.6 2.7-.6s1.5.6 2.7.6c1.6 0 3-1 3-2.8 0-2.8-2.7-6-5.7-6z";
/** Five-point star on a 48×48 box. */
export const STAR_PATH = "M24 2 l6.2 13.4 14.6 1.8 -10.8 10 2.9 14.5 -12.9 -7.3 -12.9 7.3 2.9 -14.5 -10.8 -10 14.6 -1.8z";
/** Cookie on a 64×64 box: dough colour, chip colour and chips as [cx, cy, r]. */
export const COOKIE = { dough: "#E8B56A", chip: "#6B3E26", chips: [[22, 24, 5], [40, 20, 4], [43, 38, 5.5], [26, 43, 4.5], [32, 31, 3]] } as const;

export const PawIcon = ({ size = 28, ...p }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden {...p}>
    {PAW_TOES.map(([cx, cy]) => <ellipse key={`${cx},${cy}`} cx={cx} cy={cy} rx="2.2" ry="2.8" />)}
    <path d={PAW_PAD} />
  </svg>
);
export const StarShape = ({ fill = "var(--aqua)", strokeWidth = 3, ...p }: SVGProps<SVGSVGElement> & { fill?: string; strokeWidth?: number }) => (
  <svg viewBox="0 0 48 48" aria-hidden {...p}><path d={STAR_PATH} fill={fill} stroke="var(--ink)" strokeWidth={strokeWidth} strokeLinejoin="round" /></svg>
);

export const CookieShape = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 64 64" aria-hidden {...p}>
    <circle cx="32" cy="32" r="28" fill={COOKIE.dough} stroke="var(--ink)" strokeWidth="4" />
    {COOKIE.chips.map(([cx, cy, r]) => <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={r} fill={COOKIE.chip} />)}
  </svg>
);

const BURST = "100,50 87.7,60.1 93.3,75 77.6,77.6 75,93.3 60.1,87.7 50,100 39.9,87.7 25,93.3 22.4,77.6 6.7,75 12.3,60.1 0,50 12.3,39.9 6.7,25 22.4,22.4 25,6.7 39.9,12.3 50,0 60.1,12.3 75,6.7 77.6,22.4 93.3,25 87.7,39.9";
export const StarburstShape = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="-4 -4 108 108" aria-hidden {...p}><polygon points={BURST} fill="var(--butter)" stroke="var(--ink)" strokeWidth="4" strokeLinejoin="round" /></svg>
);
