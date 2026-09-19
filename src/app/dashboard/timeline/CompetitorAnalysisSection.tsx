'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FeedbackRecord } from '@/lib/data/types';
import { Scale } from 'lucide-react';

export interface MarketNewsItem {
  content: string;
  timestamp: string;
  source: string;
  url?: string;
  cause?: string;
  sentiment?: string;
}

interface CompetitorAnalysisSectionProps {
  startDateStr: string;
  endDateStr: string;
  fullDateLabel: string;
  dateLabel: string;
  isRange: boolean;
  daysCount: number;
  allMarketRecords: FeedbackRecord[];
  marketNews: MarketNewsItem[];
}

const BRANDS = [
  { key: 'vodafone', name: 'Vodafone', dot: 'bg-red-500', bar: 'bg-red-500', head: 'border-t-red-500' },
  { key: 'kyivstar', name: 'Київстар', dot: 'bg-sky-500', bar: 'bg-sky-500', head: 'border-t-sky-500' },
  { key: 'lifecell', name: 'lifecell', dot: 'bg-amber-500', bar: 'bg-amber-500', head: 'border-t-amber-500' },
];

const CAUSE_UA: Record<string, string> = {
  internet: 'мобільний інтернет',
  coverage: 'покриття і сигнал',
  calls: 'дзвінки',
  blackout: 'відключення світла',
  outage: 'масовий збій',
  other: 'інше',
};

/**
 * Порівняння операторів — ОДИН блок замість шести.
 *
 * Чому за весь період, а не за обраний. Скарг про звʼязок приблизно
 * дві на добу на всіх трьох операторів разом. На вибраному дні в
 * шести блоках стояли нулі, "0% ринку" у двох операторів і висновок
 * "Vodafone та Київстар продемонстрували паритетний рівень скарг
 * (0 кожний)". Порівняння брендів має сенс на горизонті, де числа
 * не є шумом, тому тут увесь рік спостереження.
 *
 * Головна цифра — не кількість скарг, а ЧАСТКА негативу. Абсолютні
 * числа міряють розмір абонентської бази й нашу увагу до джерел,
 * а частка відповідає на питання "у кого звʼязок гірший".
 */
export default function CompetitorAnalysisSection({
  allMarketRecords,
}: CompetitorAnalysisSectionProps) {
  const stats = useMemo(() => {
    const own = allMarketRecords.filter(r => !r.isMarketWide);
    const rows = BRANDS.map(b => {
      const recs = own.filter(r => r.brand === b.key);
      const complaints = recs.filter(r => r.sentiment === 'negative');
      const praise = recs.filter(r => r.sentiment === 'positive');
      const causes: Record<string, number> = {};
      complaints.forEach(r => {
        const c = r.cause ?? 'other';
        causes[c] = (causes[c] ?? 0) + 1;
      });
      const topCause = Object.entries(causes).sort((a, b2) => b2[1] - a[1])[0];
      return {
        ...b,
        mentions: recs.length,
        complaints: complaints.length,
        praise: praise.length,
        negativeShare: recs.length
          ? Math.round((100 * complaints.length) / recs.length) : 0,
        topCause: topCause ? CAUSE_UA[topCause[0]] ?? topCause[0] : '—',
        topCauseCount: topCause ? topCause[1] : 0,
      };
    });
    const totalMentions = rows.reduce((a, r) => a + r.mentions, 0);
    return rows.map(r => ({
      ...r,
      voiceShare: totalMentions ? Math.round((100 * r.mentions) / totalMentions) : 0,
    }));
  }, [allMarketRecords]);

  const best = stats.reduce((a, b) => (a.negativeShare <= b.negativeShare ? a : b));
  const worst = stats.reduce((a, b) => (a.negativeShare >= b.negativeShare ? a : b));
  const vf = stats.find(s => s.key === 'vodafone');

  if (!allMarketRecords.length) return null;

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="w-4 h-4 text-slate-500" />
          Порівняння операторів
          <Badge variant="outline" className="text-[10px] font-normal text-slate-500">
            весь період спостереження
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          Не за обраний день: скарг про звʼязок близько двох на добу на всіх
          трьох операторів разом, і на одному дні порівняння міряє шум.
          Головна цифра — частка негативу, бо абсолютні числа залежать від
          розміру абонентської бази, а не від якості звʼязку.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {stats.map(s => (
          <div key={s.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
                <span className="font-semibold text-slate-800">{s.name}</span>
                <span className="text-xs text-slate-400 truncate">
                  {s.complaints} скарг / {s.praise} похвал
                </span>
              </div>
              <span className="font-bold tabular-nums text-slate-900 shrink-0">
                {s.negativeShare}%
              </span>
            </div>
            <div className="h-2.5 w-full rounded bg-slate-100 overflow-hidden">
              <div className={`h-full ${s.bar}`} style={{ width: `${s.negativeShare}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>головна причина: {s.topCause} ({s.topCauseCount})</span>
              <span>{s.voiceShare}% усіх згадок про звʼязок</span>
            </div>
          </div>
        ))}

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">
          <b>Що це означає.</b>{' '}
          {vf && (
            <>
              У Vodafone {vf.negativeShare}% згадок про звʼязок — негативні,
              у {worst.name} — {worst.negativeShare}%, у {best.name} — {best.negativeShare}%.
              {vf.key !== worst.key && (
                <> Тобто звʼязком Vodafone незадоволені рідше, ніж у {worst.name},
                  і це аргумент для маркетингу, а не лише для інженерів.</>
              )}
            </>
          )}
          {' '}Порівнювати абсолютні числа не можна: у Київстару більша база,
          тому більше і скарг, і згадок.
        </div>
      </CardContent>
    </Card>
  );
}
