import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next's default ignores, which a globalIgnores here would otherwise replace.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
