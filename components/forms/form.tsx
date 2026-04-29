'use client';

import * as React from 'react';
import {
  FormProvider,
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
  type SubmitHandler,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z, ZodType } from 'zod';

import { cn } from '@/lib/utils';

export type UseZodFormProps<TSchema extends ZodType<FieldValues>> = {
  schema: TSchema;
  defaultValues: DefaultValues<z.infer<TSchema>>;
  /** Pass-through to react-hook-form. Defaults to `'onTouched'`. */
  mode?: UseFormProps['mode'];
};

/**
 * `useZodForm` — typed wrapper around `useForm` + `zodResolver`.
 *
 * Encapsulates the resolver cast so callers stay in pure inferred-types
 * territory. Returns a fully-typed `UseFormReturn<z.infer<TSchema>>`.
 *
 * Usage:
 *
 *   const FormSchema = z.object({ titulo: z.string().min(1, 'Requerido') });
 *   const form = useZodForm({ schema: FormSchema, defaultValues: { titulo: '' } });
 *
 *   <Form form={form} onSubmit={async (values) => { ... }}>
 *     <FormField name="titulo" label="Título" required>
 *       {(field) => <Input {...field} />}
 *     </FormField>
 *   </Form>
 */
export function useZodForm<TSchema extends ZodType<FieldValues>>({
  schema,
  defaultValues,
  mode = 'onTouched',
}: UseZodFormProps<TSchema>): UseFormReturn<z.infer<TSchema>> {
  type Values = z.infer<TSchema>;
  // Cast required to bridge zod v4's `ZodType<TValues>` and RHF's
  // `Resolver<TValues>` — both encode the same shape but the typing
  // dance between zod v4 and @hookform/resolvers v5 needs help.
  type ZodResolverArg = Parameters<typeof zodResolver>[0];
  return useForm<Values>({
    resolver: zodResolver(schema as unknown as ZodResolverArg) as unknown as Resolver<Values>,
    defaultValues,
    mode,
  });
}

export type FormProps<TFieldValues extends FieldValues> = {
  /** Instance returned by `useZodForm` (or any compatible `useForm` call). */
  form: UseFormReturn<TFieldValues>;
  onSubmit: SubmitHandler<TFieldValues>;
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** Reset to the just-submitted values after success (clears `isDirty`). */
  resetOnSuccess?: boolean;
};

/**
 * `<Form>` — `FormProvider` + `<form>` element with sensible defaults.
 *
 * Wires `form.handleSubmit(onSubmit)`, sets `noValidate` (we own validation
 * via zod, not the browser), and applies `space-y-5` for inter-field
 * spacing. Override layout via `className` if needed.
 *
 * Pair with `useZodForm` (recommended) or any `useForm()` instance.
 */
export function Form<TFieldValues extends FieldValues>({
  form,
  onSubmit,
  children,
  className,
  id,
  resetOnSuccess,
}: FormProps<TFieldValues>) {
  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
    if (resetOnSuccess) form.reset(values);
  });

  return (
    <FormProvider {...form}>
      <form id={id} noValidate onSubmit={handleSubmit} className={cn('space-y-5', className)}>
        {children}
      </form>
    </FormProvider>
  );
}

export { useFormContext } from 'react-hook-form';
export type { UseFormReturn } from 'react-hook-form';
