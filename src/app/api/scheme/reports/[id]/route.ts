import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSchemeReport } from '@/server/scheme';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ message: '无效的报告编号' }, { status: 400 });
  try {
    const report = await getSchemeReport(id);
    if (!report) return NextResponse.json({ message: '报告不存在' }, { status: 404 });
    return NextResponse.json(report);
  } catch (error: unknown) {
    console.error('读取报告失败', error);
    return NextResponse.json({ message: '报告读取失败，请检查数据库配置' }, { status: 503 });
  }
}
