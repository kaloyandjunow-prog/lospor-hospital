import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import unusedImports from "eslint-plugin-unused-imports"

export default tseslint.config(
  {
    ignores: [
      "android/**",
      "assets/**",
      "dist/**",
      "node_modules/**",
      "patches/**",
      "public/**",
      "*.log",
      "*.png",
      "*.mp4",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "unused-imports": unusedImports,
    },
    languageOptions: {
      globals: {
        AbortController: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        crypto: "readonly",
        fetch: "readonly",
        FileReader: "readonly",
        FormData: "readonly",
        Headers: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        process: "readonly",
        Request: "readonly",
        Response: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        URL: "readonly",
        window: "readonly",
      },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
      // Dead code fails the gate. A dead import once silently disabled a whole
      // feature (the vitals autofill hook was imported but never called) and
      // slipped through because unused-vars was only a warning. `no-unused-imports`
      // is auto-fixable (`eslint --fix` strips them); prefix a deliberately
      // unused binding with `_` to opt out.
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": ["error", {
        vars: "all", varsIgnorePattern: "^_",
        args: "after-used", argsIgnorePattern: "^_",
      }],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
)
