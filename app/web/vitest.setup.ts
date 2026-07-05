import '@testing-library/jest-dom/vitest'

// jsdom lacks these; Radix (Select/Checkbox/Dialog) calls them during interaction.
if (typeof window !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
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
