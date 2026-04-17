"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Toast — shadcn-style wrapper over @base-ui/react/toast.
 *
 * Standard usage (from any client component):
 *
 *   const toast = useToast()
 *   toast.add({ title: 'Departamento desactivado', type: 'success' })
 *   toast.add({
 *     title: 'No se pudo eliminar',
 *     description: err.message,
 *     type: 'error',
 *   })
 *
 * For destructive actions with undo:
 *
 *   toast.add({
 *     title: 'Departamento eliminado',
 *     action: { label: 'Deshacer', onClick: () => restore(id) },
 *     timeout: 5000,
 *   })
 *
 * Provider is mounted once in components/providers.tsx via <ToastProvider>.
 */

type ToastType = "default" | "success" | "error" | "warning" | "info"

/**
 * ToastProvider — mount once at the root of the app (inside `<Providers>`).
 */
function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastPrimitive.Provider timeout={5000}>
      {children}
      <ToastViewport />
    </ToastPrimitive.Provider>
  )
}

/**
 * ToastViewport — portal target for the toast stack. Positioned bottom-right
 * to match the conventions of Linear, GitHub and shadcn/ui.
 */
function ToastViewport() {
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        data-slot="toast-viewport"
        className={cn(
          "fixed right-4 bottom-4 z-[100] flex max-h-screen w-full max-w-sm flex-col-reverse gap-2 outline-none sm:right-6 sm:bottom-6"
        )}
      >
        <ToastList />
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  )
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()
  return (
    <>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </>
  )
}

function ToastItem({
  toast,
}: {
  toast: ReturnType<typeof ToastPrimitive.useToastManager>["toasts"][number]
}) {
  const type = (toast.type as ToastType | undefined) ?? "default"
  return (
    <ToastPrimitive.Root
      toast={toast}
      data-slot="toast"
      data-type={type}
      className={cn(
        "pointer-events-auto relative isolate z-50 flex w-full items-start gap-3 rounded-lg bg-popover p-3 pr-8 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none duration-100 data-[starting-style]:translate-x-4 data-[starting-style]:opacity-0 data-[ending-style]:translate-x-4 data-[ending-style]:opacity-0",
        "data-[type=success]:ring-[color:var(--color-chart-2,theme(colors.emerald.500/30))]",
        "data-[type=error]:ring-destructive/30 data-[type=error]:bg-destructive/5",
        "data-[type=warning]:ring-amber-500/30",
        "data-[type=info]:ring-sky-500/30"
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <ToastPrimitive.Title
          data-slot="toast-title"
          className="font-medium text-foreground"
        />
        <ToastPrimitive.Description
          data-slot="toast-description"
          className="text-sm text-muted-foreground"
        />
      </div>
      {toast.actionProps && (
        <ToastPrimitive.Action
          data-slot="toast-action"
          className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
      <ToastPrimitive.Close
        data-slot="toast-close"
        aria-label="Cerrar"
        className="absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <XIcon className="size-3.5" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  )
}

/**
 * useToast — call from any client component to trigger toasts.
 * Thin re-export so consumers don't need to know about @base-ui/react.
 */
function useToast() {
  return ToastPrimitive.useToastManager()
}

export { ToastProvider, ToastViewport, useToast }
