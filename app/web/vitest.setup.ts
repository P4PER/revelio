import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// Some components schedule setTimeout()s they never clear on unmount — notably
// input-otp's selection-mirror sync, which setState()s after 0/10/50ms. When a
// test finishes before those fire, the callback runs after jsdom has torn down
// `window`, and React's scheduler throws "window is not defined", failing the
// whole run. Nothing in our tests depends on a real timer surviving past the
// test that scheduled it, so track live timeouts and cancel any still pending in
// afterEach (which runs after RTL's own unmount cleanup, catching unmount-time
// timers too). Skipped while fake timers are installed (vi.useFakeTimers swaps
// these globals out and discards its own queue on restore).
if (typeof globalThis.setTimeout === 'function') {
  const liveTimeouts = new Set<ReturnType<typeof setTimeout>>()
  const realSetTimeout = globalThis.setTimeout.bind(globalThis)
  const realClearTimeout = globalThis.clearTimeout.bind(globalThis)
  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const id = realSetTimeout(handler as never, timeout, ...args)
    liveTimeouts.add(id)
    return id
  }) as unknown as typeof setTimeout
  globalThis.clearTimeout = ((id?: Parameters<typeof clearTimeout>[0]) => {
    if (id !== undefined) liveTimeouts.delete(id as ReturnType<typeof setTimeout>)
    return realClearTimeout(id as never)
  }) as unknown as typeof clearTimeout
  afterEach(() => {
    for (const id of liveTimeouts) realClearTimeout(id)
    liveTimeouts.clear()
  })
}

// jsdom lacks these; Radix (Select/Checkbox/Dialog) calls them during interaction.
if (typeof window !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  // input-otp's password-manager-badge detection calls elementFromPoint when the
  // field is focused (e.g. via autoFocus); jsdom doesn't implement it.
  if (!document.elementFromPoint) {
    document.elementFromPoint = () => null
  }
  // Radix Checkbox (useSize) observes its control on mount; jsdom has no ResizeObserver.
  if (!('ResizeObserver' in window)) {
    ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  // jsdom in this setup ships a non-functional localStorage ({} with no methods);
  // provide a Map-backed Storage so components/tests using localStorage work.
  if (typeof window.localStorage?.getItem !== 'function') {
    const store = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() {
          return store.size
        },
      },
    })
  }
}

// jsdom's Blob/File has no arrayBuffer() (real Node/undici Files used by Next.js
// server actions do); image-actions reads uploaded files via file.arrayBuffer().
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}
