import { NextResponse } from 'next/server';
import { saveDecisionSchema } from '@/lib/validation/decision';
import { DecisionSaveError, saveDecision } from '@/server/decision';

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = saveDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: '决策数据格式错误', issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await saveDecision(parsed.data);
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof DecisionSaveError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error('保存方案失败', error);
    return NextResponse.json({ message: '方案保存失败，请稍后重试' }, { status: 500 });
  }
}
