'use client'
import { useEffect } from 'react'

// Two distinct search shortcuts:
//   ⌘K / Ctrl+K → the page's own search (data-search-primary), falling back to
//                 the navbar search so it always lands somewhere.
//   /           → the navbar search (data-search-hotkey), the global site search.
// "/" is ignored while typing in a field so it doesn't hijack normal input.
function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function SearchHotkey() {
  useEffect(() => {
    function focus(el: HTMLInputElement | null) {
      if (!el) return false
      el.focus()
      el.select()
      return true
    }

    function onKey(e: KeyboardEvent) {
      const primary = () => document.querySelector<HTMLInputElement>('[data-search-primary]')
      const navbar = () => document.querySelector<HTMLInputElement>('[data-search-hotkey]')

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (focus(primary() ?? navbar())) e.preventDefault()
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        if (focus(navbar() ?? primary())) e.preventDefault()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return null
}
