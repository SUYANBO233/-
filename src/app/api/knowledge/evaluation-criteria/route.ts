import { NextResponse } from 'next/server';
import { z } from 'zod';
import { criterionSchema } from '@/lib/response';
import { CatalogStoreError,catalogRpc,readDecisionCatalog } from '@/server/catalog-store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function failure(error:unknown) {
  return NextResponse.json({ message:error instanceof z.ZodError ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；') : error instanceof CatalogStoreError ? error.message : '判据操作失败，请检查数据库迁移' },{ status:error instanceof z.ZodError ? 400:error instanceof CatalogStoreError ? error.status:503 });
}
export async function GET() {
  try { return NextResponse.json({ criteria:(await readDecisionCatalog()).criteria }); } catch(error:unknown) { return failure(error); }
}
export async function POST(request:Request) {
  try {
    const criterion=criterionSchema.parse(await request.json());
    await catalogRpc('publish_evaluation_criterion',{ p_definition:criterion });
    return NextResponse.json({ success:true });
  } catch(error:unknown) { return failure(error); }
}
export async function PATCH(request:Request) {
  try {
    const input=z.object({ code:z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),version:z.number().int().positive(),enabled:z.boolean() }).strict().parse(await request.json());
    await catalogRpc('set_evaluation_criterion_enabled',{ p_code:input.code,p_version:input.version,p_enabled:input.enabled });
    return NextResponse.json({ success:true });
  } catch(error:unknown) { return failure(error); }
}
