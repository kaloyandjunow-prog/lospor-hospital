import js from "@eslint/js"
import tseslint from "typescript-eslint"

// Core is vendored into every client and into the appliance, and until now it
// was the one package with no lint at all -- typecheck and tests only. It is a
// plain TypeScript library with no framework config, so it can sit on eslint 10
// directly; the Next-based repos cannot, because eslint-config-next bundles an
// eslint-plugin-react that still calls the context.getFilename() API eslint 10
// removed, and no fixed release of that plugin exists yet.
//
// Deliberately close to the recommended baseline. The point of turning lint on
// here is to catch the things tsc does not -- unused values, unreachable code,
// accidental shadowing -- not to impose a house style on 94 existing files in
// one change. Tighten later, once the baseline is clean.
export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "**/*.d.ts",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build and boundary scripts run under Node, not in a browser or the
    // library's own module scope. Without this they report console, process
    // and URL as undefined -- a configuration gap, not a defect in them.
    files: ["scripts/**/*.mjs", "*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        fetch: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
      },
    },
  },
  {
    rules: {
      // The catalogue and vocabulary modules are generated or hand-maintained
      // data tables; `any` in a few narrow spots there is not the signal this
      // is meant to surface.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]
