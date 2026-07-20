import '@testing-library/jest-dom/vitest'

// The OTP email template reads CONTACT_EMAIL at module load (defaults to '' in
// source). Provide a deterministic value for tests so the footer link is testable.
process.env.CONTACT_EMAIL ??= 'contact@revelio.cards'

// jsdom lacks these; Radix (Select/Checkbox/Dialog) calls them during interaction.
if (typeof window !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
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
