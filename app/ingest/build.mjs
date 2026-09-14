import * as esbuild from 'esbuild'

// esbuild's ESM output wraps dynamic requires in a shim that gates on
// `typeof require !== "undefined"` and otherwise throws
// 'Dynamic require of "node:events" is not supported'. Parts of the ingest
// dependency tree are CJS, so without a real `require` bound at module top
// level the bundle builds clean and dies at import time. This banner defines
// that binding one line above the shim. It is aliased to __cr because banner
// text is prepended raw and is invisible to esbuild's renaming: a bare
// `createRequire` could collide with a bundled identifier of the same name.
//
// migrate.mjs emits no such shim today. It keeps the banner anyway - that is a
// property of the current dependency tree, not of the entrypoint.
const banner = {
  js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
}

// The migration runner lives in db/, which has no build step of its own; the
// ingest image is what ships it.
const entries = [
  { entryPoints: ['src/main.ts'], outfile: 'dist/ingest.mjs' },
  { entryPoints: ['../db/src/migrate-cli.ts'], outfile: 'dist/migrate.mjs' },
]

// esbuild has already printed the formatted error at this logLevel, so rethrowing
// would only add an unhandled-rejection stack on top of it. Exit on the message.
try {
  for (const entry of entries) {
    await esbuild.build({
      ...entry,
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      banner,
      logLevel: 'warning',
    })
  }
} catch {
  process.exit(1)
}
