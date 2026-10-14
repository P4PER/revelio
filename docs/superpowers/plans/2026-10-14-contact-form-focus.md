# Contact form focus management

Follow-up to PR #156 (contact page redesign), which left this out of scope.

## Problem

After a successful send, `ContactForm` unmounts the `<form>` and mounts the success card.
The focused submit button disappears with it, so focus drops to `<body>`: a keyboard user
lands back at the top of the page, and a screen reader is left with no context. "Send
another message" does the same thing the other way round.

## Change

One file, `app/web/src/components/legal/contact-form.tsx`:

1. The success heading takes `tabIndex={-1}` and a module-level callback ref,
   `focusOnMount`. The heading only mounts after a successful send, so focusing it on
   mount is focusing it after the send. Because it is a heading, the reader announces
   the confirmation, and the next Tab reaches "Send another message". The callback
   lives at module level so its identity is stable and React does not re-run it on
   every render.
2. "Send another message" commits the swap back with `flushSync(() => setSent(false))`,
   then calls `form.setFocus('name')`, so the field is already mounted when it is
   focused.
3. No `useRef` flag and no effect. A first draft wrote a ref in `onSubmit`, and
   `react-hooks/refs` rejected it because `onSubmit` is passed to
   `form.handleSubmit(...)` during render. Both paths are now user actions by
   construction, so the page never takes focus on load.
4. The `role="status"` wrapper stays as it is.

## Tests (RED first)

In `components/legal/__tests__/contact-form.test.tsx`:

- after a successful send, `document.activeElement` is the success heading
- after "Send another message", `document.activeElement` is the name input
- on first render, nothing in the form has focus

## Verification

`npm test -w web`, `npm run typecheck`, `npm run lint`, and a keyboard-only Playwright
pass on `/en/contact`.
