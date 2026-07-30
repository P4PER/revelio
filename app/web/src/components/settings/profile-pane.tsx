'use client'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { updateUsername } from '@/lib/settings-actions'
import { usernameAvailable } from '@/lib/auth-actions'
import { makeUsernameSchema } from '@/lib/schemas/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import type { SettingsUser } from './types'

export function ProfilePane({ user }: { user: SettingsUser }) {
  const t = useTranslations('settings.profile')
  const tv = useTranslations('validation')
  const [pending, start] = useTransition()
  const [checking, setChecking] = useState(false)
  const form = useForm({
    resolver: zodResolver(makeUsernameSchema((k) => tv(k))),
    defaultValues: { username: user.displayUsername ?? user.username ?? '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  const current = (user.username ?? '').trim().toLowerCase()

  function onSubmit(values: { username: string }) {
    start(async () => {
      const next = values.username.trim()
      if (next.toLowerCase() === current) {
        form.setError('username', { message: t('unchanged') })
        return
      }
      setChecking(true)
      const free = await usernameAvailable(next).finally(() => setChecking(false))
      if (!free) {
        form.setError('username', { message: t('taken') })
        return
      }
      try {
        const res = await updateUsername(next)
        if (res.ok) toast.success(t('saved'))
        else toast.error(res.error === 'taken' ? t('taken') : res.error === 'unchanged' ? t('unchanged') : t('saveError'))
      } catch {
        toast.error(t('saveError'))
      }
    })
  }

  return (
    <section aria-labelledby="s-profile" className="rounded-xl border border-border bg-card p-5">
      <h2 id="s-profile" className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{t('hint')}</p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-sm space-y-4">
          <FormField control={form.control} name="username" render={({ field }) => (
            <FormItem>
              <Label htmlFor="username">{t('usernameLabel')}</Label>
              <FormControl><Input id="username" autoComplete="off" {...field} /></FormControl>
              {checking && <p className="text-xs text-muted-foreground">{t('checking')}</p>}
              <FormMessage />
            </FormItem>
          )} />
          <Button type="submit" disabled={pending || checking}>{t('save')}</Button>
        </form>
      </Form>

      <dl className="mt-6 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
        <div className="flex gap-2"><dt className="font-medium">{t('emailLabel')}:</dt><dd>{user.email}</dd></div>
        <div className="flex gap-2"><dt className="font-medium">{t('roleLabel')}:</dt><dd>{user.role ?? 'user'}</dd></div>
        <div className="flex gap-2"><dt className="font-medium">{t('joinedLabel')}:</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd></div>
      </dl>
    </section>
  )
}
