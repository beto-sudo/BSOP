"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

/* ── helpers de color ───────────────────────────────────────── */
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function hexToRgb(hex: string) {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return { r: 37, g: 99, b: 235 };
  const h = m[1];
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}
function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  const R = clamp(Math.round(r), 0, 255), G = clamp(Math.round(g), 0, 255), B = clamp(Math.round(b), 0, 255);
  return `#${toHex(R)}${toHex(G)}${toHex(B)}`;
}
function rgbToHsl(r: number, g: number, b: number) {
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h=0, s=0, l=(max+min)/2;
  if(max!==min){
    const d=max-min;
    s=l>0.5? d/(2-max-min) : d/(max+min);
    switch(max){ case r: h=(g-b)/d+(g<b?6:0); break; case g: h=(b-r)/d+2; break; default: h=(r-g)/d+4; }
    h/=6;
  }
  return { h: Math.round(h*360), s: Math.round(s*100), l: Math.round(l*100) };
}
function hslToRgb(h: number, s: number, l: number) {
  h=((h%360)+360)%360; s=clamp(s,0,100)/100; l=clamp(l,0,100)/100;
  if(s===0){ const v=Math.round(l*255); return { r:v,g:v,b:v }; }
  const q=l<0.5? l*(1+s) : l+s-l*s;
  const p=2*l-q;
  const hk=h/360;
  const tc=[hk+1/3, hk, hk-1/3].map(t=>{ let tt=t; if(tt<0)tt+=1; if(tt>1)tt-=1;
    if(tt<1/6) return p+(q-p)*6*tt;
    if(tt<1/2) return q;
    if(tt<2/3) return p+(q-p)*(2/3-tt)*6;
    return p;
  });
  return { r:Math.round(tc[0]*255), g:Math.round(tc[1]*255), b:Math.round(tc[2]*255) };
}
function hslToHex(h: number, s: number, l: number){ const {r,g,b}=hslToRgb(h,s,l); return rgbToHex(r,g,b); }

/* ── paletas 50–900 ───────────────────────────────────────── */
const L_SCALE: Record<string, number> = { "50":97,"100":94,"200":86,"300":77,"400":66,"500":56,"600":47,"700":39,"800":32,"900":25 };
function buildPalette(h: number, s: number) {
  const out: Record<string,string> = {};
  (Object.keys(L_SCALE) as (keyof typeof L_SCALE)[]).forEach(k => out[k]=hslToHex(h,s,L_SCALE[k]));
  return out;
}
function applyPrimaryVars(p: Record<string,string>) {
  const root=document.documentElement;
  for(const k of Object.keys(p)) root.style.setProperty(`--brand-${k}`, p[k]);
  root.style.setProperty("--brand", p["500"] ?? "#2563eb");
}
function applySecondaryVars(p: Record<string,string>) {
  const root=document.documentElement;
  for(const k of Object.keys(p)) root.style.setProperty(`--brand2-${k}`, p[k]);
  root.style.setProperty("--brand2", p["500"] ?? "#14b8a6");
}

/* ── tipos ───────────────────────────────────────── */
type BrandingColorBlock = {
  brandName?: string;
  primary?: string;
  hue?: number; saturation?: number; lightness?: number;
  palette?: Record<string,string>;
  logoUrl?: string;
  secondary?: any;
};
type CompanyResponse = { id:string; name:string; slug:string; settings?:{ branding?: BrandingColorBlock } };

/* ── color del logo ───────────────────────────────────────── */
type ColorBin = { count:number; r:number; g:number; b:number; };
function getDominantColorsFromImage(img: HTMLImageElement, maxW=160, step=3, maxColors=6){
  const canvas=document.createElement("canvas");
  const ratio = img.width? maxW/img.width : 1;
  canvas.width = Math.min(maxW, img.width||maxW);
  canvas.height = Math.round((img.height||maxW)*ratio);
  const ctx=canvas.getContext("2d"); if(!ctx) return [];
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const {data,width,height}=ctx.getImageData(0,0,canvas.width,canvas.height);
  const bins = new Map<string,ColorBin>();
  for(let y=0;y<height;y+=step){
    for(let x=0;x<width;x+=step){
      const i=(y*width+x)*4; const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
      if(a<128) continue;
      const {h,s,l}=rgbToHsl(r,g,b);
      if(l<8||l>92||s<15) continue;
      const hb=Math.floor((h%360)/10), sb=Math.floor(clamp(s,0,99)/20), lb=Math.floor(clamp(l,0,99)/20);
      const key=`${hb}_${sb}_${lb}`;
      const bin=bins.get(key)??{count:0,r:0,g:0,b:0};
      bin.count++; bin.r+=r; bin.g+=g; bin.b+=b; bins.set(key,bin);
    }
  }
  const picks = Array.from(bins.values()).sort((a,b)=>b.count-a.count).slice(0,maxColors).map(bin=>{
    const rr=Math.round(bin.r/bin.count), gg=Math.round(bin.g/bin.count), bb=Math.round(bin.b/bin.count);
    return rgbToHex(rr,gg,bb);
  });
  const unique:string[]=[];
  for(const hex of picks){
    const {r,g,b}=hexToRgb(hex);
    const near = unique.some(u=>{ const uu=hexToRgb(u); return Math.hypot(r-uu.r,g-uu.g,b-uu.b)<24; });
    if(!near) unique.push(hex);
  }
  return unique.slice(0,maxColors);
}

