// Stub for `next/font/google` under vitest. The real loader is a build-time SWC
// transform, not a runtime function, so calling e.g. Poppins() throws in
// Node/jsdom. This returns the shape components consume ({ variable, className }).
type FontResult = { className: string; variable: string; style: { fontFamily: string } }

const stub = (): FontResult => ({
  className: 'font-stub',
  variable: 'font-stub-var',
  style: { fontFamily: 'stub' },
})

export const Poppins = stub
