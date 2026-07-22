import type { ReactNode } from 'react'

/**
 * Narrow centered prose column shared by the legal/about content pages so they
 * read as one family. Styles headings/paragraphs/lists/links via arbitrary
 * variants — the project has no Tailwind typography plugin.
 */
export function ProseShell({ children }: { children: ReactNode }) {
  return (
    <main
      className={
        'mx-auto max-w-[76rem] px-6 py-10 ' +
        '[&_h1]:mb-6 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:text-primary ' +
        '[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground ' +
        '[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground ' +
        '[&_p]:mb-4 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground ' +
        '[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-sm [&_ul]:text-muted-foreground ' +
        '[&_li]:mb-1 ' +
        '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2'
      }
    >
      {children}
    </main>
  )
}
