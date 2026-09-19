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
  // STATE: 30 DAYS TIMELINE & RANGE SELECTION
  // ----------------------------------------------------
  const [allFeedbacks, setAllFeedbacks] = useState<FeedbackRecord[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  
  // Selection mode: 'single' (1 day) or 'range' (start to end)
  const [mode, setMode] = useState<'single' | 'range'>('range');
  const [dayIndex, setDayIndex] = useState<number>(29); // 29 = Today
  const [range, setRange] = useState<[number, number]>([23, 29]); // Default: last 7 days (index 23 to 29)
  
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
      const baseline = 45; // базова середня норма скарг на день
      const spikeRatio = Math.round((count / baseline) * 10) / 10;

      // Find top location for the day
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

  // Selected date bounds
  const isRange = mode === 'range' && range[0] !== range[1];
  const activeStartIndex = mode === 'single' ? dayIndex : Math.min(range[0], range[1]);
  const activeEndIndex = mode === 'single' ? dayIndex : Math.max(range[0], range[1]);

  const startDay = daysData[activeStartIndex] || daysData[0];
  const endDay = daysData[activeEndIndex] || daysData[daysData.length - 1];

  // Selected days slice
  const selectedDays = useMemo(() => {
    return daysData.slice(activeStartIndex, activeEndIndex + 1);
  }, [daysData, activeStartIndex, activeEndIndex]);

  // Combined records for the selected period
  const periodRecords = useMemo(() => {
    return selectedDays
      .flatMap(d => d.records)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [selectedDays]);

  // Aggregated Summary Metrics across the selected period
  const periodMetrics = useMemo(() => {
    const count = periodRecords.length;
    const daysCount = activeEndIndex - activeStartIndex + 1;
    const avgDaily = Math.round(count / (daysCount || 1));
    const baseline = 45;
    const spikeRatio = Math.round((avgDaily / baseline) * 10) / 10;

    const riskyRecords = periodRecords.filter(r => r.reputationalRiskScore > 0);
    const totalRisk = riskyRecords.reduce((sum, r) => sum + r.reputationalRiskScore, 0);
    const avgRisk = riskyRecords.length > 0 ? Math.round(totalRisk / riskyRecords.length) : 0;
    const highRiskCount = periodRecords.filter(r => r.reputationalRiskScore >= 50).length;

    const churnCount = periodRecords.filter(r => r.churnIntent).length;
    const churnPercent = count > 0 ? Math.round((churnCount / count) * 1000) / 10 : 0;

    const constructiveCount = periodRecords.filter(r => r.isConstructive).length;
    const constructivePercent = count > 0 ? Math.round((constructiveCount / count) * 100) : 0;

    const totalResonance = periodRecords.reduce(
      (sum, r) => sum + (r.resonance ?? (r.relevanceScore * (r.reachWeight ?? 1))),
      0
    );
    const avgResonance = (totalResonance / (count || 1)).toFixed(1);

    const isSpike = avgRisk >= 40 || highRiskCount >= (daysCount > 1 ? 5 : 3) || avgDaily >= 80 || spikeRatio >= 2.0;

    return {
      count,
      daysCount,
      avgDaily,
      spikeRatio,
      riskyCount: riskyRecords.length,
      avgRisk,
      highRiskCount,
      churnCount,
      churnPercent,
      constructivePercent,
      avgResonance,
      isSpike
    };
  }, [periodRecords, activeStartIndex, activeEndIndex]);

  // Aggregated top location for the period
  const periodTopLocation = useMemo(() => {
    const locCounts: Record<string, number> = {};
    let totalNamed = 0;
    periodRecords.forEach(r => {
      if (r.locationName && r.locationName !== 'Невідомо') {
        locCounts[r.locationName] = (locCounts[r.locationName] || 0) + 1;
        totalNamed++;
      }
    });
    const sorted = Object.entries(locCounts).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return { name: 'Немає даних', count: 0, percent: 0 };
    const [name, count] = sorted[0];
    const percent = totalNamed > 0 ? Math.round((count / totalNamed) * 100) : 0;
    return { name, count, percent };
  }, [periodRecords]);

  // Simulation play loop
  useEffect(() => {
    if (isDayPlaying) {
      dayPlayIntervalRef.current = setInterval(() => {
        if (mode === 'single') {
          setDayIndex(prev => {
            if (prev >= 29) {
              setIsDayPlaying(false);
              return prev;
            }
            const next = prev + 1;
            setRange([next, next]);
            return next;
          });
        } else {
          setRange(prev => {
            const windowSize = prev[1] - prev[0];
            if (prev[1] >= 29) {
              setIsDayPlaying(false);
              return prev;
            }
            return [prev[0] + 1, prev[1] + 1];
          });
        }
      }, 1200);
    } else {
      if (dayPlayIntervalRef.current) clearInterval(dayPlayIntervalRef.current);
    }
    return () => {
      if (dayPlayIntervalRef.current) clearInterval(dayPlayIntervalRef.current);
    };
  }, [isDayPlaying, mode]);

  const handleTogglePlay = () => {
    if (isDayPlaying) {
      setIsDayPlaying(false);
    } else {
      if (mode === 'single') {
        if (dayIndex >= 29) {
          setDayIndex(0);
          setRange([0, 0]);
        }
      } else {
        const windowSize = range[1] - range[0];
        if (range[1] >= 29) {
          setRange([0, Math.min(29, windowSize)]);
        }
      }
      setIsDayPlaying(true);
    }
  };

  const handleReset = () => {
    setIsDayPlaying(false);
    if (mode === 'single') {
      setDayIndex(0);
      setRange([0, 0]);
    } else {
      const windowSize = range[1] - range[0] || 6;
      setRange([0, windowSize]);
    }
  };

  const handleSliderChange = (value: number | readonly number[]) => {
    if (Array.isArray(value)) {
      if (mode === 'single') {
        const idx = value[0];
        setDayIndex(idx);
        setRange([idx, idx]);
      } else {
        if (value.length >= 2) {
          const start = Math.min(value[0], value[1]);
          const end = Math.max(value[0], value[1]);
          setRange([start, end]);
        } else if (value.length === 1) {
          setRange([value[0], value[0]]);
        }
      }
    } else if (typeof value === 'number') {
      setDayIndex(value);
      setRange([value, value]);
    }
  };

  // Target feed URL: single date or date range
  const targetFeedUrl = isRange
    ? `/dashboard/feed?startDate=${startDay?.dateStr}&endDate=${endDay?.dateStr}`
    : `/dashboard/feed?date=${startDay?.dateStr}`;

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
            Досліджуйте динаміку скарг, рівень ризику та відтоку за окремий день або за повний період від дня до дня
          </p>
        </div>
        {startDay && (
          <Button 
            size="sm" 
            className="bg-red-600 hover:bg-red-700 text-white font-medium gap-1.5 shadow-sm"
            onClick={() => router.push(targetFeedUrl)}
          >
            {isRange 
              ? `Відкрити стрічку (${startDay.label} – ${endDay.label})` 
              : `Відкрити стрічку за ${startDay.label}`
            } 
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Main Slider & Controls Card */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-red-600" />
                Часовий вибір (30 днів спостереження)
              </CardTitle>
              <CardDescription>
                Аналізуйте окрему дату або налаштуйте діапазон днів двостороннім повзунком чи кнопками пресетів
              </CardDescription>
            </div>

            {/* Mode & Preset Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Mode Toggle */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setMode('single');
                    setDayIndex(activeEndIndex);
                    setRange([activeEndIndex, activeEndIndex]);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    mode === 'single'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Один день
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('range');
                    if (range[0] === range[1]) {
                      const start = Math.max(0, range[1] - 6);
                      setRange([start, range[1]]);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    mode === 'range'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Період (діапазон)
                </button>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-2.5 font-medium cursor-pointer"
                  onClick={() => {
                    setMode('single');
                    setDayIndex(28);
                    setRange([28, 28]);
                  }}
                >
                  Вчора
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-2.5 font-medium cursor-pointer"
                  onClick={() => {
                    setMode('single');
                    setDayIndex(29);
                    setRange([29, 29]);
                  }}
                >
                  Сьогодні
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-2.5 font-medium cursor-pointer"
                  onClick={() => {
                    setMode('range');
                    setRange([23, 29]);
                  }}
                >
                  7 днів
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-2.5 font-medium cursor-pointer"
                  onClick={() => {
                    setMode('range');
                    setRange([16, 29]);
                  }}
                >
                  14 днів
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-2.5 font-medium cursor-pointer"
                  onClick={() => {
                    setMode('range');
                    setRange([0, 29]);
                  }}
                >
                  30 днів
                </Button>
              </div>

              {/* Simulation controls */}
              <div className="flex items-center gap-1.5 border-l pl-3 border-slate-200">
                <Button 
                  variant={isDayPlaying ? "destructive" : "default"} 
                  size="sm" 
                  onClick={handleTogglePlay}
                  className="gap-1.5 font-medium h-8 text-xs cursor-pointer"
                >
                  {isDayPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isDayPlaying ? "Призупинити" : "Відтворити"}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleReset}
                  className="h-8 px-2 cursor-pointer"
                  title="Скинути на початок (30 днів тому)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {/* Slider with dynamic 1 or 2 thumbs */}
          <div className="px-2 pt-2">
            <Slider 
              value={mode === 'single' ? [dayIndex] : [range[0], range[1]]} 
              min={0} 
              max={29} 
              step={1} 
              onValueChange={handleSliderChange}
              className="w-full cursor-pointer"
            />
            
            <div className="flex justify-between text-xs text-slate-400 mt-2 font-medium">
              <span>30 днів тому ({daysData[0]?.label})</span>
              <span className="font-bold text-red-600">
                {!isRange ? (
                  <>Обрано день: {startDay?.fullLabel} ({startDay?.daysAgo === 0 ? 'Сьогодні' : startDay?.daysAgo === 1 ? 'Вчора' : `${startDay?.daysAgo} дн. тому`})</>
                ) : (
                  <>Обрано період: {startDay?.label} – {endDay?.label} ({periodMetrics.daysCount} дн.)</>
                )}
              </span>
              <span>Сьогодні ({daysData[29]?.label})</span>
            </div>
          </div>

          {/* Status Banner for Selected Day or Range */}
          {startDay && endDay && (
            <div className={`p-4 rounded-xl border transition-all ${
              periodMetrics.isSpike 
                ? 'bg-red-50/70 border-red-200' 
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      {isRange 
                        ? `${startDay.fullLabel} — ${endDay.fullLabel}` 
                        : startDay.fullLabel
                      }
                    </span>
                    <Badge className={
                      periodMetrics.isSpike 
                        ? 'bg-red-600 text-white font-bold' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    }>
                      {periodMetrics.isSpike 
                        ? (isRange ? 'Період підвищеної напруги' : 'Аномальний сплеск скарг')
                        : (isRange ? 'Штатний період' : 'Штатний фоновий стан')
                      }
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    {isRange ? (
                      periodMetrics.isSpike 
                        ? `За обрані ${periodMetrics.daysCount} дн. зафіксовано ${periodMetrics.count} звернень (в середньому ${periodMetrics.avgDaily}/день, ${periodMetrics.spikeRatio}x від норми). Зафіксовано ${periodMetrics.highRiskCount} скарг з критичним ризиком (≥50). Топ-локація: ${periodTopLocation.name}.`
                        : `За обрані ${periodMetrics.daysCount} дн. мережа працювала штатно: ${periodMetrics.count} звернень (в середньому ${periodMetrics.avgDaily}/день), середній ризик ${periodMetrics.avgRisk}/100.`
                    ) : (
                      startDay.isSpike 
                        ? `Цього дня зафіксовано високий рівень ризику (${startDay.avgRisk}/100) та підвищену концентрацію скарг на локації: ${startDay.topLocation}.`
                        : `Мережа працювала у звичному режимі. Основна маса звернень — побутові питання та планові роботи.`
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  <Button 
                    size="sm" 
                    variant="default" 
                    className="text-xs h-8 px-3.5 font-semibold bg-red-600 hover:bg-red-700 text-white gap-1.5 shadow-sm"
                    onClick={() => router.push(targetFeedUrl)}
                  >
                    {isRange ? (
                      <>Перейти у стрічку ({startDay.label} – {endDay.label}) <ArrowRight className="w-3.5 h-3.5" /></>
                    ) : (
                      <>Перейти у стрічку ({startDay.label}) <ArrowRight className="w-3.5 h-3.5" /></>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary KPI Metrics Grid (Grey by default, Red when critical) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-slate-200">
          <CardContent className="p-3.5">
            <div className="text-xs text-slate-500 font-medium mb-1">
              {isRange ? 'Скарг за період' : 'Скарг за день'}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-slate-900">{periodMetrics.count}</span>
              <span className={`text-[11px] font-semibold ${periodMetrics.spikeRatio >= 2.0 ? 'text-red-600' : 'text-slate-400'}`}>
                {isRange ? `~${periodMetrics.avgDaily}/дн (${periodMetrics.spikeRatio}x)` : `${periodMetrics.spikeRatio}x норми`}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-3.5">
            <div className="text-xs text-slate-500 font-medium mb-1">
              {isRange ? 'Сер. ризик періоду' : 'Сер. ризик'}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xl font-bold ${
                periodMetrics.avgRisk >= 50 
                  ? 'text-red-600' 
                  : 'text-slate-600'
              }`}>
                {periodMetrics.avgRisk}
              </span>
              <span className="text-xs text-slate-400">/ 100</span>
              {periodMetrics.highRiskCount > 0 && (
                <span className={`text-[10px] ml-auto font-medium ${periodMetrics.highRiskCount >= (isRange ? 10 : 3) ? 'text-red-600' : 'text-slate-400'}`}>
                  {periodMetrics.highRiskCount} крит.
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-3.5">
            <div className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1">
              <UserX className="w-3 h-3 text-slate-400" /> Відтік (Churn)
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-bold ${
                periodMetrics.churnPercent >= 15 ? 'text-red-600' : 'text-slate-600'
              }`}>
                {periodMetrics.churnPercent}%
              </span>
              <span className="text-xs text-slate-400">({periodMetrics.churnCount})</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-3.5">
            <div className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1">
              <Share2 className="w-3 h-3 text-slate-400" /> Резонанс
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-slate-600">
                {periodMetrics.avgResonance}x
              </span>
              <span className="text-xs text-slate-400">вага</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-3.5">
            <div className="text-xs text-slate-500 font-medium mb-1">Конструктив</div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-slate-600">
                {periodMetrics.constructivePercent}%
              </span>
              <span className="text-xs text-slate-400">з фактами</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-3.5">
            <div className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-slate-400" /> {isRange ? 'Топ-локація' : 'Епіцентр дня'}
            </div>
            <div className="text-sm font-bold text-slate-800 truncate mt-1" title={periodTopLocation.name}>
              {periodTopLocation.name}
            </div>
            {periodTopLocation.count > 0 && (
              <div className="text-[10px] text-slate-400">
                {periodTopLocation.count} скарг ({periodTopLocation.percent}%)
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 30 Days Chart + Selected Period Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive 30 Days Bar Chart (2 cols) */}
        <Card className="lg:col-span-2 border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Динаміка скарг за всі 30 днів</span>
              <span className="text-xs font-normal text-slate-500">
                {isRange 
                  ? `Обрано діапазон: ${startDay?.label} – ${endDay?.label} (${periodMetrics.daysCount} дн.)`
                  : `Підсвічено: ${startDay?.label}`
                }
              </span>
            </CardTitle>
            <CardDescription>
              {mode === 'single' 
                ? 'Клікніть на будь-який стовпчик графіка, щоб перемкнути вибір на цей день'
                : 'Клікніть на стовпчик, щоб встановити початок або кінець обраного періоду'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={daysData}
                onClick={(e: any) => {
                  if (e) {
                    const idx = typeof e.activeTooltipIndex === 'number' 
                      ? e.activeTooltipIndex 
                      : e.activePayload?.[0]?.payload?.index;
                    if (typeof idx === 'number' && idx >= 0) {
                      if (mode === 'single') {
                        setDayIndex(idx);
                        setRange([idx, idx]);
                      } else {
                        setRange(prev => {
                          if (idx < prev[0]) return [idx, prev[1]];
                          if (idx > prev[1]) return [prev[0], idx];
                          const distStart = Math.abs(idx - prev[0]);
                          const distEnd = Math.abs(idx - prev[1]);
                          return distStart <= distEnd ? [idx, prev[1]] : [prev[0], idx];
                        });
                      }
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
                >
                  {daysData.map((entry, index) => {
                    const isSelected = index >= activeStartIndex && index <= activeEndIndex;
                    const isBoundary = index === activeStartIndex || index === activeEndIndex;
                    
                    let fillColor = '#cbd5e1'; // unselected background
                    if (isSelected) {
                      fillColor = entry.isSpike ? '#dc2626' : '#e11d48';
                    } else if (entry.isSpike) {
                      fillColor = '#fca5a5';
                    }

                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        onClick={(e: any) => {
                          e?.stopPropagation?.();
                          if (mode === 'single') {
                            setDayIndex(index);
                            setRange([index, index]);
                          } else {
                            setRange(prev => {
                              if (index < prev[0]) return [index, prev[1]];
                              if (index > prev[1]) return [prev[0], index];
                              const distStart = Math.abs(index - prev[0]);
                              const distEnd = Math.abs(index - prev[1]);
                              return distStart <= distEnd ? [index, prev[1]] : [prev[0], index];
                            });
                          }
                        }}
                        onDoubleClick={() => router.push(`/dashboard/feed?date=${entry.dateStr}`)}
                        fill={fillColor}
                        stroke={isBoundary && isSelected ? '#991b1b' : undefined}
                        strokeWidth={isBoundary && isSelected ? 1.5 : 0}
                        cursor="pointer"
                        className="cursor-pointer transition-all hover:opacity-80"
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Selected Period Feed Preview (1 col) */}
        <Card className="border-slate-200 flex flex-col h-[420px]">
          <CardHeader className="pb-3 border-b bg-slate-50/50">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-red-500" />
                {isRange ? `Стрічка (${startDay?.label} – ${endDay?.label})` : `Стрічка за ${startDay?.label}`}
              </span>
              <Badge variant="outline" className="text-[10px] font-normal">
                {periodRecords.length} згадок
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {periodRecords.length > 0 ? (
              periodRecords.slice(0, 10).map((record) => (
                <div key={record.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs space-y-1.5 hover:bg-slate-100/70 transition-colors">
                  <div className="flex justify-between items-center text-slate-500">
                    <div className="flex items-center gap-1.5 font-medium text-slate-700">
                      {getSourceIcon(record.source)}
                      <span className="capitalize">{record.source}</span>
                    </div>
                    <span className="text-[10px] font-mono">
                      {format(parseISO(record.timestamp), 'dd.MM HH:mm')}
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
                Немає повідомлень за обраний період
              </div>
            )}
          </CardContent>
          <div className="p-3 border-t bg-slate-50/80 flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">
              {periodRecords.length} скарг {isRange ? `за ${periodMetrics.daysCount} дн.` : `за ${startDay?.label}`}
            </span>
            <Button 
              size="sm" 
              className="text-xs h-7 px-2.5 bg-red-600 hover:bg-red-700 text-white gap-1 font-medium shadow-sm cursor-pointer"
              onClick={() => router.push(targetFeedUrl)}
            >
              Відкрити у фіді <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
