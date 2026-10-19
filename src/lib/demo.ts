/**
 * Demo switches (?state=, ?next=, ?viewer= on the homepage; ?demo=cart|soldout
 * in the cart) exist for development and Vercel preview deployments. In
 * production they're ignored so visitors only ever see the real drop state.
 * Vercel sets VERCEL_ENV on the server and NEXT_PUBLIC_VERCEL_ENV in the
 * client bundle; locally neither is set, which counts as development.
 */
export const demoEnabled = (process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "development") !== "production";
