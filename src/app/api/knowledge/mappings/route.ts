import { NextResponse } from "next/server";
import {
  createMapping,
  deleteMapping,
} from "@/server/knowledge";
import type { KnowledgeMapping } from "@/lib/types";

/** POST /api/knowledge/mappings —— 新增知识规则 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Omit<KnowledgeMapping, "no" | "custom">;
    const item = await createMapping(body);
    return NextResponse.json({ success: true, item });
  } catch (e) {
    return NextResponse.json(
      { error: "知识规则新增失败", message: (e as Error).message },
      { status: 500 }
    );
  }
}

/** DELETE /api/knowledge/mappings?id=xx */
export async function DELETE(req: Request) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ message: "无效的 id" }, { status: 400 });
    await deleteMapping(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: "知识规则删除失败", message: (e as Error).message },
      { status: 500 }
    );
  }
}
