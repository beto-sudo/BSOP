// app/layout.tsx
import "./globals.css";
import OAuthHandler from "./_components/OAuthHandler";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {/* Maneja ?code=... globalmente */}
        <OAuthHandler />
        {children}
      </body>
    </html>
  );
}
