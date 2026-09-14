import * as esbuild from 'esbuild'

// esbuild's ESM output wraps dynamic requires in a shim that gates on
// `typeof require !== "undefined"` and otherwise throws
// 'Dynamic require of "node:events" is not supported'. discord.js is CJS, so
// without a real `require` bound at module top level the bundle builds clean
// and dies at import time. This banner defines that binding one line above the
// shim. It is aliased to __cr because banner text is prepended raw and is
// invisible to esbuild's renaming: a bare `createRequire` could collide with a
// bundled identifier of the same name.
const banner = {
  js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
}

// esbuild has already printed the formatted error at this logLevel, so rethrowing
// would only add an unhandled-rejection stack on top of it. Exit on the message.
try {
  await esbuild.build({
    entryPoints: ['src/main.ts'],
    outfile: 'dist/bot.mjs',
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    banner,
    logLevel: 'warning',
  })
} catch (err) {
  // A BuildFailure carries an `errors` array and esbuild has already printed it.
  // Anything else (a host/binary version mismatch from a partial install, say) is
  // never logged, so it would exit 1 with no output at all.
  if (!err?.errors) console.error(err)
  process.exit(1)
}
