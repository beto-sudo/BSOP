// app/layout.tsx
import "./globals.css";
import ThemeLoader from "./_components/ThemeLoader";
import OAuthHandler from "./_components/OAuthHandler";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ThemeLoader />
        {/* Maneja el intercambio ?code=... una sola vez a nivel global */}
        <OAuthHandler />
        {children}
      </body>
    </html>
  );
}
