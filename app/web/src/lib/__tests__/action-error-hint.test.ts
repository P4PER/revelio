import { describe, expect, it } from 'vitest'
import { actionErrorHint } from '../action-error-hint'

describe('actionErrorHint', () => {
  it('sends an ended session to sign in again', () => {
    expect(actionErrorHint('auth')).toBe('signInHint')
  })

  it.each(['invalid', 'forbidden'])('suggests a reload for %s', (error) => {
    expect(actionErrorHint(error)).toBe('reloadHint')
  })
})
