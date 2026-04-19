import Image from 'next/image';
import Link from 'next/link';

export default function CompartirNotFound() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <Link
          href="https://bsop.io"
          className="inline-flex items-center rounded-2xl border border-white/10 bg-white px-3 py-2 shadow-sm transition hover:border-amber-300/40"
          aria-label="Ir a BSOP"
        >
          <Image
            src="/logo-bsop.jpg"
            alt="BSOP"
            width={110}
            height={38}
            className="h-auto w-auto object-contain"
            priority
          />
        </Link>

        <div className="text-xs uppercase tracking-[0.24em] text-white/40">Enlace compartido</div>

        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Este enlace ya no está disponible
        </h1>

        <p className="max-w-md text-sm leading-7 text-white/60 sm:text-base">
          El enlace que abriste no existe, fue revocado o expiró. Pídele a quien te lo compartió que
          genere uno nuevo.
        </p>

        <div className="rounded-2xl border border-white/10 bg-white/4 px-5 py-4 text-xs text-white/50">
          Si crees que esto es un error, verifica que copiaste el enlace completo.
        </div>
      </div>
    </main>
  );
}
