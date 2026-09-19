'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';
import { feedbackService } from '@/lib/data/feedback-service';
import { FeedbackRecord } from '@/lib/data/types';
import type { MapPoint } from './MapView';

// Leaflet звертається до window, тому рендеримо тільки на клієнті.
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center text-slate-400">
      Завантаження карти...
    </div>
  ),
});

const CAUSE_UA: Record<string, string> = {
  internet: 'мобільний інтернет', coverage: 'покриття і сигнал',
  calls: 'дзвінки', blackout: 'відключення світла', outage: 'масовий збій',
  billing: 'списання коштів', tariffs: 'тарифи', app: 'застосунок',
  support: 'підтримка', roaming: 'роумінг', esim: 'eSIM',
  number: 'номер', other: 'інше',
};

const OPERATOR_LABELS: Record<string, string> = {
  all: 'Усі оператори',
  vodafone: 'Vodafone',
  kyivstar: 'Київстар',
  lifecell: 'lifecell',
};

const MAP_PROBLEM_LABELS: Record<string, string> = {
  all: 'Усі типи',
  no_signal: 'Немає сигналу',
  slow_internet: 'Повільний інтернет',
  dropped_calls: 'Обриви дзвінків',
  other: 'Інше',
};

export default function MapPage() {
  const [records, setRecords] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState('vodafone');
  const [problem, setProblem] = useState('all');

  useEffect(() => {
    feedbackService.getFeedbacks().then(data => {
      setRecords(data);
      setLoading(false);
    });
  }, []);

  const points: MapPoint[] = useMemo(() => {
    const groups = new Map<string, {
      name: string; lat: number; lng: number;
      risks: number[]; causes: string[]; samples: string[];
    }>();

    for (const r of records) {
      // Показуємо лише те, де локація справді визначена. Згадки без
      // координат на карту не потрапляють — вигадувати точку не можна.
      if (r.lat == null || r.lng == null) continue;
      if (r.sentiment !== 'negative') continue;
      if (brand !== 'all' && r.brand !== brand) continue;
      if (problem !== 'all' && r.problemType !== problem) continue;

      const key = r.locationName;
      if (!groups.has(key)) {
        groups.set(key, {
          name: key, lat: r.lat, lng: r.lng,
          risks: [], causes: [], samples: [],
        });
      }
      const g = groups.get(key)!;
      g.risks.push(r.reputationalRiskScore);
      if (r.cause) g.causes.push(r.cause);
      if (g.samples.length < 3) {
        g.samples.push(r.content.replace(/\s+/g, ' ').slice(0, 110));
      }
    }

    return [...groups.entries()].map(([key, g]) => {
      const counts = g.causes.reduce<Record<string, number>>((acc, c) => {
        acc[c] = (acc[c] ?? 0) + 1;
        return acc;
      }, {});
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
      return {
        key,
        name: g.name,
        lat: g.lat,
        lng: g.lng,
        count: g.risks.length,
        avgRisk: Math.round(g.risks.reduce((a, b) => a + b, 0) / g.risks.length),
        topCause: CAUSE_UA[top] ?? top,
        samples: g.samples,
      };
    }).sort((a, b) => b.count - a.count);
  }, [records, brand, problem]);

  // Відсоток має рахуватись по ТОМУ Ж зрізу, що показує карта.
  // Раніше він брався по всіх брендах, а карта фільтрувала один —
  // виходило 7% при фактичних 3%.
  const inScope = records.filter(r =>
    r.sentiment === 'negative'
    && (brand === 'all' || r.brand === brand)
    && (problem === 'all' || r.problemType === problem));
  const totalNegative = inScope.length;
  const withoutLocation = inScope.filter(r => r.lat == null).length;
  const sharePct = totalNegative
    ? Math.round((100 * (totalNegative - withoutLocation)) / totalNegative) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <MapPin className="w-6 h-6 text-red-600" />
            Географія проблем
          </h1>
          <p className="text-sm text-slate-500">
            Аналіз локалізації скарг абонентів та територіального розподілу репутаційних ризиків
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="relative z-30 flex flex-wrap gap-4 items-center p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Оператор:</span>
          <Select value={brand} onValueChange={(v) => setBrand(v ?? 'all')}>
            <SelectTrigger className="w-[170px] h-9 bg-slate-50 border-slate-200 text-xs">
              <SelectValue placeholder="Оператор" labelMap={OPERATOR_LABELS} />
            </SelectTrigger>
            <SelectContent className="z-[9999]">
              <SelectItem value="all">Усі оператори</SelectItem>
              <SelectItem value="vodafone">Vodafone</SelectItem>
              <SelectItem value="kyivstar">Київстар</SelectItem>
              <SelectItem value="lifecell">lifecell</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Проблема:</span>
          <Select value={problem} onValueChange={(v) => setProblem(v ?? 'all')}>
            <SelectTrigger className="w-[190px] h-9 bg-slate-50 border-slate-200 text-xs">
              <SelectValue placeholder="Тип проблеми" labelMap={MAP_PROBLEM_LABELS} />
            </SelectTrigger>
            <SelectContent className="z-[9999]">
              <SelectItem value="all">Усі типи</SelectItem>
              <SelectItem value="no_signal">Немає сигналу</SelectItem>
              <SelectItem value="slow_internet">Повільний інтернет</SelectItem>
              <SelectItem value="dropped_calls">Обриви дзвінків</SelectItem>
              <SelectItem value="other">Інше</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <Badge variant="outline" className="text-xs py-1 px-2.5 bg-slate-50 border-slate-200 font-medium text-slate-600">
            Локацій на карті: <b className="ml-1 text-slate-900 font-bold">{points.length}</b>
          </Badge>
          <Badge variant="outline" className="text-xs py-1 px-2.5 bg-slate-50 border-slate-200 font-medium text-slate-600">
            Гео-визначення: <b className="ml-1 text-slate-900 font-bold">{sharePct}% скарг</b>
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="overflow-hidden relative z-0 border-slate-200 shadow-sm">
          <CardContent className="p-0 h-[560px] relative z-0">
            {loading
              ? <div className="h-full flex items-center justify-center text-slate-400">
                  Завантаження даних...
                </div>
              : <MapView points={points} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Найпроблемніші локації</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
            {points.slice(0, 20).map((p, i) => (
              <div key={p.key} className="flex items-start justify-between gap-2 text-sm border-b pb-2">
                <div>
                  <div className="font-medium">{i + 1}. {p.name}</div>
                  <div className="text-slate-500 text-xs">{p.topCause}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{p.count}</div>
                  <div className="text-xs text-slate-500">ризик {p.avgRisk}</div>
                </div>
              </div>
            ))}
            {points.length === 0 && !loading && (
              <div className="text-slate-400 text-sm">
                Для цих фільтрів скарг із визначеною локацією немає.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-slate-500">
        На карті лише скарги, де локація названа в тексті. Решта не показується:
        вигадана точка створила б хибний кластер. Розмір кола — кількість скарг,
        колір — середній репутаційний ризик.
      </p>
    </div>
  );
}
