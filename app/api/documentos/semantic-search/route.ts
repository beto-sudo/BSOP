import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

import { createSupabaseServerClient } from '@/lib/supabase-server';

// Límites elegidos para contener costo — $0.0001 por query (text-embedding-3-large).
// 400 chars son suficientes para una descripción razonable en lenguaje natural.
const MAX_QUERY_CHARS = 400;
const DEFAULT_TOP_K = 20;
const MAX_TOP_K = 50;

const Body = z.object({
  query: z
    .string()
    .min(3, 'La consulta es muy corta.')
    .max(MAX_QUERY_CHARS, `Máximo ${MAX_QUERY_CHARS} caracteres.`),
  empresa_ids: z.array(z.string().uuid()).min(1).max(50),
  top_k: z.number().int().min(1).max(MAX_TOP_K).optional(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Request inválido';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY no configurado' }, { status: 500 });
  }

  const supabase = await createSupabaseServerClient();

  // Verificamos que hay una sesión viva. RLS en la RPC hace el filtro real
  // por empresa, pero rechazar anónimos aquí da un 401 más claro.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  // 1) Embedding del query
  let embedding: number[];
  try {
    const result = await embed({
      model: openai.embedding('text-embedding-3-large'),
      value: parsed.query,
      providerOptions: { openai: { dimensions: 1536 } },
      maxRetries: 2,
    });
    embedding = result.embedding;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Embedding falló: ${msg}` }, { status: 502 });
  }

  // 2) RPC a la búsqueda vectorial. El array se serializa como string en el
  //    formato de pgvector (`[0.1,0.2,...]`) — supabase-js reenvía el valor
  //    tal cual al REST; pg hace el cast al tipo vector.
  const embeddingLiteral = `[${embedding.join(',')}]`;

  const { data, error } = await supabase.schema('erp').rpc('search_documentos_by_embedding', {
    query_embedding: embeddingLiteral,
    p_empresa_ids: parsed.empresa_ids,
    top_k: parsed.top_k ?? DEFAULT_TOP_K,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    results: (data ?? []).map((r: { id: string; similarity: number }) => ({
      id: r.id,
      similarity: r.similarity,
    })),
  });
}
