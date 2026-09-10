import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// Lints the five non-web workspaces. `web` keeps its own config next door: its rule set
// is Next- and React-specific and its files never need these defaults. `npm run lint`
// from this root runs both, and CI runs that one script.
export default defineConfig([
  globalIgnores(["**/node_modules/**", "**/dist/**", "**/.next/**", "web/**"]),
  {
    // Every source extension, not just .ts: a block that matches nothing leaves the file
    // linted with an empty rule set and reports nothing, so the gap would be invisible.
    // The two type rules simply never fire on the .mjs scripts.
    files: ["{core,search,db,ingest,bot}/**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
    extends: [tseslint.configs.recommended],
    rules: {
      // Same two house rules the web config carries, so the convention holds in every
      // workspace rather than only where a lint step happened to exist.
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/consistent-type-imports": "error",
      // Matches web: dropping a key via `const { drop: _x, ...rest }` is the idiomatic
      // omit, not a dead variable.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },
]);
