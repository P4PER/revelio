import { describe, it, expect } from 'vitest'
import { imageKey, thumbKey, symbolKey, imageUrl } from '../src/images.js'

describe('image keys and urls', () => {
  it('builds object keys', () => {
    expect(imageKey('bs-1-dean-thomas')).toBe('cards/bs-1-dean-thomas.png')
    expect(thumbKey('bs-1-dean-thomas')).toBe('cards/thumb/bs-1-dean-thomas.jpg')
    expect(symbolKey('BS')).toBe('symbols/BS.png')
  })

  it('joins base and key with a single slash', () => {
    expect(imageUrl('https://img.example.com', 'cards/x.png')).toBe('https://img.example.com/cards/x.png')
    expect(imageUrl('https://img.example.com/', 'cards/x.png')).toBe('https://img.example.com/cards/x.png')
  })
})
