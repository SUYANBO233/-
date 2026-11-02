import { getKnowledge } from '@/server/knowledge';
import { TopBar } from '@/components/overview/top-bar';
import { ExperienceTabs } from '@/components/knowledge/experience-tabs';

export const dynamic = 'force-dynamic';

export default async function KnowledgePage() {
  const data = await getKnowledge();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <TopBar />
      <main className="mx-auto max-w-[1600px] px-6 pb-16 pt-[76px]">
        <ExperienceTabs data={data} />
      </main>
    </div>
  );
}
