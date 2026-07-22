'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { SiteSettings } from '@revelio/db'
import { updateSiteSettings } from '@/lib/site-settings-actions'
import { makeSiteSettingsSchema, type SiteSettingsFormValues } from '@/lib/schemas/site-settings'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Button } from '@/components/ui/button'

type TextField = 'operatorName' | 'contactEmail' | 'hostingProvider' | 'responsiblePerson' | 'githubUrl'

function toValues(initial: SiteSettings | null): SiteSettingsFormValues {
  return {
    operatorName: initial?.operatorName ?? '',
    operatorAddress: initial?.operatorAddress ?? '',
    contactEmail: initial?.contactEmail ?? '',
    hostingProvider: initial?.hostingProvider ?? '',
    responsiblePerson: initial?.responsiblePerson ?? '',
    githubUrl: initial?.githubUrl ?? '',
  }
}

export function SiteSettingsForm({ initial }: { initial: SiteSettings | null }) {
  const t = useTranslations('adminSettings')
  const tv = useTranslations('validation')

  const form = useForm<SiteSettingsFormValues>({
    resolver: zodResolver(makeSiteSettingsSchema((k) => tv(k))),
    defaultValues: toValues(initial),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  // Field/validation errors surface reactively via <FormMessage>. The save result
  // uses sonner toasts (success / non-field failure), matching set-form.tsx. The
  // action returns no field-specific error codes, so there is no setError mapping.
  async function submit(values: SiteSettingsFormValues) {
    const res = await updateSiteSettings(values)
    if (res.ok) toast.success(t('saved'))
    else toast.error(t('saveError'))
  }

  // FormField wraps RHF's Controller; FormLabel/FormControl auto-associate the
  // label with the control, and FormMessage renders that field's zod error.
  const textField = (name: TextField) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t(name)}</FormLabel>
          <FormControl>
            <Input {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="max-w-xl space-y-4" noValidate>
        <p className="text-sm text-muted-foreground">{t('intro')}</p>
        {textField('operatorName')}
        {/* AutoTextarea is controlled (value/onChange), so bind field explicitly. */}
        <FormField
          control={form.control}
          name="operatorAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('operatorAddress')}</FormLabel>
              <FormControl>
                <AutoTextarea
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {textField('contactEmail')}
        {textField('hostingProvider')}
        {textField('responsiblePerson')}
        {textField('githubUrl')}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('save')}
        </Button>
      </form>
    </Form>
  )
}
