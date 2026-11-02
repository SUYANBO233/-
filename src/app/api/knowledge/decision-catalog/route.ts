import { NextResponse } from 'next/server';
import { z } from 'zod';
import { catalogImportSchema } from '@/lib/decision-catalog';
import { CatalogStoreError, catalogRpc, publishDecisionCatalog, readDecisionCatalog } from '@/server/catalog-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function failure(error: unknown): Response {
  if (error instanceof z.ZodError) return NextResponse.json({ message:'资料格式错误', issues:error.issues },{ status:400 });
  if (error instanceof CatalogStoreError) return NextResponse.json({ message:error.message },{ status:error.status });
  console.error('决策资料请求失败',error);
  return NextResponse.json({ message:'决策资料请求失败，请检查服务端日志' },{ status:500 });
}
export async function GET() {
  try { return NextResponse.json(await readDecisionCatalog()); } catch (error: unknown) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const input: unknown = await request.json().catch(() => null);
    const bundle = catalogImportSchema.parse(input);
    if (new URL(request.url).searchParams.get('validate') === 'true') return NextResponse.json({ valid:true, rules:bundle.rules.length,templates:bundle.templates.length,observations:bundle.observations.length });
    return NextResponse.json({ success:true, result:await publishDecisionCatalog(bundle) });
  } catch (error: unknown) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const input = z.object({ kind:z.enum(['rule','template']),code:z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),version:z.number().int().positive(),enabled:z.boolean() }).strict().parse(body);
    await catalogRpc('set_decision_catalog_enabled',{ p_kind:input.kind,p_code:input.code,p_version:input.version,p_enabled:input.enabled });
    return NextResponse.json({ success:true });
  } catch (error: unknown) { return failure(error); }
}
