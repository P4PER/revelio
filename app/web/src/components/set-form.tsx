'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/../i18n/navigation'
import { createSetAction, updateSetAction, uploadSetSymbol } from '@/lib/set-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/date-picker'
import { SetSymbolUploader } from '@/components/set-symbol-uploader'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { makeSetCreateSchema } from '@/lib/schemas/set'

export type SetFormInitial = {
  code: string
  name: string
  releaseDate: string
  isOfficial: boolean
  localizations: Record<string, string>
}

type Values = {
  code: string
  name: string
  releaseDate: string
  isOfficial: boolean
  localizations: Record<string, string>
}

export function SetForm({
  mode,
  locales,
  initial,
}: {
  mode: 'create' | 'edit'
  locales: string[]
  initial: SetFormInitial
}) {
  const t = useTranslations('admin.sets')
  const tv = useTranslations('validation')
  const router = useRouter()
  const [symbolFile, setSymbolFile] = useState<File | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(makeSetCreateSchema((k) => tv(k))),
    defaultValues: {
      code: initial.code,
      name: initial.name,
      releaseDate: initial.releaseDate,
      isOfficial: initial.isOfficial,
      localizations: Object.fromEntries(locales.map((l) => [l, initial.localizations[l] ?? ''])),
    },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  async function submit(values: Values) {
    const payload = {
      name: values.name,
      releaseDate: values.releaseDate,
      isOfficial: values.isOfficial,
      localizations: values.localizations,
    }
    const res =
      mode === 'create'
        ? await createSetAction({ code: values.code, ...payload })
        : await updateSetAction(values.code, payload)
    if (res.ok && mode === 'create' && symbolFile) {
      try {
        const fd = new FormData()
        fd.append('code', values.code)
        fd.append('file', symbolFile)
        const up = await uploadSetSymbol(fd)
        if (!up.ok) toast.warning(t('saveError'))
      } catch {
        toast.warning(t('saveError')) // set was created; only the symbol upload failed
      }
    }
    if (res.ok) {
      toast.success(t(mode === 'create' ? 'created' : 'updated'))
      if (mode === 'create') router.push('/admin/sets')
      else router.refresh()
      return
    }
    if (res.error === 'exists') form.setError('code', { message: tv('codeExists') })
    else toast.error(t('saveError'))
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="max-w-xl space-y-5" noValidate>
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('code')}</FormLabel>
              <FormControl>
                <Input {...field} disabled={mode === 'edit'} aria-label={t('code')} className="font-mono" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input {...field} aria-label={t('name')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="releaseDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('releaseDate')}</FormLabel>
              <FormControl>
                <DatePicker
                  value={field.value}
                  onChange={field.onChange}
                  ariaLabel={t('releaseDate')}
                  placeholder={t('releaseDate')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isOfficial"
          render={({ field }) => (
            <label className="flex items-center gap-2">
              <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              <span className="text-sm">{t('official')}</span>
            </label>
          )}
        />

        {mode === 'create' && (
          <div className="space-y-1.5">
            <span className="flex items-center gap-2 text-sm leading-none font-medium">{t('symbol')}</span>
            <SetSymbolUploader staged stagedFile={symbolFile} onStagedChange={setSymbolFile} />
          </div>
        )}

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t('localizedNames')}</legend>
          {locales.map((l) => (
            <FormField
              key={l}
              control={form.control}
              name={`localizations.${l}` as const}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{l.toUpperCase()}</FormLabel>
                  <FormControl>
                    <Input {...field} aria-label={l.toUpperCase()} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </fieldset>

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t(mode === 'create' ? 'create' : 'save')}
        </Button>
      </form>
    </Form>
  )
}