/* ── página ───────────────────────────────────────── */
export default function BrandingPage(){
  const qp = useSearchParams();
  const company = (qp.get("company")||"").toLowerCase();

  // primary
  const [h, setH] = useState(220);
  const [s, setS] = useState(83);
  const [l, setL] = useState(56);

  // secondary
  const [h2, setH2] = useState(180);
  const [s2, setS2] = useState(70);
  const [l2, setL2] = useState(50);

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [logoUrl, setLogoUrl] = useState<string>("");
  const [logoFile, setLogoFile] = useState<File|null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");

  const [applyTarget, setApplyTarget] = useState<"primary"|"secondary">("primary");
  const [suggested, setSuggested] = useState<string[]>([]);

  const palette  = useMemo(()=>buildPalette(h, s), [h, s]);
  const baseHex  = useMemo(()=>hslToHex(h, s, l), [h, s, l]);
  const palette2 = useMemo(()=>buildPalette(h2,s2), [h2,s2]);
  const baseHex2 = useMemo(()=>hslToHex(h2,s2,l2), [h2,s2,l2]);

  // load
  useEffect(()=>{
    let alive=true;
    (async ()=>{
      try{
        if(!company){ setLoading(false); return; }
        const r = await fetch(`/api/admin/company?company=${company}`, { cache: "no-store" });
        const data = (await r.json()) as CompanyResponse;
        if(!alive) return;
        const b = data?.settings?.branding || {};
        setName(b.brandName || data?.name || "");
        setLogoUrl(b.logoUrl || "");

        // primary
        if(typeof b.hue==="number" && typeof b.saturation==="number"){
          setH(clamp(b.hue,0,360)); setS(clamp(b.saturation,0,100));
          setL(typeof b.lightness==="number" ? clamp(b.lightness,0,100) : 56);
        } else if (b.primary){
          const {r:rr,g:gg,b:bb}=hexToRgb(b.primary);
          const {h:hh,s:ss,l:ll}=rgbToHsl(rr,gg,bb);
          setH(hh); setS(ss); setL(ll);
        }

        // secondary
        const sec = (typeof b.secondary === "string") ? { primary: b.secondary } as BrandingColorBlock : (b.secondary || {});
        if(typeof sec.hue==="number" && typeof sec.saturation==="number"){
          setH2(clamp(sec.hue,0,360)); setS2(clamp(sec.saturation,0,100));
          setL2(typeof sec.lightness==="number" ? clamp(sec.lightness,0,100) : 50);
        } else if (sec.primary){
          const {r:rr2,g:gg2,b:bb2}=hexToRgb(sec.primary);
          const {h:hh2,s:ss2,l:ll2}=rgbToHsl(rr2,gg2,bb2);
          setH2(hh2); setS2(ss2); setL2(ll2);
        }

        // apply persisted palettes (o derivadas)
        if (typeof window!=="undefined") {
          applyPrimaryVars(b.palette ?? buildPalette(h, s));
          applySecondaryVars(sec.palette ?? buildPalette(h2, s2));
        }
      } catch(e){ console.error("branding load", e); }
      finally{ if(alive) setLoading(false); }
    })();
    return ()=>{ alive=false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[company]);

  useEffect(()=>{ if(typeof window!=="undefined") applyPrimaryVars(palette); }, [palette]);
  useEffect(()=>{ if(typeof window!=="undefined") applySecondaryVars(palette2); }, [palette2]);

  // logo
  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0] || null;
    setLogoFile(f||null); setSuggested([]);
    if(f){ const rd=new FileReader(); rd.onload=()=>setLogoPreview(rd.result as string); rd.readAsDataURL(f); }
    else setLogoPreview("");
  }
  function onDetectColors(){
    if(!logoPreview){ alert("Primero selecciona un archivo de logo."); return; }
    const img=new Image();
    img.onload=()=>{
      try{
        const colors=getDominantColorsFromImage(img,160,3,6);
        setSuggested(colors);
        if(colors[0]){
          const {r,g,b}=hexToRgb(colors[0]);
          const {h:hh,s:ss,l:ll}=rgbToHsl(r,g,b);
          if(applyTarget==="primary"){ setH(hh); setS(ss); setL(ll); }
          else { setH2(hh); setS2(ss); setL2(ll); }
        }
      }catch(e){ console.error(e); alert("No se pudieron detectar colores del logo."); }
    };
    img.onerror=()=>alert("No se pudo leer la imagen del logo.");
    img.src=logoPreview;
  }
  async function uploadLogoIfNeeded(): Promise<string|null>{
    if(!logoFile) return null;
    try{
      const fd=new FormData(); fd.append("file", logoFile);
      const r=await fetch(`/api/admin/company/logo?company=${company}`, { method:"POST", body: fd });
      if(!r.ok) throw new Error(`Upload ${r.status}`);
      const j=await r.json(); return j?.url || null;
    }catch(e){ console.warn("Upload logo falló; conservo el actual.", e); return null; }
  }

  async function onSave(){
    if(!company) return alert("Selecciona una empresa (?company=slug).");
    setSaving(true);
    try{
      const uploadedUrl = await uploadLogoIfNeeded();

      const body = {
        settings: {
          branding: {
            brandName: name,
            logoUrl: uploadedUrl || logoUrl,
            // primary
            primary: baseHex, hue: h, saturation: s, lightness: l, palette,
            // secondary
            secondary: { primary: baseHex2, hue: h2, saturation: s2, lightness: l2, palette: palette2 },
          },
        },
      };

      const r=await fetch(`/api/admin/company?company=${company}`,{
        method:"PATCH", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body)
      });
      if(!r.ok) throw new Error(`Error ${r.status}: ${await r.text()}`);
      if(uploadedUrl) setLogoUrl(uploadedUrl);

      /* 🔔 PING al ThemeLoader para refrescar paletas en toda la app */
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("branding:updated"));
        try { localStorage.setItem("branding:updated", String(Date.now())); } catch {}
      }

      alert("Branding guardado.");
    }catch(e:any){
      console.error(e);
      alert(`No se pudo guardar: ${e?.message ?? e}`);
    }finally{
      setSaving(false);
    }
  }

  if(loading){
    return <main className="p-6"><h1 className="text-xl font-semibold mb-2">Branding</h1><p className="text-sm text-slate-500">Cargando…</p></main>;
  }

  return (
    <main className="p-6 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Branding de empresa</h1>
          <p className="text-sm text-slate-500">
            Ajusta Primario y Secundario con H/S/L; generamos paletas <code>50–900</code> y las aplicamos en vivo. Sube tu logo y detecta colores.
          </p>
        </div>
        <button
          onClick={onSave} disabled={saving}
          className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium border border-[var(--brand-300)] bg-[var(--brand-50)] hover:bg-[var(--brand-100)] text-[var(--brand-800)]"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </header>

      {/* Nombre + Logo */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="grid gap-3 max-w-xl">
          <label className="text-xs text-slate-500">Nombre para mostrar</label>
          <input
            value={name} onChange={(e)=>setName(e.target.value)} placeholder="Acme S.A. de C.V."
            className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-500)]"
          />
        </div>

        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Logo</h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-500">Aplicar sugerencias a:</span>
              <label className="inline-flex items-center gap-1">
                <input type="radio" name="applyTarget" checked={applyTarget==="primary"} onChange={()=>setApplyTarget("primary")} /> Primario
              </label>
              <label className="inline-flex items-center gap-1">
                <input type="radio" name="applyTarget" checked={applyTarget==="secondary"} onChange={()=>setApplyTarget("secondary")} /> Secundario
              </label>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            <div className="grid gap-3 max-w-sm">
              <input type="file" accept="image/*" onChange={onPickLogo} className="text-sm" aria-label="Seleccionar logo" />
              <div className="rounded-lg border p-3 w-56 h-56 grid place-items-center bg-white">
                {logoPreview ? (
                  <img src={logoPreview} alt="Preview" className="max-w-full max-h-full object-contain" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="Logo actual" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-xs text-slate-500">Sin logo</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button" onClick={onDetectColors}
                  className="inline-flex items-center rounded-lg px-3 py-2 text-sm border border-[var(--brand-300)] bg-[var(--brand-50)] hover:bg-[var(--brand-100)] text-[var(--brand-800)]"
                >
                  Detectar colores del logo
                </button>
                {logoFile ? <span className="text-xs text-slate-500">El logo se subirá al guardar</span> : null}
              </div>
            </div>

            <div className="flex-1">
              <p className="text-xs text-slate-500 mb-2">Colores sugeridos (clic para aplicar):</p>
              <div className="flex flex-wrap gap-2">
                {suggested.length===0 ? (
                  <span className="text-xs text-slate-400">Sin sugerencias todavía.</span>
                ) : suggested.map(hex=>(
                  <button key={hex} type="button"
                    className="rounded-md border px-2 py-1 text-xs shadow-sm"
                    style={{ backgroundColor: hex, color:"#00000080" }} title={hex}
                    onClick={()=>{
                      const {r,g,b}=hexToRgb(hex);
                      const {h:hh,s:ss,l:ll}=rgbToHsl(r,g,b);
                      if(applyTarget==="primary"){ setH(hh); setS(ss); setL(ll); }
                      else { setH2(hh); setS2(ss); setL2(ll); }
                    }}
                  >
                    {hex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Primario */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Primario</h2>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl">
          <Slider label="Hue (H)" value={h} setValue={setH} min={0} max={360} suffix="" />
          <Slider label="Saturation (S)" value={s} setValue={setS} min={0} max={100} suffix="%" />
          <Slider label="Lightness (L)" value={l} setValue={setL} min={0} max={100} suffix="%" />
        </div>
        <ColorPicker hex={baseHex} onPick={(hex)=>{
          const {r,g,b}=hexToRgb(hex); const {h:hh,s:ss,l:ll}=rgbToHsl(r,g,b);
          setH(hh); setS(ss); setL(ll);
        }} />
        <PalettePreview palette={palette} note="Aplica --brand-50…900; --brand es el 500." />
      </section>

      {/* Secundario */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Secundario</h2>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl">
          <Slider label="Hue (H)" value={h2} setValue={setH2} min={0} max={360} suffix="" />
          <Slider label="Saturation (S)" value={s2} setValue={setS2} min={0} max={100} suffix="%" />
          <Slider label="Lightness (L)" value={l2} setValue={setL2} min={0} max={100} suffix="%" />
        </div>
        <ColorPicker hex={baseHex2} onPick={(hex)=>{
          const {r,g,b}=hexToRgb(hex); const {h:hh,s:ss,l:ll}=rgbToHsl(r,g,b);
          setH2(hh); setS2(ss); setL2(ll);
        }} />
        <PalettePreview palette={palette2} note="Aplica --brand2-50…900; --brand2 es el 500." />
      </section>
    </main>
  );
}

/* ── UI bits ───────────────────────────────────────── */
function Slider({ label, value, setValue, min, max, suffix }:{
  label:string; value:number; setValue:(n:number)=>void; min:number; max:number; suffix:string;
}){
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-slate-500">{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e)=>setValue(parseInt(e.target.value))} className="w-full" />
    </div>
  );
}
function ColorPicker({ hex, onPick }:{ hex:string; onPick:(hex:string)=>void }){
  return (
    <div className="grid gap-3 max-w-xl">
      <label className="text-xs text-slate-500">Color base (HEX)</label>
      <div className="flex items-center gap-3">
        <input type="color" value={hex} onChange={(e)=>onPick(e.target.value)} className="h-10 w-14 rounded border" aria-label="Selector de color base" />
        <code className="text-sm">{hex}</code>
      </div>
    </div>
  );
}
function PalettePreview({ palette, note }:{ palette:Record<string,string>; note:string }){
  return (
    <section className="space-y-3">
      <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
        {(Object.keys(palette) as (keyof typeof palette)[]).map(k=>(
          <div key={k} className="rounded-lg border overflow-hidden">
            <div className="h-10" style={{ backgroundColor: palette[k] }} title={`${k} ${palette[k]}`} />
            <div className="px-2 py-1 text-[10px] flex items-center justify-between">
              <span className="font-medium">{k}</span>
              <span className="text-slate-500">{palette[k]}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">{note}</p>
    </section>
  );
}
