import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "frontend/**"],
  },
  js.configs.recommended,
  {
    // Application sources: type-aware linting using the project's tsconfig.json
    // (which includes src/**/*.ts and excludes tests).
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts", "src/__tests__/**"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    rules: {
      // Express identifies error middleware by its 4-arg arity, so `_next` must stay.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Route handlers and the stub LlmClient are intentionally `async` without
      // awaiting, to satisfy the uniform Promise-returning contract expected by
      // lib/async-handler.ts and the LlmClient interface.
      "@typescript-eslint/require-await": "off",
    },
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Tests are excluded from tsconfig.json, so lint them without type info.
    files: ["src/**/*.test.ts", "src/__tests__/**/*.ts"],
    extends: [...tseslint.configs.recommended],
  },
)
