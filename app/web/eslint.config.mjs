import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Restore ESLint's own default: dropping a key via `const { drop: _x, ...rest }`
      // is the idiomatic omit, not a dead variable. typescript-eslint defaults this
      // to false, which flags every such destructure.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
      // Object shapes are type aliases (see CLAUDE.md, Conventions / Types). Both of
      // these are auto-fixable, so they are errors rather than warnings: an `interface`
      // that genuinely needs declaration merging, or to extend a third-party interface,
      // takes an inline disable naming the reason.
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      // A type-only import carries the `type` keyword, so nothing the checker alone
      // needed can survive into the emitted module graph.
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // This rule guards production markup against LCP/bandwidth cost. Test files are
    // never served to a user, so it is off for all of them, not just the component
    // tests that currently stub next/image with a plain <img>.
    files: ["**/__tests__/**"],
    rules: { "@next/next/no-img-element": "off" },
  },
]);

export default eslintConfig;
