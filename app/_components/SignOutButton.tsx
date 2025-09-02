"use client";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function SignOutButton() {
  return (
    <button
      className="text-[12px] rounded-lg border px-3 py-1"
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        location.href = "/signin";
      }}
    >
      Salir
    </button>
  );
}
