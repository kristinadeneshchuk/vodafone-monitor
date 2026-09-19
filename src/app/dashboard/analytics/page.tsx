'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import blackout from '@/lib/data/real-blackout.json';
import summary from '@/lib/data/real-summary.json';
import locations from '@/lib/data/real-locations.json';
import alertsData from '@/lib/data/real-alerts.json';
import { CrisisAlert } from '@/lib/data/types';

const MONTH_UA: Record<string, string> = {
  '01': 'січ', '02': 'лют', '03': 'бер', '04': 'кві', '05': 'тра', '06': 'чер',
  '07': 'лип', '08': 'сер', '09': 'вер', '10': 'жов', '11': 'лис', '12': 'гру',
};

const CAUSE_UA: Record<string, string> = {
  internet: 'мобільний інтернет', coverage: 'покриття і сигнал', calls: 'дзвінки',
  blackout: 'відключення світла', outage: 'масовий збій', billing: 'списання коштів',
  tariffs: 'тарифи', app: 'застосунок', support: 'підтримка', other: 'інше',
};

const PATTERN_UA: Record<string, { label: string; tone: string }> = {
  grid: { label: 'через енергетику', tone: 'text-amber-600' },
  chronic: { label: 'хронічний фон', tone: 'text-orange-600' },
  incident: { label: 'разова аварія', tone: 'text-red-600' },
  healthy: { label: 'працює добре', tone: 'text-emerald-600' },
  sporadic: { label: 'поодинокі', tone: 'text-slate-500' },
};

export default function AnalyticsPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const b = blackout as any;
  const s = summary as any;
  const locs = locations as any[];
  const alerts = alertsData as unknown as CrisisAlert[];

  const wake = alerts.filter(a => a.level === 'wake');
  const grid = alerts.filter(a => a.event_type === 'grid_outage');
  const media = alerts.filter(a => a.event_type === 'media_attention');

  const months = Object.entries(b.byMonth ?? {}) as [string, number][];
  const peak = Math.max(...months.map(([, n]) => n), 1);

  const negShare = s.coverageMentions
    ? Math.round((100 * s.coverageComplaints) / s.coverageMentions)
    : 0;

  if (!ready) return <div className="text-slate-400">Завантаження...</div>;

  return (
    <div className="space-y-6">
      {/* 1. Що ми взагалі вимірюємо */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Звʼязок: скарги проти похвал за рік</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Згадок про звʼязок" value={s.coverageMentions} />
            <Metric label="З них скарги" value={s.coverageComplaints} tone="text-red-600" />
            <Metric label="З них похвали" value={s.coveragePraise} tone="text-emerald-600" />
            <Metric label="Частка негативу" value={`${negShare}%`} />
          </div>
          <p className="text-xs text-slate-500 mt-4">
            Без знаменника цифра скарг нічого не означає. {s.coveragePraise} похвал
            показують, що проблема локальна, а не системна.
          </p>
        </CardContent>
      </Card>

      {/* 2. Головна знахідка: блекаути */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Звʼязок під час відключень світла
            <Badge variant="outline" className="ml-2">{b.winterShare}% припадає на листопад–лютий</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Metric label="Скарг за рік" value={b.total} />
            <Metric label="В опалювальний сезон" value={b.winterCount} tone="text-amber-600" />
            <Metric label="Медіана без звʼязку" value={`${b.medianHours} год`} />
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-2">Сезонність</div>
            <div className="flex items-end gap-1 h-24">
              {months.map(([m, n]) => (
                <div key={m} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-amber-400/70 rounded-t"
                    style={{ height: `${(n / peak) * 100}%` }}
                    title={`${n}`}
                  />
                  <span className="text-[10px] text-slate-400">{MONTH_UA[m.slice(5, 7)]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
            <b>Що це означає для бізнесу.</b> Це не аварія мережі: станції сідають
            на акумулятори, і абонент лишається без звʼязку. Рішення — резервне
            живлення, а не ремонт мережі. Медіана {b.medianHours} годин без звʼязку,
            порахована з відгуків абонентів, збігається із заявленою автономністю
            мережі Vodafone (4–6 годин на акумуляторах).
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-2">Куди ставити живлення насамперед</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(b.byLocation ?? {}).slice(0, 8).map(([name, n]) => (
                <Badge key={name} variant="outline">{name}: {n as number}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Локації за типом проблеми */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Де працює, а де ні</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {locs.slice(0, 10).map(l => {
              const p = PATTERN_UA[l.pattern] ?? PATTERN_UA.sporadic;
              return (
                <div key={l.name} className="flex items-center gap-3 text-sm border-b pb-2">
                  <div className="w-36 font-medium">{l.name}</div>
                  <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-red-500"
                      style={{ width: `${l.negativityShare}%` }}
                    />
                  </div>
                  <div className="w-16 text-right tabular-nums">{l.negativityShare}%</div>
                  <div className="w-28 text-xs text-slate-500">
                    {l.complaints} скарг / {l.praise} похвал
                  </div>
                  <div className={`w-32 text-xs ${p.tone}`}>{p.label}</div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Червона смуга — частка негативу. Тип проблеми визначає, хто має діяти:
            енергетика, планування мережі чи комунікації.
          </p>
        </CardContent>
      </Card>

      {/* 4. Детектор */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Детекція криз за рік</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Усього сигналів" value={alerts.length} />
            <Metric label="Будили команду" value={wake.length} tone="text-red-600" />
            <Metric label="Відсіяно як енергетику" value={grid.length} tone="text-amber-600" />
            <Metric label="Сплески уваги медіа" value={media.length} />
          </div>
          <p className="text-xs text-slate-500 mt-4">
            {wake.length} тривог за рік означає, що команду піднімають раз на
            {' '}{Math.round(12 / Math.max(wake.length, 1))} місяці. Ціна хибної
            тривоги — двоє людей уночі й година перевірки.
          </p>

          <div className="mt-4 space-y-2">
            {wake.slice(0, 5).map((a, i) => (
              <div key={i} className="text-sm border-l-2 border-red-400 pl-3">
                <div className="font-medium">
                  {a.window_start.slice(0, 10)} · {a.brand} · {CAUSE_UA[a.cause] ?? a.cause}
                  {' '}<span className="text-red-600">×{a.ratio}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {a.count} згадок проти норми {a.baseline}
                  {a.cities ? ` · ${a.cities}` : ''} · джерел: {a.n_source_types}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400">
        Усі цифри пораховані з {s.coverageMentions} згадок про звʼязок за рік
        з відкритих джерел: відгуки в магазинах застосунків, новини, публічні
        телеграм-канали. Персональні дані авторів не збираються.
      </p>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: any; tone?: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${tone ?? 'text-slate-800'}`}>{value ?? '—'}</div>
    </div>
  );
}
