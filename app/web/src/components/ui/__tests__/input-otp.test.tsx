import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../input-otp'

describe('InputOTP', () => {
  it('renders one slot per index', () => {
    const { container } = render(
      <InputOTP maxLength={6} value="" onChange={() => {}}>
        <InputOTPGroup>
          {Array.from({ length: 6 }, (_, i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>,
    )
    expect(container.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(6)
  })

  it('forwards id to the underlying input for label association', () => {
    const { container } = render(
      <InputOTP maxLength={6} value="" onChange={() => {}} id="code">
        <InputOTPGroup>
          <InputOTPSlot index={0} />
        </InputOTPGroup>
      </InputOTP>,
    )
    expect(container.querySelector('input#code')).not.toBeNull()
  })
})
