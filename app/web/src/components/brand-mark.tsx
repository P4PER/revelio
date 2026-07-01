import Image from 'next/image'

export function BrandMark() {
  return (
    <Image
      src="/revelio-logo-dark.svg"
      alt="revelio.cards"
      width={180}
      height={40}
      priority
    />
  )
}
