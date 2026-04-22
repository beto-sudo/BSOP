// Declaración mínima para `@jspawn/ghostscript-wasm` — el package no
// envía types. Solo necesitamos `callMain` y el FS de Emscripten para
// escribir/leer/borrar archivos en la memoria virtual del módulo.
declare module '@jspawn/ghostscript-wasm' {
  type GsModule = {
    callMain: (args: string[]) => number;
    FS: {
      writeFile: (path: string, data: Uint8Array) => void;
      readFile: (path: string) => Uint8Array;
      unlink: (path: string) => void;
    };
  };
  type GsModuleFactory = (init?: unknown) => Promise<GsModule>;
  const factory: GsModuleFactory;
  export default factory;
}
