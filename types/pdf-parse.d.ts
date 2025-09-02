// types/pdf-parse.d.ts
declare module "pdf-parse" {
  // Definición mínima y suficiente para nuestro uso
  type PdfInput = Buffer | Uint8Array | ArrayBuffer;

  interface PdfParseResult {
    text: string;
    info?: unknown;
    metadata?: unknown;
    version?: string;
    numpages?: number;
    numrender?: number;
    stats?: unknown;
  }

  function pdfParse(data: PdfInput, options?: any): Promise<PdfParseResult>;
  export = pdfParse; // CommonJS default export
}
