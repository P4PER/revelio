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
