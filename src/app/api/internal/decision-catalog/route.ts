import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { CatalogStoreError, readDecisionCatalog } from '@/server/catalog-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const expected = process.env.DECISION_CATALOG_API_KEY;
  const received = request.headers.get('X-Catalog-Key') || '';
  if (!expected || Buffer.byteLength(expected) !== Buffer.byteLength(received) || !timingSafeEqual(Buffer.from(expected),Buffer.from(received))) {
    return NextResponse.json({ message:'内部资料接口认证失败' },{ status:401 });
  }
  try { return NextResponse.json(await readDecisionCatalog()); }
  catch (error: unknown) {
    return NextResponse.json({ message:error instanceof CatalogStoreError ? error.message : '决策资料格式不完整，请维护资料后重试' },{ status:error instanceof CatalogStoreError ? error.status : 503 });
  }
}
