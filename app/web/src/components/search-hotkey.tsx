'use client'
import { useEffect } from 'react'

// Two distinct search shortcuts:
//   ⌘K / Ctrl+K → the page's own search (data-search-primary), falling back to
//                 the navbar search so it always lands somewhere.
//   /           → the navbar search (data-search-hotkey), the global site search.
// "/" is ignored while a text field, dropdown, menu, or dialog is active so it
// doesn't hijack typing or interrupt an open widget.
function isBusyTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  const role = el.getAttribute('role')
  if (role && ['combobox', 'listbox', 'menu', 'menuitem', 'option', 'textbox'].includes(role)) {
    return true
  }
  if (el.getAttribute('aria-expanded') === 'true') return true
  return !!el.closest('[role="dialog"],[role="menu"],[role="listbox"],[aria-modal="true"]')
}

export function SearchHotkey() {
  useEffect(() => {
    // Focus the target and report whether focus actually landed, so we only
    // swallow the key (preventDefault) when something really took focus.
    function focus(el: HTMLInputElement | null) {
      if (!el) return false
      el.focus()
      if (document.activeElement !== el) return false
      el.select()
      return true
    }

    function onKey(e: KeyboardEvent) {
      const primary = () => document.querySelector<HTMLInputElement>('[data-search-primary]')
      const navbar = () => document.querySelector<HTMLInputElement>('[data-search-hotkey]')

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (focus(primary() ?? navbar())) e.preventDefault()
      } else if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isBusyTarget(e.target) &&
        // Bail if a modal dialog/sheet is open anywhere (focus may be trapped).
        !document.querySelector('[role="dialog"][data-state="open"]')
      ) {
        if (focus(navbar() ?? primary())) e.preventDefault()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return null
}
