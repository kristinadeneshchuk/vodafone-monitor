'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart, 
  Bar, 
  Cell,
  XAxis,
  YAxis
} from 'recharts';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Newspaper, 
  Radio, 
  Clock, 
  Send, 
  MapPin, 
  UserX, 
  Share2, 
  ArrowRight,
  Calendar
} from 'lucide-react';
import { feedbackService } from '@/lib/data/feedback-service';
import { FeedbackRecord } from '@/lib/data/types';
import { format, subDays, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';

export default function TimelinePage() {
  const router = useRouter();

  // ----------------------------------------------------
  // STATE: 30 DAYS SLIDER (FULL TIMELINE)
  // ----------------------------------------------------
  const [allFeedbacks, setAllFeedbacks] = useState<FeedbackRecord[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [dayIndex, setDayIndex] = useState<number>(29); // 29 = Today
  const [isDayPlaying, setIsDayPlaying] = useState<boolean>(false);
  const dayPlayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch full dataset on mount
  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      const data = await feedbackService.getFeedbacks();
      setAllFeedbacks(data);
      setLoadingData(false);
    };
    loadData();
  }, []);

  // ----------------------------------------------------
  // GROUP FEEDBACKS BY 30 DAYS
  // ----------------------------------------------------
  const daysData = useMemo(() => {
    const now = new Date();
    // Build 30 days chronologically from 29 days ago to today
    const days = Array.from({ length: 30 }, (_, i) => {
      const date = subDays(now, 29 - i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const label = format(date, 'dd.MM');
      const fullLabel = format(date, 'd MMMM yyyy', { locale: uk });
      const daysAgo = 29 - i;

      // Filter records for this day
      const dayRecords = allFeedbacks.filter(f => f.timestamp.startsWith(dateStr));
      const count = dayRecords.length;
      const riskyRecords = dayRecords.filter(r => r.reputationalRiskScore > 0);
      const totalRisk = riskyRecords.reduce((sum, r) => sum + r.reputationalRiskScore, 0);
      const avgRisk = riskyRecords.length > 0 ? Math.round(totalRisk / riskyRecords.length) : 0;
      const highRiskCount = dayRecords.filter(r => r.reputationalRiskScore >= 50).length;
      const constructiveCount = dayRecords.filter(r => r.isConstructive).length;
      const constructivePercent = count > 0 ? Math.round((constructiveCount / count) * 100) : 0;

      const churnCount = dayRecords.filter(r => r.churnIntent).length;
      const churnPercent = count > 0 ? Math.round((churnCount / count) * 1000) / 10 : 0;
      const totalResonance = dayRecords.reduce((sum, r) => sum + (r.resonance ?? (r.relevanceScore * (r.reachWeight ?? 1))), 0);
      const avgResonance = (totalResonance / (count || 1)).toFixed(1);
      const baseline = 45; // базова середня норма
      const spikeRatio = Math.round((count / baseline) * 10) / 10;

      // Find top location
      const locCounts: Record<string, number> = {};
      dayRecords.forEach(r => {
        if (r.locationName !== 'Невідомо') {
          locCounts[r.locationName] = (locCounts[r.locationName] || 0) + 1;
        }
      });
      const topLoc = Object.entries(locCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Немає даних';

      return {
        index: i,
        date,
        dateStr,
        label,
        fullLabel,
        daysAgo,
        records: dayRecords,
        count,
        riskyCount: riskyRecords.length,
        avgRisk,
        highRiskCount,
        constructivePercent,
        topLocation: topLoc,
        churnCount,
        churnPercent,
        avgResonance,
        spikeRatio,
        isSpike: avgRisk >= 40 || highRiskCount >= 3 || count >= 80 || spikeRatio >= 2.0
      };
    });

    return days;
  }, [allFeedbacks]);

  const selectedDay = daysData[dayIndex] || daysData[daysData.length - 1];

  // Auto-play for 30 days slider
  useEffect(() => {
    if (isDayPlaying) {
      dayPlayIntervalRef.current = setInterval(() => {
        setDayIndex(prev => {
          if (prev >= 29) {
            setIsDayPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1500);
    } else {
      if (dayPlayIntervalRef.current) clearInterval(dayPlayIntervalRef.current);
    }
    return () => {
      if (dayPlayIntervalRef.current) clearInterval(dayPlayIntervalRef.current);
    };
  }, [isDayPlaying]);

  const handleDaySliderChange = (value: number | readonly number[]) => {
    if (Array.isArray(value)) setDayIndex(value[0]);
    else if (typeof value === 'number') setDayIndex(value);
  };

  const getSourceIcon = (source: string) => {
    switch(source) {
      case 'telegram': return <Send className="w-3 h-3 text-sky-500" />;
      case 'twitter': return <span className="font-bold text-[10px] text-blue-500">𝕏</span>;
      case 'news': return <Newspaper className="w-3 h-3 text-amber-600" />;
      default: return <Radio className="w-3 h-3 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-red-600" />
            Хронологічний аналіз (30 днів)
          </h1>
          <p className="text-sm text-slate-500">
            Досліджуйте динаміку репутаційних ризиків, сплески скарг та показники відтоку за допомогою часового повзунка
          </p>
        </div>
        {selectedDay && (
          <Button 
            size="sm" 
            className="bg-red-600 hover:bg-red-700 text-white font-medium gap-1.5 shadow-sm"
            onClick={() => router.push(`/dashboard/feed?date=${selectedDay.dateStr}`)}
          >
            Відкрити стрічку за {selectedDay.label} <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Main Slider Card */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-red-600" />
                  Повзунок часу (30 днів спостереження)
                </CardTitle>
                <Badge variant="outline" className="text-xs bg-slate-50">
                  Крок: 1 день
                </Badge>
              </div>
              <CardDescription>
                Пересувайте односторонній повзунок або запустіть симуляцію, щоб бачити стан за кожен день
              </CardDescription>
            </div>

            {/* Simulation controls */}
            <div className="flex items-center gap-2">
              <Button 
                variant={isDayPlaying ? "destructive" : "default"} 
                size="sm" 
                onClick={() => setIsDayPlaying(!isDayPlaying)}
                className="gap-2 font-medium"
              >
                {isDayPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isDayPlaying ? "Призупинити" : "Відтворити симуляцію"}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { setIsDayPlaying(false); setDayIndex(0); }}
                title="Скинути на початок (30 днів тому)"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {/* Single-ended Slider */}
          <div className="px-2 pt-2">
            <Slider 
              value={[dayIndex]} 
              min={0} 
              max={29} 
              step={1} 
              onValueChange={handleDaySliderChange}
              className="w-full"
            />
            
            <div className="flex justify-between text-xs text-slate-400 mt-2 font-medium">
              <span>30 днів тому ({daysData[0]?.label})</span>
              <span className="font-bold text-red-600">
                Обрано: {selectedDay?.fullLabel} ({selectedDay?.daysAgo === 0 ? 'Сьогодні' : `${selectedDay?.daysAgo} дн. тому`})
              </span>
              <span>Сьогодні ({daysData[29]?.label})</span>
            </div>
          </div>

          {/* Status Banner for Selected Day */}
          {selectedDay && (
            <div className={`p-4 rounded-xl border transition-all ${
              selectedDay.isSpike 
                ? 'bg-red-50 border-red-200' 
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-black text-slate-900 tracking-tight">
                      {selectedDay.fullLabel}
                    </span>
                    <Badge className={
                      selectedDay.isSpike 
                        ? 'bg-red-600 text-white font-bold' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    }>
                      {selectedDay.isSpike ? '🚨 Аномальний сплеск скарг' : '🟢 Штатний фоновий стан'}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    {selectedDay.isSpike 
                      ? `Цього дня зафіксовано високий рівень ризику (${selectedDay.avgRisk}/100) та підвищену концентрацію скарг на локації: ${selectedDay.topLocation}.`
                      : `Мережа працювала у звичному режимі. Основна маса звернень — побутові питання та планові роботи.`}
                  </p>
                </div>

                {/* Quick Jump Buttons */}
                <div className="flex flex-wrap gap-1.5 self-end md:self-center">
                  <Button 
                    size="sm" 
                    variant={dayIndex === 0 ? "secondary" : "outline"} 
                    className="text-xs h-7 px-2.5"
                    onClick={() => { setIsDayPlaying(false); setDayIndex(0); }}
                  >
                    30 дн. тому
                  </Button>
                  <Button 
                    size="sm" 
                    variant={dayIndex === 27 ? "secondary" : "outline"} 
                    className="text-xs h-7 px-2.5"
                    onClick={() => { setIsDayPlaying(false); setDayIndex(27); }}
                    title="17 вересня — день сплеску"
                  >
                    17 вер (Сплеск)
                  </Button>
                  <Button 
                    size="sm" 
                    variant={dayIndex === 28 ? "secondary" : "outline"} 
                    className="text-xs h-7 px-2.5"
                    onClick={() => { setIsDayPlaying(false); setDayIndex(28); }}
                  >
                    Вчора
                  </Button>
                  <Button 
                    size="sm" 
                    variant={dayIndex === 29 ? "secondary" : "outline"} 
                    className="text-xs h-7 px-2.5 font-bold"
                    onClick={() => { setIsDayPlaying(false); setDayIndex(29); }}
                  >
                    Сьогодні
                  </Button>
                  <Button 
                    size="sm" 
                    variant="default" 
                    className="text-xs h-7 px-3 font-semibold bg-red-600 hover:bg-red-700 text-white gap-1 shadow-sm ml-1"
                    onClick={() => router.push(`/dashboard/feed?date=${selectedDay?.dateStr}`)}
                  >
                    Перейти у стрічку ({selectedDay?.label}) <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key Day Metrics Grid */}
      {selectedDay && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="border-slate-200">
            <CardContent className="p-3.5">
              <div className="text-xs text-slate-500 font-medium mb-1">Скарг за день</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-slate-900">{selectedDay.count}</span>
                <span className={`text-[11px] font-semibold ${selectedDay.spikeRatio >= 2.0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {selectedDay.spikeRatio}x норми
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-3.5">
              <div className="text-xs text-slate-500 font-medium mb-1">Сер. ризик</div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-xl font-bold ${
                  selectedDay.avgRisk >= 50 
                    ? 'text-red-600' 
                    : selectedDay.avgRisk > 0 
                    ? 'text-amber-600' 
                    : 'text-slate-400'
                }`}>
                  {selectedDay.avgRisk}
                </span>
                <span className="text-xs text-slate-400">/ 100</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-rose-200 bg-rose-50/20">
            <CardContent className="p-3.5">
              <div className="text-xs text-rose-700 font-medium mb-1 flex items-center gap-1">
                <UserX className="w-3 h-3 text-rose-600" /> Відтік (Churn)
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-rose-700">
                  {selectedDay.churnPercent}%
                </span>
                <span className="text-xs text-rose-400">({selectedDay.churnCount})</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50/20">
            <CardContent className="p-3.5">
              <div className="text-xs text-blue-700 font-medium mb-1 flex items-center gap-1">
                <Share2 className="w-3 h-3 text-blue-600" /> Резонанс
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-blue-700">
                  {selectedDay.avgResonance}x
                </span>
                <span className="text-xs text-blue-400">вага</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-3.5">
              <div className="text-xs text-slate-500 font-medium mb-1">Конструктив</div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-emerald-600">
                  {selectedDay.constructivePercent}%
                </span>
                <span className="text-xs text-slate-400">з фактами</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-3.5">
              <div className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" /> Епіцентр дня
              </div>
              <div className="text-sm font-bold text-slate-800 truncate mt-1" title={selectedDay.topLocation}>
                {selectedDay.topLocation}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 30 Days Chart + Selected Day Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive 30 Days Bar Chart (2 cols) */}
        <Card className="lg:col-span-2 border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Динаміка скарг за всі 30 днів</span>
              <span className="text-xs font-normal text-slate-500">
                Підсвічено: {selectedDay?.label}
              </span>
            </CardTitle>
            <CardDescription>
              Клікніть на будь-який стовпчик графіка, щоб перемкнути повзунок на цей день
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={daysData}
                onClick={(e: any) => {
                  if (e) {
                    const idx = typeof e.activeTooltipIndex === 'number' 
                      ? e.activeTooltipIndex 
                      : e.activePayload?.[0]?.payload?.index;
                    if (typeof idx === 'number' && idx >= 0) {
                      setDayIndex(idx);
                    }
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{fontSize: 10, fill: '#64748b'}} interval={2} />
                <YAxis tick={{fontSize: 11, fill: '#64748b'}} />
                <Tooltip 
                  formatter={(val: any) => [val, 'Кількість скарг']}
                  labelFormatter={(label, payload) => {
                    const item = payload?.[0]?.payload;
                    return item ? `${item.fullLabel} (Ризик: ${item.avgRisk}/100)` : label;
                  }}
                  contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0'}}
                />
                <Bar 
                  dataKey="count" 
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(_entry: any, index: number) => {
                    if (typeof index === 'number' && index >= 0) {
                      setDayIndex(index);
                    }
                  }}
                >
                  {daysData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      onClick={(e: any) => {
                        e?.stopPropagation?.();
                        setDayIndex(index);
                      }}
                      onDoubleClick={() => router.push(`/dashboard/feed?date=${entry.dateStr}`)}
                      fill={
                        index === dayIndex 
                          ? '#dc2626' 
                          : entry.isSpike 
                          ? '#f87171' 
                          : '#cbd5e1'
                      } 
                      cursor="pointer"
                      className="cursor-pointer transition-all hover:opacity-80"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Live Feed for the Selected Day (1 col) */}
        <Card className="border-slate-200 flex flex-col h-[400px]">
          <CardHeader className="pb-3 border-b bg-slate-50/50">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-red-500" />
                Стрічка за {selectedDay?.label}
              </span>
              <Badge variant="outline" className="text-[10px] font-normal">
                {selectedDay?.records.length || 0} згадок
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {selectedDay && selectedDay.records.length > 0 ? (
              selectedDay.records.slice(0, 10).map((record) => (
                <div key={record.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs space-y-1.5 hover:bg-slate-100/70 transition-colors">
                  <div className="flex justify-between items-center text-slate-500">
                    <div className="flex items-center gap-1.5 font-medium text-slate-700">
                      {getSourceIcon(record.source)}
                      <span className="capitalize">{record.source}</span>
                    </div>
                    <span className="text-[10px] font-mono">
                      {format(parseISO(record.timestamp), 'HH:mm')}
                    </span>
                  </div>
                  <p className="text-slate-800 leading-relaxed font-normal">
                    {record.content}
                  </p>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200/50">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" /> {record.locationName}
                    </span>
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] py-0 px-1 font-semibold ${
                        record.reputationalRiskScore >= 50 
                          ? 'text-red-700 border-red-200 bg-red-50' 
                          : 'text-slate-600 border-slate-200 bg-white'
                      }`}
                    >
                      Ризик: {record.reputationalRiskScore}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">
                Немає повідомлень за цей день
              </div>
            )}
          </CardContent>
          <div className="p-3 border-t bg-slate-50/80 flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">
              {selectedDay?.records.length || 0} скарг за {selectedDay?.label}
            </span>
            <Button 
              size="sm" 
              className="text-xs h-7 px-2.5 bg-red-600 hover:bg-red-700 text-white gap-1 font-medium shadow-sm"
              onClick={() => router.push(`/dashboard/feed?date=${selectedDay?.dateStr}`)}
            >
              Відкрити у фіді <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
