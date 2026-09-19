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
  { key: 'vodafone', name: 'Vodafone', dot: 'bg-red-500' },
  { key: 'kyivstar', name: 'Київстар', dot: 'bg-sky-500' },
  { key: 'lifecell', name: 'lifecell', dot: 'bg-amber-500' },
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

  if (!allMarketRecords.length) return null;

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="w-4 h-4 text-slate-500" />
          Ринковий контекст: якість зв’язку
          <Badge variant="outline" className="text-[10px] font-normal text-slate-500">
            весь період спостереження
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          Порівняння за весь доступний період, а не за обраний день: на малих
          денних вибірках висновки були б шумом. Це індикатор репутаційного
          навантаження у відкритих джерелах, а не вимір якості мережі чи абонентської бази.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Оператор</th>
                <th className="px-4 py-2.5 text-right font-semibold">Згадки про зв’язок</th>
                <th className="px-4 py-2.5 text-right font-semibold">Негативні</th>
                <th className="px-4 py-2.5 text-right font-semibold">Частка негативу</th>
                <th className="px-4 py-2.5 text-left font-semibold">Головна причина</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.key} className={s.key === 'vodafone' ? 'bg-red-50/40' : 'border-t border-slate-100'}>
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    <span className="inline-flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                      {s.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{s.mentions}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                    {s.complaints}<span className="text-slate-400"> / {s.praise} похвал</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{s.negativeShare}%</td>
                  <td className="px-4 py-3 text-slate-600">{s.topCause} <span className="text-slate-400">({s.topCauseCount})</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500">
          Методика: частка негативу = негативні згадки ÷ усі згадки про зв’язок у вибірці. Абсолютні числа не порівнюємо як якість мережі: вони залежать від розміру аудиторії та покриття джерел.
        </p>
      </CardContent>
    </Card>
  );
}
