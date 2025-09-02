import { NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    await db.from("Role").upsert(
      ["Admin","Compras","Inventario","Ventas","Caja","Reportes"].map(name => ({ name })),
      { onConflict: "name" }
    );

    const up = await db.from("Company").upsert(
      [
        { name: "Rincón del Bosque", slug: "rincon" },
        { name: "Agencia Stellantis", slug: "agencia" },
        { name: "Desarrolladora DILESA", slug: "dilesa" }
      ],
      { onConflict: "slug" }
    ).select();
    if (up.error) throw up.error;

    const rincon  = up.data!.find(c => c.slug === "rincon")!;
    const agencia = up.data!.find(c => c.slug === "agencia")!;
    const dilesa  = up.data!.find(c => c.slug === "dilesa")!;

    await db.from("ModuleRegistry").upsert([
      { key:"padel.tournaments", name:"Torneos de Pádel", version:"1.0.0" },
      { key:"autos.inventory",   name:"Inventario de Autos", version:"1.0.0" },
      { key:"dilesa.lots",       name:"Lotes y Contratos",   version:"1.0.0" },
    ]);

    await db.from("CompanyModule").upsert([
      { companyId: rincon.id,  moduleKey: "padel.tournaments", enabled: true },
      { companyId: agencia.id, moduleKey: "autos.inventory",   enabled: true },
      { companyId: dilesa.id,  moduleKey: "dilesa.lots",       enabled: true },
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
