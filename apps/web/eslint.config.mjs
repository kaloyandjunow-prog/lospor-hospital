import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Established codebase convention: a leading underscore marks a
      // variable/argument as deliberately unused (destructuring exclusion,
      // intentionally-ignored callback params), not dead code to flag.
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      // The offline vocabulary is ~2.6 MB of ICD-10 and procedure data bundled
      // for the mobile app, which has no network to fall back on. The web app
      // always has the search endpoints, so importing it here would ship the
      // whole table to every browser for no benefit at all.
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@lospor/core/vocabulary",
          message:
            "Offline vocabulary is mobile-only — use /api/search/icd10 and "
            + "/api/search/procedures on the web.",
        }],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated output — not source we own, shouldn't be linted.
    "coverage/**",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
