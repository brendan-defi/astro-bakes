import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `const { [key]: _gone, ...rest } = obj` drops a key, so the named one is meant to go unused.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },
  // eslint-config-next's default ignores, which a globalIgnores here would otherwise replace.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
