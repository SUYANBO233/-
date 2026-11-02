import { listSchemeHistory } from '@/server/scheme';
import { TopBar } from '@/components/overview/top-bar';
import { HistoryLedger } from '@/components/scheme/history-ledger';

export const dynamic = 'force-dynamic';

export default async function SchemePage() {
  const data = await listSchemeHistory();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <TopBar />
      <main className="mx-auto max-w-[1600px] px-6 pb-16 pt-[76px]">
        {/* 页面头部 */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-[21px] font-bold tracking-wide">
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg"
                style={{ background: 'rgba(90,162,248,.14)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5aa2f8" strokeWidth="2" aria-hidden>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <path d="M8 13h8M8 17h5" />
                </svg>
              </span>
              {data.title}
            </h1>
          </div>
        </div>

        <HistoryLedger
          title={data.title}
          subtitle={data.subtitle}
          faces={data.faces}
          records={data.records}
        />
      </main>
    </div>
  );
}
