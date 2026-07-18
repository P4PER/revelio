// Cookie that persists the collection grid's quantity-stepper layout. Plain
// (non-'use client') module so a Server Component can import the literal string
// and read it — a 'use client' export becomes a client reference on the server,
// which silently breaks `cookies().get(STEPPER_LAYOUT_COOKIE)`.
export const STEPPER_LAYOUT_COOKIE = 'revelio.collection-stepper'

// 'panel'   — steppers on a solid panel under the card image (always visible)
// 'overlay' — steppers as a hover overlay on a scrim over the image
export type StepperLayout = 'panel' | 'overlay'

export function parseStepperLayout(value: string | undefined): StepperLayout {
  return value === 'overlay' ? 'overlay' : 'panel'
}
