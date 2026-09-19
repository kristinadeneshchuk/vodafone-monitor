'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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

  const withoutLocation = records.filter(
    r => r.sentiment === 'negative' && r.lat == null).length;
  const totalNegative = records.filter(r => r.sentiment === 'negative').length;
  const sharePct = totalNegative
    ? Math.round((100 * (totalNegative - withoutLocation)) / totalNegative) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={brand} onValueChange={(v) => setBrand(v ?? 'all')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Оператор" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Усі оператори</SelectItem>
            <SelectItem value="vodafone">Vodafone</SelectItem>
            <SelectItem value="kyivstar">Київстар</SelectItem>
            <SelectItem value="lifecell">lifecell</SelectItem>
          </SelectContent>
        </Select>

        <Select value={problem} onValueChange={(v) => setProblem(v ?? 'all')}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Тип проблеми" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Усі типи</SelectItem>
            <SelectItem value="no_signal">Немає сигналу</SelectItem>
            <SelectItem value="slow_internet">Повільний інтернет</SelectItem>
            <SelectItem value="dropped_calls">Обриви дзвінків</SelectItem>
            <SelectItem value="other">Інше</SelectItem>
          </SelectContent>
        </Select>

        <Badge variant="outline">
          Локацій на карті: {points.length}
        </Badge>
        <Badge variant="outline">
          Локація визначена у {sharePct}% скарг
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-0 h-[560px]">
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
