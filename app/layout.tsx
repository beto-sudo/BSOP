// app/layout.tsx (o el layout “raíz” de tu app)
import ThemeLoader from "./_components/ThemeLoader";
import Sidebar from "./_components/Sidebar";
import OAuthHandler from "./_components/OAuthHandler";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ThemeLoader />
        <OAuthHandler />
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-6">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
