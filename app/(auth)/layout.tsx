export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Nada de <html>/<body> aquí; esto vive DENTRO del root layout
  return <div className="min-h-screen bg-slate-50 grid place-items-center p-6">{children}</div>;
}
