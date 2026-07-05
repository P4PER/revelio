import Image from 'next/image'

export function BrandMark() {
  return (
    <Image
      src="/revelio-logo-dark.svg"
      alt="Revelio"
      width={426}
      height={78}
      priority
      className="h-9 w-auto"
    />
  )
}
