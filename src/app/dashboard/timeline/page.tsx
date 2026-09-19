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
  ArrowRight, 
  Calendar,
  Layers,
  Smartphone
} from 'lucide-react';
import { feedbackService } from '@/lib/data/feedback-service';
import { FeedbackRecord } from '@/lib/data/types';
import { format, addDays, parseISO, differenceInCalendarDays } from 'date-fns';
import { uk } from 'date-fns/locale';
import CompetitorAnalysisSection from './CompetitorAnalysisSection';
import realMarketData from '@/lib/data/real-market.json';

type HorizonType = '30d' | '90d' | '180d' | 'all';

function cleanFeedText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_{1,2}(.*?)_{1,2}/g, '$1')
    .trim();
}

export default function TimelinePage() {
  const router = useRouter();

  // ----------------------------------------------------
  // STATE: DATA & TIMELINE RANGE
  // ----------------------------------------------------
  const [allFeedbacks, setAllFeedbacks] = useState<FeedbackRecord[]>([]);
  const [allMarketRecords, setAllMarketRecords] = useState<FeedbackRecord[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  
  // Horizon scope of the timeline view
  const [horizon, setHorizon] = useState<HorizonType>('30d');
  
  // Selection mode: 'single' (1 day) or 'range' (start to end)
  const [mode, setMode] = useState<'single' | 'range'>('range');
  const [dayIndex, setDayIndex] = useState<number>(0);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [initialized, setInitialized] = useState<boolean>(false);
  
  const [isDayPlaying, setIsDayPlaying] = useState<boolean>(false);
  const dayPlayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch full dataset on mount
  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      const [data, marketData] = await Promise.all([
        feedbackService.getFeedbacks(),
        feedbackService.getFeedbacks({ brand: 'all' })
      ]);
      setAllFeedbacks(data);
      setAllMarketRecords(marketData);
      setLoadingData(false);
    };
    loadData();
  }, []);

  // ----------------------------------------------------
  // BUILD CONTINUOUS ARRAY OF ALL HISTORICAL DAYS
  // ----------------------------------------------------
  const { allDays, dateToIndexMap, minDateStr, maxDateStr } = useMemo(() => {
    if (allFeedbacks.length === 0) {
      return { 
        allDays: [], 
        dateToIndexMap: new Map<string, number>(), 
        minDateStr: '2025-09-08', 
        maxDateStr: '2026-09-19' 
      };
    }
    
    let minD = '2025-09-08';
    let maxD = format(new Date(), 'yyyy-MM-dd');
    allFeedbacks.forEach(f => {
      const d = f.timestamp.slice(0, 10);
      if (d < minD) minD = d;
      if (d > maxD) maxD = d;
    });

    const startDate = parseISO(minD);
    const endDate = parseISO(maxD);
    const totalDays = differenceInCalendarDays(endDate, startDate) + 1;

    // Fast O(1) records grouping by date
    const recordsByDate = new Map<string, FeedbackRecord[]>();
    allFeedbacks.forEach(f => {
      const d = f.timestamp.slice(0, 10);
      const list = recordsByDate.get(d) || [];
      list.push(f);
      recordsByDate.set(d, list);
    });

    const map = new Map<string, number>();
    const days = Array.from({ length: totalDays }, (_, i) => {
      const date = addDays(startDate, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      map.set(dateStr, i);
      const label = format(date, 'dd.MM');
      const monthLabel = format(date, 'LLL yy', { locale: uk });
      const fullLabel = format(date, 'd MMMM yyyy', { locale: uk });
      const daysAgo = differenceInCalendarDays(endDate, date);

      const dayRecords = recordsByDate.get(dateStr) || [];
      const count = dayRecords.length;
      const riskyRecords = dayRecords.filter(r => r.reputationalRiskScore > 0);
      const totalRisk = riskyRecords.reduce((sum, r) => sum + r.reputationalRiskScore, 0);
      const avgRisk = riskyRecords.length > 0 ? Math.round(totalRisk / riskyRecords.length) : 0;
      const highRiskCount = dayRecords.filter(r => r.reputationalRiskScore >= 50).length;

      const churnCount = dayRecords.filter(r => r.churnIntent).length;
      const churnPercent = count > 0 ? Math.round((churnCount / count) * 1000) / 10 : 0;
      const totalResonance = dayRecords.reduce((sum, r) => sum + (r.resonance ?? (r.relevanceScore * (r.reachWeight ?? 1))), 0);
      const avgResonance = (totalResonance / (count || 1)).toFixed(1);
      const baseline = 45;
      const spikeRatio = Math.round((count / baseline) * 10) / 10;

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
        monthLabel,
        fullLabel,
        daysAgo,
        records: dayRecords,
        count,
        riskyCount: riskyRecords.length,
        avgRisk,
        highRiskCount,
        topLocation: topLoc,
        churnCount,
        churnPercent,
        avgResonance,
        spikeRatio,
        isSpike: avgRisk >= 40 || highRiskCount >= 3 || count >= 80 || spikeRatio >= 2.0
      };
    });

    return { allDays: days, dateToIndexMap: map, minDateStr: minD, maxDateStr: maxD };
  }, [allFeedbacks]);

  // Set default initial selection once data is ready
  useEffect(() => {
    if (allDays.length > 0 && !initialized) {
      const lastIndex = allDays.length - 1;
      const startIndex = Math.max(0, lastIndex - 29); // default last 30 days
      setHorizon('30d');
      setMode('range');
      setDayIndex(lastIndex);
      setRange([startIndex, lastIndex]);
      setInitialized(true);
    }
  }, [allDays, initialized]);

  // Compute horizon boundaries (indices in allDays)
  const totalLength = allDays.length;
  const { horizonStart, horizonEnd, visibleDays } = useMemo(() => {
    if (totalLength === 0) return { horizonStart: 0, horizonEnd: 0, visibleDays: [] };
    const end = totalLength - 1;
    let start = 0;
    if (horizon === '30d') {
      start = Math.max(0, end - 29);
    } else if (horizon === '90d') {
      start = Math.max(0, end - 89);
    } else if (horizon === '180d') {
      start = Math.max(0, end - 179);
    } else {
      start = 0; // 'all' (entire timespan)
    }
    return {
      horizonStart: start,
      horizonEnd: end,
      visibleDays: allDays.slice(start, end + 1)
    };
  }, [totalLength, horizon, allDays]);

  // Active selected indices
  const isRange = mode === 'range';
  const activeStartIndex = mode === 'single' ? dayIndex : Math.min(range[0], range[1]);
  const activeEndIndex = mode === 'single' ? dayIndex : Math.max(range[0], range[1]);

  const startDay = allDays[activeStartIndex] || allDays[0];
  const endDay = allDays[activeEndIndex] || allDays[allDays.length - 1];

  // Selected days slice
  const selectedDays = useMemo(() => {
    if (allDays.length === 0) return [];
    return allDays.slice(activeStartIndex, activeEndIndex + 1);
  }, [allDays, activeStartIndex, activeEndIndex]);

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
            if (prev >= horizonEnd) {
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
            if (prev[1] >= horizonEnd) {
              setIsDayPlaying(false);
              return prev;
            }
            return [prev[0] + 1, prev[1] + 1];
          });
        }
      }, 1000);
    } else {
      if (dayPlayIntervalRef.current) clearInterval(dayPlayIntervalRef.current);
    }
    return () => {
      if (dayPlayIntervalRef.current) clearInterval(dayPlayIntervalRef.current);
    };
  }, [isDayPlaying, mode, horizonEnd]);

  const handleTogglePlay = () => {
    if (isDayPlaying) {
      setIsDayPlaying(false);
    } else {
      if (mode === 'single') {
        if (dayIndex >= horizonEnd) {
          setDayIndex(horizonStart);
          setRange([horizonStart, horizonStart]);
        }
      } else {
        const windowSize = range[1] - range[0];
        if (range[1] >= horizonEnd) {
          setRange([horizonStart, Math.min(horizonEnd, horizonStart + windowSize)]);
        }
      }
      setIsDayPlaying(true);
    }
  };

  const handleReset = () => {
    setIsDayPlaying(false);
    if (mode === 'single') {
      setDayIndex(horizonStart);
      setRange([horizonStart, horizonStart]);
    } else {
      const windowSize = range[1] - range[0] || 6;
      setRange([horizonStart, Math.min(horizonEnd, horizonStart + windowSize)]);
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

  // Date input handlers (with automatic horizon expansion)
  const handleStartDateChange = (newDateStr: string) => {
    if (!newDateStr) return;
    let idx = dateToIndexMap.get(newDateStr);
    if (idx === undefined) {
      const targetDate = parseISO(newDateStr);
      const startDate = parseISO(minDateStr);
      idx = Math.max(0, Math.min(totalLength - 1, differenceInCalendarDays(targetDate, startDate)));
    }
    if (idx !== undefined) {
      if (mode === 'single') {
        setDayIndex(idx);
        setRange([idx, idx]);
        if (idx < horizonStart || idx > horizonEnd) {
          setHorizon('all');
        }
      } else {
        const currentEnd = Math.max(range[0], range[1]);
        const newEnd = Math.max(idx, currentEnd);
        setRange([idx, newEnd]);
        if (idx < horizonStart || newEnd > horizonEnd) {
          setHorizon('all');
        }
      }
    }
  };

  const handleEndDateChange = (newDateStr: string) => {
    if (!newDateStr) return;
    let idx = dateToIndexMap.get(newDateStr);
    if (idx === undefined) {
      const targetDate = parseISO(newDateStr);
      const startDate = parseISO(minDateStr);
      idx = Math.max(0, Math.min(totalLength - 1, differenceInCalendarDays(targetDate, startDate)));
    }
    if (idx !== undefined) {
      if (mode === 'single') {
        setDayIndex(idx);
        setRange([idx, idx]);
        if (idx < horizonStart || idx > horizonEnd) {
          setHorizon('all');
        }
      } else {
        const currentStart = Math.min(range[0], range[1]);
        const newStart = Math.min(idx, currentStart);
        setRange([newStart, idx]);
        if (newStart < horizonStart || idx > horizonEnd) {
          setHorizon('all');
        }
      }
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
      case 'review':
      case 'play_store':
      case 'google_play':
        return <Smartphone className="w-3 h-3 text-emerald-600" />;
      default: return <Radio className="w-3 h-3 text-slate-400" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'review':
      case 'play_store':
      case 'google_play':
        return 'Google Play';
      case 'telegram':
        return 'Telegram';
      case 'twitter':
        return 'Twitter/X';
      case 'news':
        return 'ЗМІ / Новини';
      case 'facebook':
        return 'Facebook';
      default:
        return source;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-red-600" />
            Хронологічний аналіз (Історія звернень)
          </h1>
          <p className="text-sm text-slate-500">
            Аналізуйте динаміку скарг за окремий день, місяць або за весь проміжок історичних даних ({minDateStr} — {maxDateStr})
          </p>
        </div>
        {startDay && (
          <Button 
            size="sm" 
            className="bg-red-600 hover:bg-red-700 text-white font-medium gap-1.5 shadow-sm cursor-pointer"
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
                Часовий проміжок та повзунок дат
              </CardTitle>
              <CardDescription>
                Виберіть період (30 днів, 90 днів, пів року, весь проміжок), встановіть довільні дати в календарі або налаштуйте повзунок
              </CardDescription>
            </div>

            {/* Scale Horizon & Simulation Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Horizon Scale & Period Selector */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
                <span className="text-[11px] text-slate-500 px-2 flex items-center gap-1 font-semibold">
                  <Layers className="w-3 h-3" /> Період:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setHorizon('30d');
                    setMode('range');
                    const end = totalLength - 1;
                    const start = Math.max(0, end - 29);
                    setRange([start, end]);
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    horizon === '30d'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  30 днів
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHorizon('90d');
                    setMode('range');
                    const end = totalLength - 1;
                    const start = Math.max(0, end - 89);
                    setRange([start, end]);
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    horizon === '90d'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  90 днів
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHorizon('180d');
                    setMode('range');
                    const end = totalLength - 1;
                    const start = Math.max(0, end - 179);
                    setRange([start, end]);
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    horizon === '180d'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Пів року
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHorizon('all');
                    setMode('range');
                    setRange([0, totalLength - 1]);
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    horizon === 'all'
                      ? 'bg-red-600 text-white shadow-xs font-bold'
                      : 'text-red-700 hover:text-red-800 font-semibold'
                  }`}
                >
                  Весь проміжок ({totalLength} дн.)
                </button>
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
                  {isDayPlaying ? "Пауза" : "Відтворити"}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleReset}
                  className="h-8 px-2 cursor-pointer"
                  title="Скинути на початок поточної шкали"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Secondary Control Bar: Mode Toggle + Date Pickers */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 mt-2">
            {/* Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
              <button
                type="button"
                onClick={() => {
                  setMode('single');
                  setDayIndex(activeEndIndex);
                  setRange([activeEndIndex, activeEndIndex]);
                }}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
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
                    const start = Math.max(0, range[1] - 29);
                    setRange([start, range[1]]);
                  }
                }}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  mode === 'range'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Період (діапазон)
              </button>
            </div>

            {/* Direct Date Range Pickers */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-slate-500 font-medium">З:</span>
              <input
                type="date"
                min={minDateStr}
                max={maxDateStr}
                value={startDay?.dateStr || ''}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-800 font-medium text-xs focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer"
              />
              <span className="text-slate-400">по:</span>
              <input
                type="date"
                min={minDateStr}
                max={maxDateStr}
                value={endDay?.dateStr || ''}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-800 font-medium text-xs focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {/* Slider for Current Horizon */}
          <div className="px-2 pt-2">
            <Slider 
              value={mode === 'single' ? [activeEndIndex] : [activeStartIndex, activeEndIndex]} 
              min={Math.min(horizonStart, activeStartIndex)} 
              max={Math.max(horizonEnd, activeEndIndex)} 
              step={1} 
              onValueChange={handleSliderChange}
              className="w-full cursor-pointer"
            />
            
            <div className="flex justify-between text-xs text-slate-400 mt-2 font-medium">
              <span>
                {allDays[Math.min(horizonStart, activeStartIndex)]?.dateStr} ({allDays[Math.min(horizonStart, activeStartIndex)]?.label})
              </span>
              <span className="font-bold text-red-600">
                {!isRange ? (
                  <>Обрано день: {startDay?.fullLabel}</>
                ) : (
                  <>Обрано період: {startDay?.dateStr} – {endDay?.dateStr} ({periodMetrics.daysCount} дн.)</>
                )}
              </span>
              <span>
                {allDays[Math.max(horizonEnd, activeEndIndex)]?.dateStr} ({allDays[Math.max(horizonEnd, activeEndIndex)]?.label})
              </span>
            </div>
          </div>

          {/* Status Banner for Selected Day or Range */}
          {startDay && endDay && (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 transition-all">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      {isRange 
                        ? `${startDay.fullLabel} — ${endDay.fullLabel}` 
                        : startDay.fullLabel
                      }
                    </span>
                    <Badge variant="outline" className="bg-white text-slate-700 border-slate-300 font-semibold text-xs">
                      {isRange ? `${periodMetrics.daysCount} дн.` : '1 день'}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    {isRange 
                      ? `За обрані ${periodMetrics.daysCount} дн. зафіксовано ${periodMetrics.count.toLocaleString()} звернень (в середньому ${periodMetrics.avgDaily}/день), середній ризик ${periodMetrics.avgRisk}/100.${periodTopLocation.count > 0 ? ` Топ-локація: ${periodTopLocation.name}.` : ''}`
                      : `Зафіксовано ${startDay.count} звернень. Середній ризик: ${startDay.avgRisk}/100.${startDay.topLocation !== 'Немає даних' ? ` Головна локація: ${startDay.topLocation}.` : ''}`
                    }
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  <Button 
                    size="sm" 
                    variant="default" 
                    className="text-xs h-8 px-3.5 font-semibold bg-red-600 hover:bg-red-700 text-white gap-1.5 shadow-sm cursor-pointer"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card className="border-slate-200">
          <CardContent className="p-3.5">
            <div className="text-xs text-slate-500 font-medium mb-1">
              {isRange ? 'Скарг за період' : 'Скарг за день'}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-slate-900">{periodMetrics.count.toLocaleString()}</span>
              {isRange && (
                <span className="text-[11px] font-medium text-slate-400">
                  ~{periodMetrics.avgDaily}/день
                </span>
              )}
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

      {/* Chart + Selected Period Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Bar Chart for Active Horizon (2 cols) */}
        <Card className="lg:col-span-2 border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>
                Динаміка звернень ({horizon === 'all' ? `Весь проміжок: ${totalLength} дн.` : `${visibleDays.length} дн.`})
              </span>
              <span className="text-xs font-normal text-slate-500">
                {isRange 
                  ? `Обрано діапазон: ${startDay?.dateStr} – ${endDay?.dateStr} (${periodMetrics.daysCount} дн.)`
                  : `Підсвічено: ${startDay?.label}`
                }
              </span>
            </CardTitle>
            <CardDescription>
              {mode === 'single' 
                ? 'Клікніть на будь-який стовпчик графіка, щоб перемкнути вибір на цей день'
                : 'Клікніть на стовпчик, щоб скоригувати межі періоду, або двічі клікніть для переходу у стрічку'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={visibleDays}
                onClick={(e: any) => {
                  if (e) {
                    const payload = e.activePayload?.[0]?.payload;
                    const idx = payload?.index;
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
                <XAxis 
                  dataKey={visibleDays.length > 90 ? "monthLabel" : "label"} 
                  tick={{fontSize: 10, fill: '#64748b'}} 
                  interval={visibleDays.length > 120 ? 30 : visibleDays.length > 45 ? 7 : 2} 
                />
                <YAxis tick={{fontSize: 11, fill: '#64748b'}} />
                <Tooltip 
                  formatter={(val: any) => [val, 'Кількість скарг']}
                  labelFormatter={(label, payload) => {
                    const item = payload?.[0]?.payload;
                    return item ? `${item.fullLabel} (${item.dateStr}) | Ризик: ${item.avgRisk}/100` : label;
                  }}
                  contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0'}}
                />
                <Bar 
                  dataKey="count" 
                  radius={[3, 3, 0, 0]}
                  cursor="pointer"
                >
                  {visibleDays.map((entry) => {
                    const isSelected = entry.index >= activeStartIndex && entry.index <= activeEndIndex;
                    const isBoundary = entry.index === activeStartIndex || entry.index === activeEndIndex;
                    
                    let fillColor = '#cbd5e1'; // unselected background
                    if (isSelected) {
                      fillColor = entry.isSpike ? '#dc2626' : '#e11d48';
                    } else if (entry.isSpike) {
                      fillColor = '#fca5a5';
                    }

                    return (
                      <Cell 
                        key={`cell-${entry.index}`} 
                        onClick={(e: any) => {
                          e?.stopPropagation?.();
                          if (mode === 'single') {
                            setDayIndex(entry.index);
                            setRange([entry.index, entry.index]);
                          } else {
                            setRange(prev => {
                              if (entry.index < prev[0]) return [entry.index, prev[1]];
                              if (entry.index > prev[1]) return [prev[0], entry.index];
                              const distStart = Math.abs(entry.index - prev[0]);
                              const distEnd = Math.abs(entry.index - prev[1]);
                              return distStart <= distEnd ? [entry.index, prev[1]] : [prev[0], entry.index];
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
                {periodRecords.length.toLocaleString()} згадок
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {periodRecords.length > 0 ? (
              periodRecords.slice(0, 15).map((record) => (
                <div key={record.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs space-y-1.5 hover:bg-slate-100/70 transition-colors">
                  <div className="flex justify-between items-center text-slate-500">
                    <div className="flex items-center gap-1.5 font-medium text-slate-700">
                      {getSourceIcon(record.source)}
                      <span className="capitalize">{getSourceLabel(record.source)}</span>
                    </div>
                    <span className="text-[10px] font-mono">
                      {format(parseISO(record.timestamp), 'dd.MM.yy HH:mm')}
                    </span>
                  </div>
                  <p className="text-slate-800 leading-relaxed font-normal">
                    {cleanFeedText(record.content)}
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
            <span className="text-slate-500 font-medium truncate mr-2">
              {periodRecords.length.toLocaleString()} скарг {isRange ? `за ${periodMetrics.daysCount} дн.` : `за ${startDay?.label}`}
            </span>
            <Button 
              size="sm" 
              className="text-xs h-7 px-2.5 bg-red-600 hover:bg-red-700 text-white gap-1 font-medium shadow-sm shrink-0 cursor-pointer"
              onClick={() => router.push(targetFeedUrl)}
            >
              Відкрити у фіді <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------- */}
      {/* COMPETITOR & MARKET ANALYSIS BLOCK (AT THE BOTTOM)   */}
      {/* ---------------------------------------------------- */}
      <CompetitorAnalysisSection
        startDateStr={startDay?.dateStr || minDateStr}
        endDateStr={endDay?.dateStr || maxDateStr}
        fullDateLabel={isRange ? `${startDay?.fullLabel} — ${endDay?.fullLabel}` : startDay?.fullLabel || ''}
        dateLabel={isRange ? `${startDay?.label} – ${endDay?.label}` : startDay?.label || ''}
        isRange={isRange}
        daysCount={periodMetrics.daysCount}
        allMarketRecords={allMarketRecords}
        marketNews={realMarketData.items}
      />
    </div>
  );
}
