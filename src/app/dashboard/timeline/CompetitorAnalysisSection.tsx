'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FeedbackRecord } from '@/lib/data/types';
import { 
  format, 
  parseISO, 
  addDays, 
  differenceInCalendarDays, 
  startOfWeek, 
  endOfWeek 
} from 'date-fns';
import { uk } from 'date-fns/locale';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import {
  Users,
  Send,
  Newspaper,
  Radio,
  MapPin,
  UserX,
  AlertTriangle,
  ExternalLink,
  Search,
  TrendingUp,
  BarChart3,
  Scale,
  Sparkles,
  Layers,
  ShieldAlert,
  Smartphone
} from 'lucide-react';

export interface MarketNewsItem {
  content: string;
  timestamp: string;
  source: string;
  url?: string;
  cause?: string;
  sentiment?: string;
}

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

type AggregationMode = 'daily' | 'weekly' | 'monthly';
type ActiveFeedTab = 'kyivstar' | 'lifecell' | 'vodafone' | 'news';

export default function CompetitorAnalysisSection({
  startDateStr,
  endDateStr,
  fullDateLabel,
  dateLabel,
  isRange,
  daysCount,
  allMarketRecords,
  marketNews
}: CompetitorAnalysisSectionProps) {
  // Feed & filter states
  const [activeTab, setActiveTab] = useState<ActiveFeedTab>('kyivstar');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterRiskOnly, setFilterRiskOnly] = useState<boolean>(false);
  const [filterChurnOnly, setFilterChurnOnly] = useState<boolean>(false);
  
  // Chart granularity (auto-computed by default)
  const defaultAggregation: AggregationMode = useMemo(() => {
    if (daysCount <= 45) return 'daily';
    if (daysCount <= 180) return 'weekly';
    return 'monthly';
  }, [daysCount]);

  const [aggregation, setAggregation] = useState<AggregationMode>(defaultAggregation);

  // Sync default aggregation when horizon changes drastically
  useMemo(() => {
    setAggregation(defaultAggregation);
  }, [defaultAggregation]);

  // ---------------------------------------------------------------------------
  // 1. FILTER RECORDS FOR SELECTED PERIOD
  // ---------------------------------------------------------------------------
  const periodRecords = useMemo(() => {
    if (!allMarketRecords.length) return [];
    return allMarketRecords.filter(r => {
      const d = r.timestamp.slice(0, 10);
      return d >= startDateStr && d <= endDateStr;
    });
  }, [allMarketRecords, startDateStr, endDateStr]);

  const periodNews = useMemo(() => {
    if (!marketNews.length) return [];
    return marketNews.filter(n => {
      const d = n.timestamp.slice(0, 10);
      return d >= startDateStr && d <= endDateStr;
    });
  }, [marketNews, startDateStr, endDateStr]);

  // ---------------------------------------------------------------------------
  // 2. BRAND STATS COMPUTATION
  // ---------------------------------------------------------------------------
  const { vfStats, ksStats, lcStats, totalCompetitorComplaints } = useMemo(() => {
    const vf = periodRecords.filter(r => r.brand === 'vodafone' && !r.isMarketWide);
    const ks = periodRecords.filter(r => r.brand === 'kyivstar' && !r.isMarketWide);
    const lc = periodRecords.filter(r => r.brand === 'lifecell' && !r.isMarketWide);

    const calcStats = (records: FeedbackRecord[], brandName: string) => {
      const count = records.length;
      const riskyRecords = records.filter(r => r.reputationalRiskScore > 0);
      const totalRisk = riskyRecords.reduce((sum, r) => sum + r.reputationalRiskScore, 0);
      const avgRisk = riskyRecords.length > 0 ? Math.round(totalRisk / riskyRecords.length) : 0;
      const highRiskCount = records.filter(r => r.reputationalRiskScore >= 50).length;
      const churnCount = records.filter(r => r.churnIntent).length;
      const churnPercent = count > 0 ? Math.round((churnCount / count) * 1000) / 10 : 0;

      // Problem types
      const noSignal = records.filter(r => r.problemType === 'no_signal').length;
      const slowInternet = records.filter(r => r.problemType === 'slow_internet').length;
      const droppedCalls = records.filter(r => r.problemType === 'dropped_calls').length;
      const other = records.filter(r => r.problemType === 'other' || r.problemType === 'none').length;

      // Top location
      const locCounts: Record<string, number> = {};
      records.forEach(r => {
        if (r.locationName && r.locationName !== 'Невідомо') {
          locCounts[r.locationName] = (locCounts[r.locationName] || 0) + 1;
        }
      });
      const sortedLocs = Object.entries(locCounts).sort((a, b) => b[1] - a[1]);
      const topLoc = sortedLocs[0]?.[0] || 'Не вказано';
      const topLocCount = sortedLocs[0]?.[1] || 0;

      // Sentiment
      const negative = records.filter(r => r.sentiment === 'negative').length;
      const neutral = records.filter(r => r.sentiment === 'neutral').length;
      const positive = records.filter(r => r.sentiment === 'positive').length;

      return {
        brandName,
        count,
        avgRisk,
        highRiskCount,
        churnCount,
        churnPercent,
        problems: {
          noSignal,
          slowInternet,
          droppedCalls,
          other
        },
        topLoc,
        topLocCount,
        sentiment: { negative, neutral, positive },
        records
      };
    };

    const vfS = calcStats(vf, 'Vodafone');
    const ksS = calcStats(ks, 'Київстар');
    const lcS = calcStats(lc, 'lifecell');
    const total = vfS.count + ksS.count + lcS.count;

    return {
      vfStats: vfS,
      ksStats: ksS,
      lcStats: lcS,
      totalCompetitorComplaints: total
    };
  }, [periodRecords]);

  // Market Share percentages
  const vfShare = totalCompetitorComplaints > 0 ? Math.round((vfStats.count / totalCompetitorComplaints) * 100) : 0;
  const ksShare = totalCompetitorComplaints > 0 ? Math.round((ksStats.count / totalCompetitorComplaints) * 100) : 0;
  const lcShare = totalCompetitorComplaints > 0 ? Math.max(0, 100 - vfShare - ksShare) : 0;

  // ---------------------------------------------------------------------------
  // 3. COMPARATIVE TIMELINE CHART DATA
  // ---------------------------------------------------------------------------
  const timelineChartData = useMemo(() => {
    if (!startDateStr || !endDateStr) return [];
    const start = parseISO(startDateStr);
    const end = parseISO(endDateStr);
    const diff = Math.max(1, differenceInCalendarDays(end, start) + 1);

    type TimelineChartItem = {
      dateStr: string;
      label: string;
      vodafone: number;
      kyivstar: number;
      lifecell: number;
      total: number;
    };

    if (aggregation === 'daily') {
      const map = new Map<string, TimelineChartItem>();
      for (let i = 0; i < diff; i++) {
        const d = addDays(start, i);
        const dStr = format(d, 'yyyy-MM-dd');
        map.set(dStr, {
          dateStr: dStr,
          label: format(d, 'dd.MM'),
          vodafone: 0,
          kyivstar: 0,
          lifecell: 0,
          total: 0
        });
      }

      periodRecords.forEach(r => {
        const dStr = r.timestamp.slice(0, 10);
        const entry = map.get(dStr);
        if (entry) {
          if (r.brand === 'vodafone' && !r.isMarketWide) {
            entry.vodafone += 1;
            entry.total += 1;
          } else if (r.brand === 'kyivstar' && !r.isMarketWide) {
            entry.kyivstar += 1;
            entry.total += 1;
          } else if (r.brand === 'lifecell' && !r.isMarketWide) {
            entry.lifecell += 1;
            entry.total += 1;
          }
        }
      });

      return Array.from(map.values());
    } else if (aggregation === 'weekly') {
      // Group by calendar week or 7-day chunk
      const weeklyMap = new Map<string, TimelineChartItem>();

      for (let i = 0; i < diff; i += 7) {
        const chunkStart = addDays(start, i);
        const chunkEnd = addDays(start, Math.min(diff - 1, i + 6));
        const key = format(chunkStart, 'yyyy-MM-dd');
        const label = `${format(chunkStart, 'dd.MM')}–${format(chunkEnd, 'dd.MM')}`;
        weeklyMap.set(key, { dateStr: key, label, vodafone: 0, kyivstar: 0, lifecell: 0, total: 0 });
      }

      periodRecords.forEach(r => {
        const rDate = parseISO(r.timestamp.slice(0, 10));
        const daysFromStart = differenceInCalendarDays(rDate, start);
        if (daysFromStart >= 0 && daysFromStart < diff) {
          const chunkIndex = Math.floor(daysFromStart / 7) * 7;
          const chunkDate = addDays(start, chunkIndex);
          const key = format(chunkDate, 'yyyy-MM-dd');
          const entry = weeklyMap.get(key);
          if (entry) {
            if (r.brand === 'vodafone' && !r.isMarketWide) entry.vodafone += 1;
            else if (r.brand === 'kyivstar' && !r.isMarketWide) entry.kyivstar += 1;
            else if (r.brand === 'lifecell' && !r.isMarketWide) entry.lifecell += 1;
            entry.total += 1;
          }
        }
      });

      return Array.from(weeklyMap.values());
    } else {
      // Group by Month
      const monthlyMap = new Map<string, TimelineChartItem>();

      for (let i = 0; i < diff; i++) {
        const d = addDays(start, i);
        const monthKey = format(d, 'yyyy-MM');
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, {
            dateStr: monthKey,
            label: format(d, 'LLL yyyy', { locale: uk }),
            vodafone: 0,
            kyivstar: 0,
            lifecell: 0,
            total: 0
          });
        }
      }

      periodRecords.forEach(r => {
        const monthKey = r.timestamp.slice(0, 7);
        const entry = monthlyMap.get(monthKey);
        if (entry) {
          if (r.brand === 'vodafone' && !r.isMarketWide) entry.vodafone += 1;
          else if (r.brand === 'kyivstar' && !r.isMarketWide) entry.kyivstar += 1;
          else if (r.brand === 'lifecell' && !r.isMarketWide) entry.lifecell += 1;
          entry.total += 1;
        }
      });

      return Array.from(monthlyMap.values());
    }
  }, [startDateStr, endDateStr, aggregation, periodRecords]);

  // ---------------------------------------------------------------------------
  // 4. PROBLEM TYPES COMPARISON CHART DATA
  // ---------------------------------------------------------------------------
  const problemComparisonData = useMemo(() => {
    return [
      {
        category: "Немає сигналу",
        vodafone: vfStats.problems.noSignal,
        kyivstar: ksStats.problems.noSignal,
        lifecell: lcStats.problems.noSignal
      },
      {
        category: "Швидкість 4G/5G",
        vodafone: vfStats.problems.slowInternet,
        kyivstar: ksStats.problems.slowInternet,
        lifecell: lcStats.problems.slowInternet
      },
      {
        category: "Обрив дзвінків",
        vodafone: vfStats.problems.droppedCalls,
        kyivstar: ksStats.problems.droppedCalls,
        lifecell: lcStats.problems.droppedCalls
      },
      {
        category: "Тарифи / сервіс",
        vodafone: vfStats.problems.other,
        kyivstar: ksStats.problems.other,
        lifecell: lcStats.problems.other
      }
    ];
  }, [vfStats, ksStats, lcStats]);

  // ---------------------------------------------------------------------------
  // 5. FILTERED FEED FOR THE SELECTED TAB
  // ---------------------------------------------------------------------------
  const feedItems = useMemo(() => {
    if (activeTab === 'news') {
      let list = [...periodNews];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(n => n.content.toLowerCase().includes(q));
      }
      return list;
    }

    let records: FeedbackRecord[] = [];
    if (activeTab === 'kyivstar') records = ksStats.records;
    else if (activeTab === 'lifecell') records = lcStats.records;
    else if (activeTab === 'vodafone') records = vfStats.records;

    let filtered = [...records];

    if (filterRiskOnly) {
      filtered = filtered.filter(r => r.reputationalRiskScore >= 50);
    }
    if (filterChurnOnly) {
      filtered = filtered.filter(r => r.churnIntent);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.content.toLowerCase().includes(q) || 
        (r.locationName && r.locationName.toLowerCase().includes(q))
      );
    }

    return filtered;
  }, [activeTab, ksStats, lcStats, vfStats, periodNews, searchQuery, filterRiskOnly, filterChurnOnly]);

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'telegram': return <Send className="w-3 h-3 text-sky-500" />;
      case 'news': return <Newspaper className="w-3 h-3 text-amber-600" />;
      case 'review': return <Smartphone className="w-3 h-3 text-emerald-600" />;
      case 'twitter': return <span className="font-bold text-[10px] text-blue-500">𝕏</span>;
      default: return <Radio className="w-3 h-3 text-slate-400" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'telegram': return 'Telegram';
      case 'news': return 'ЗМІ';
      case 'review': return 'Play Store / App Store';
      case 'twitter': return 'Twitter / X';
      default: return 'Моніторинг';
    }
  };

  return (
    <div className="space-y-6 pt-4 border-t-2 border-slate-200/80">
      {/* --------------------------------------------------------------------- */}
      {/* SECTION HEADER                                                        */}
      {/* --------------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-slate-200 shadow-xs bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-200/30 border border-slate-500/40 flex items-center justify-center text-red-600 shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Аналіз конкурентів та ринкового середовища
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-900 pl-0 sm:pl-11.5 leading-relaxed max-w-3xl">
            Порівняльний зріз репутаційного навантаження, ризиків відтоку (Churn) та скарг на якість зв’язку за обраний період:{' '}
              {fullDateLabel}
            {' '}
            ({daysCount} {daysCount === 1 ? 'день' : daysCount < 5 ? 'дні' : 'днів'})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-center shrink-0">
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-xs">
            <span className="text-slate-400 block text-[10px] font-medium uppercase tracking-wider">
              Скарг у вибірці
            </span>
            <span className="font-black text-sm text-white">
              {totalCompetitorComplaints.toLocaleString()} звернень
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-xs">
            <span className="text-slate-400 block text-[10px] font-medium uppercase tracking-wider">
              Галузевих новин
            </span>
            <span className="font-black text-sm text-amber-400">
              {periodNews.length} подій
            </span>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* MARKET SHARE BAR: SHARE OF COMPLAINTS IN SELECTED PERIOD               */}
      {/* --------------------------------------------------------------------- */}
      <Card className="border-slate-200 shadow-xs bg-white">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2.5">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-slate-500" />
              Розподіл скарг на ринку за обраний період ({daysCount} дн.)
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Всього звернень по 3 операторах: <b className="text-slate-900">{totalCompetitorComplaints}</b>
            </span>
          </div>

          {/* Segmented Proportional Progress Bar */}
          <div className="w-full h-7 bg-slate-100 rounded-lg overflow-hidden flex shadow-inner border border-slate-200">
            {vfStats.count > 0 && (
              <div 
                style={{ width: `${vfShare}%` }} 
                className="bg-red-600 hover:bg-red-700 transition-all flex items-center justify-center text-white text-[11px] font-bold px-1 overflow-hidden truncate cursor-help"
                title={`Vodafone: ${vfStats.count} скарг (${vfShare}%)`}
              >
                {vfShare >= 10 ? `Vodafone: ${vfShare}% (${vfStats.count})` : `${vfShare}%`}
              </div>
            )}
            {ksStats.count > 0 && (
              <div 
                style={{ width: `${ksShare}%` }} 
                className="bg-sky-600 hover:bg-sky-700 transition-all flex items-center justify-center text-white text-[11px] font-bold px-1 overflow-hidden truncate cursor-help"
                title={`Київстар: ${ksStats.count} скарг (${ksShare}%)`}
              >
                {ksShare >= 10 ? `Київстар: ${ksShare}% (${ksStats.count})` : `${ksShare}%`}
              </div>
            )}
            {lcStats.count > 0 && (
              <div 
                style={{ width: `${lcShare}%` }} 
                className="bg-amber-500 hover:bg-amber-600 transition-all flex items-center justify-center text-slate-900 text-[11px] font-bold px-1 overflow-hidden truncate cursor-help"
                title={`lifecell: ${lcStats.count} скарг (${lcShare}%)`}
              >
                {lcShare >= 8 ? `lifecell: ${lcShare}% (${lcStats.count})` : `${lcShare}%`}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-600 inline-block shrink-0" />
              <span className="font-semibold text-slate-800">Vodafone:</span>
              <span>{vfStats.count} скарг ({vfShare}%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-sky-600 inline-block shrink-0" />
              <span className="font-semibold text-slate-800">Київстар:</span>
              <span>{ksStats.count} скарг ({ksShare}%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shrink-0" />
              <span className="font-semibold text-slate-800">lifecell:</span>
              <span>{lcStats.count} скарг ({lcShare}%)</span>
            </div>
            <div className="text-[11px] text-slate-400 italic">
              *Скарги без прив’язки до бренду не включені до частки ринку
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --------------------------------------------------------------------- */}
      {/* 3 DETAILED OPERATOR SCORECARDS (VODAFONE vs KYIVSTAR vs LIFECELL)       */}
      {/* --------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Vodafone */}
        <Card className="border-red-200 bg-gradient-to-b from-red-50/40 via-white to-white shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-red-600" />
          <CardHeader className="pb-3 pt-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center font-black text-xs shadow-xs">
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Vodafone</CardTitle>
                </div>
              </div>
              <Badge className="bg-red-100 text-red-800 border-red-200 text-xs font-bold px-2 py-0.5">
                {vfShare}% ринку
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-medium">Скарг за період</span>
                <span className="text-xl font-black text-slate-900">{vfStats.count}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-medium">Сер. ризик (0-100)</span>
                <span className={`text-xl font-black ${vfStats.avgRisk >= 40 ? 'text-red-600' : 'text-slate-800'}`}>
                  {vfStats.avgRisk}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Крит. скарг (≥50):
                </span>
                <span className="font-bold text-slate-900">{vfStats.highRiskCount}</span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1">
                  <UserX className="w-3.5 h-3.5 text-rose-500" /> Ризик відтоку (Churn):
                </span>
                <span className={`font-bold ${vfStats.churnCount > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                  {vfStats.churnPercent}% ({vfStats.churnCount})
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> Головна локація:
                </span>
                <span className="font-bold text-slate-900 truncate max-w-[130px]" title={vfStats.topLoc}>
                  {vfStats.topLoc} {vfStats.topLocCount > 0 && `(${vfStats.topLocCount})`}
                </span>
              </div>
            </div>

            {/* Quick breakdown of problem */}
            <div className="p-2.5 rounded-lg bg-red-50/60 border border-red-100 text-[11px] text-slate-700">
              <div className="font-semibold text-red-950 mb-1 flex items-center justify-between">
                <span>Структура проблем:</span>
                <span className="text-[10px] text-red-600 font-bold">
                  {vfStats.problems.noSignal} без зв’язку
                </span>
              </div>
              <div className="flex justify-between text-slate-600 text-[10px]">
                <span>Сигнал: {vfStats.problems.noSignal}</span>
                <span>4G/5G: {vfStats.problems.slowInternet}</span>
                <span>Дзвінки: {vfStats.problems.droppedCalls}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Kyivstar */}
        <Card className="border-sky-200 bg-gradient-to-b from-sky-50/40 via-white to-white shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-sky-600" />
          <CardHeader className="pb-3 pt-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-sky-600 text-white flex items-center justify-center font-black text-xs shadow-xs">
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Київстар</CardTitle>
                </div>
              </div>
              <Badge className="bg-sky-100 text-sky-800 border-sky-200 text-xs font-bold px-2 py-0.5">
                {ksShare}% ринку
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-medium">Скарг за період</span>
                <span className="text-xl font-black text-slate-900">{ksStats.count}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-medium">Сер. ризик (0-100)</span>
                <span className={`text-xl font-black ${ksStats.avgRisk >= 40 ? 'text-sky-700' : 'text-slate-800'}`}>
                  {ksStats.avgRisk}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Крит. скарг (≥50):
                </span>
                <span className="font-bold text-slate-900">{ksStats.highRiskCount}</span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1">
                  <UserX className="w-3.5 h-3.5 text-rose-500" /> Ризик відтоку (Churn):
                </span>
                <span className={`font-bold ${ksStats.churnCount > 0 ? 'text-sky-700' : 'text-slate-700'}`}>
                  {ksStats.churnPercent}% ({ksStats.churnCount})
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> Головна локація:
                </span>
                <span className="font-bold text-slate-900 truncate max-w-[130px]" title={ksStats.topLoc}>
                  {ksStats.topLoc} {ksStats.topLocCount > 0 && `(${ksStats.topLocCount})`}
                </span>
              </div>
            </div>

            {/* Quick breakdown of problem */}
            <div className="p-2.5 rounded-lg bg-sky-50/60 border border-sky-100 text-[11px] text-slate-700">
              <div className="font-semibold text-sky-950 mb-1 flex items-center justify-between">
                <span>Структура проблем:</span>
                <span className="text-[10px] text-sky-700 font-bold">
                  {ksStats.problems.noSignal} без зв’язку
                </span>
              </div>
              <div className="flex justify-between text-slate-600 text-[10px]">
                <span>Сигнал: {ksStats.problems.noSignal}</span>
                <span>4G/5G: {ksStats.problems.slowInternet}</span>
                <span>Дзвінки: {ksStats.problems.droppedCalls}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: lifecell */}
        <Card className="border-amber-200 bg-gradient-to-b from-amber-50/40 via-white to-white shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-500" />
          <CardHeader className="pb-3 pt-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-black text-xs shadow-xs">
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">lifecell</CardTitle>
                </div>
              </div>
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs font-bold px-2 py-0.5">
                {lcShare}% ринку
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-medium">Скарг за період</span>
                <span className="text-xl font-black text-slate-900">{lcStats.count}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-medium">Сер. ризик (0-100)</span>
                <span className={`text-xl font-black ${lcStats.avgRisk >= 40 ? 'text-amber-700' : 'text-slate-800'}`}>
                  {lcStats.avgRisk}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Крит. скарг (≥50):
                </span>
                <span className="font-bold text-slate-900">{lcStats.highRiskCount}</span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1">
                  <UserX className="w-3.5 h-3.5 text-rose-500" /> Ризик відтоку (Churn):
                </span>
                <span className={`font-bold ${lcStats.churnCount > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                  {lcStats.churnPercent}% ({lcStats.churnCount})
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> Головна локація:
                </span>
                <span className="font-bold text-slate-900 truncate max-w-[130px]" title={lcStats.topLoc}>
                  {lcStats.topLoc} {lcStats.topLocCount > 0 && `(${lcStats.topLocCount})`}
                </span>
              </div>
            </div>

            {/* Quick breakdown of problem */}
            <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-100 text-[11px] text-slate-700">
              <div className="font-semibold text-amber-950 mb-1 flex items-center justify-between">
                <span>Структура проблем:</span>
                <span className="text-[10px] text-amber-800 font-bold">
                  {lcStats.problems.noSignal} без зв’язку
                </span>
              </div>
              <div className="flex justify-between text-slate-600 text-[10px]">
                <span>Сигнал: {lcStats.problems.noSignal}</span>
                <span>4G/5G: {lcStats.problems.slowInternet}</span>
                <span>Дзвінки: {lcStats.problems.droppedCalls}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* COMPARATIVE CHARTS GRID: TIMELINE & PROBLEM BREAKDOWN                 */}
      {/* --------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Dynamic Timeline of Complaints by Brand (2 cols) */}
        <Card className="lg:col-span-2 border-slate-200">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-red-600" />
                  Порівняльна динаміка скарг: Vodafone vs Київстар vs lifecell
                </CardTitle>
                <CardDescription className="text-xs">
                  Кількість зафіксованих звернень по днях або періодах у межах обраного часового проміжку
                </CardDescription>
              </div>

              {/* Aggregation switch */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[11px] font-medium self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setAggregation('daily')}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    aggregation === 'daily' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  По днях
                </button>
                <button
                  type="button"
                  onClick={() => setAggregation('weekly')}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    aggregation === 'weekly' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  По тижнях
                </button>
                <button
                  type="button"
                  onClick={() => setAggregation('monthly')}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    aggregation === 'monthly' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  По місяцях
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="h-[320px]">
            {timelineChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timelineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="label" 
                    tick={{ fontSize: 10, fill: '#64748b' }} 
                    interval={timelineChartData.length > 45 ? 4 : timelineChartData.length > 20 ? 2 : 0} 
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    formatter={(val: any, name: any) => {
                      const labelMap: Record<string, string> = {
                        vodafone: 'Vodafone',
                        kyivstar: 'Київстар',
                        lifecell: 'lifecell'
                      };
                      return [val, labelMap[name] || name];
                    }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    align="right" 
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', paddingBottom: '8px' }}
                    formatter={(val) => {
                      if (val === 'vodafone') return <span className="font-semibold text-slate-700">Vodafone</span>;
                      if (val === 'kyivstar') return <span className="font-semibold text-slate-700">Київстар</span>;
                      if (val === 'lifecell') return <span className="font-semibold text-slate-700">lifecell</span>;
                      return val;
                    }}
                  />
                  <Bar dataKey="vodafone" fill="#e11d48" radius={[2, 2, 0, 0]} name="vodafone" />
                  <Bar dataKey="kyivstar" fill="#0284c7" radius={[2, 2, 0, 0]} name="kyivstar" />
                  <Bar dataKey="lifecell" fill="#f59e0b" radius={[2, 2, 0, 0]} name="lifecell" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                Немає даних для побудови графіка за обраний період
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 2: Problem Types Comparison (1 col) */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-700" />
              Категорії скарг по операторах
            </CardTitle>
            <CardDescription className="text-xs">
              Порівняння обсягів скарг за типом деградації мережі
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={problemComparisonData} 
                layout="vertical" 
                margin={{ top: 10, right: 15, left: 15, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis 
                  dataKey="category" 
                  type="category" 
                  tick={{ fontSize: 10, fill: '#475569' }} 
                  width={90}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  formatter={(val: any, name: any) => {
                    const labelMap: Record<string, string> = {
                      vodafone: 'Vodafone',
                      kyivstar: 'Київстар',
                      lifecell: 'lifecell'
                    };
                    return [val, labelMap[name] || name];
                  }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right" 
                  iconType="circle"
                  wrapperStyle={{ fontSize: '10px', paddingBottom: '6px' }}
                  formatter={(val) => {
                    if (val === 'vodafone') return 'Vodafone';
                    if (val === 'kyivstar') return 'Київстар';
                    if (val === 'lifecell') return 'lifecell';
                    return val;
                  }}
                />
                <Bar dataKey="vodafone" fill="#e11d48" radius={[0, 3, 3, 0]} name="vodafone" />
                <Bar dataKey="kyivstar" fill="#0284c7" radius={[0, 3, 3, 0]} name="kyivstar" />
                <Bar dataKey="lifecell" fill="#f59e0b" radius={[0, 3, 3, 0]} name="lifecell" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* STRATEGIC TAKEAWAYS / EXECUTIVE VERDICT FOR THE PERIOD                 */}
      {/* --------------------------------------------------------------------- */}
      <Card className="border-slate-200 bg-slate-50/60 shadow-xs">
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center gap-2 text-slate-800">
            <Sparkles className="w-4 h-4 text-red-600" />
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Аналітичні висновки щодо конкурентної позиції за період
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pb-4 pt-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Takeaway 1: Volume & Share */}
            <div className="p-3 bg-white rounded-lg border border-slate-200/80 shadow-2xs space-y-1">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-red-600" />
                Обсяг та тиск негативу
              </span>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                {ksStats.count > vfStats.count ? (
                  <>
                    Київстар згенерував найбільшу кількість скарг (<b className="text-slate-800">{ksStats.count}</b>, або {ksShare}% від загального ринку проти {vfStats.count} у Vodafone). Головний драйвер — аварії та скарги на домашній фіксований інтернет у містах-мільйонниках.
                  </>
                ) : vfStats.count > ksStats.count ? (
                  <>
                    Vodafone отримав більше звернень у цей проміжок (<b className="text-slate-800">{vfStats.count}</b> проти {ksStats.count} у Київстар), що вказує на локалізовані навантаження у регіонах або активніші міграційні потоки абонентів.
                  </>
                ) : (
                  <>
                    Vodafone та Київстар продемонстрували паритетний рівень скарг (<b className="text-slate-800">{vfStats.count}</b> кожний). Скарги lifecell залишаються на значно нижчому рівні ({lcStats.count}).
                  </>
                )}
              </p>
            </div>

            {/* Takeaway 2: Churn Threat */}
            <div className="p-3 bg-white rounded-lg border border-slate-200/80 shadow-2xs space-y-1">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <UserX className="w-3.5 h-3.5 text-rose-600" />
                Ризик переходу (Churn Migration)
              </span>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                {ksStats.churnCount > vfStats.churnCount ? (
                  <>
                    У Київстар зафіксовано вищий ризик відтоку (<b className="text-rose-600">{ksStats.churnCount} погроз</b> піти проти {vfStats.churnCount} у Vodafone). Користувачі прямо згадують пошук альтернативного оператора під час тривалих аварій.
                  </>
                ) : vfStats.churnCount > 0 ? (
                  <>
                    У Vodafone зафіксовано <b className="text-rose-600">{vfStats.churnCount} сигналів</b> наміру змінити постачальника зв’язку (у Київстар: {ksStats.churnCount}, lifecell: {lcStats.churnCount}). Необхідно посилити індивідуальне утримання в контакт-центрі.
                  </>
                ) : (
                  <>
                    Критичних погроз відтоку у Vodafone за обраний період не зафіксовано ({vfStats.churnCount}). У Київстар зафіксовано {ksStats.churnCount} таких інцидентів.
                  </>
                )}
              </p>
            </div>

            {/* Takeaway 3: Network Resilience */}
            <div className="p-3 bg-white rounded-lg border border-slate-200/80 shadow-2xs space-y-1">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                Стійкість мережі та покриття
              </span>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Основна маса нарікань по всіх трьох операторах стосується зникнення зв’язку ({vfStats.problems.noSignal + ksStats.problems.noSignal + lcStats.problems.noSignal} скарг сумарно). Найбільш стійким виявився lifecell ({lcStats.count} скарг), однак це зумовлено також меншою абонентською базою.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --------------------------------------------------------------------- */}
      {/* COMPETITOR & MARKET FEED (INTERACTIVE TABS + SEARCH)                  */}
      {/* --------------------------------------------------------------------- */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="pb-3 border-b bg-slate-50/50">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
                <Radio className="w-4 h-4 text-red-600" />
                Стрічка відгуків на конкурентів та галузевого контексту
              </CardTitle>
              <CardDescription className="text-xs">
                Реальні публікації, відгуки Google Play / App Store та новини за обраний період
              </CardDescription>
            </div>

            {/* Tab selector */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium overflow-x-auto max-w-full no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveTab('kyivstar')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'kyivstar'
                    ? 'bg-sky-600 text-white font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Київстар</span>
                <span className={`text-[10px] px-1 rounded-full ${
                  activeTab === 'kyivstar' ? 'bg-sky-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {ksStats.count}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('lifecell')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'lifecell'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>lifecell</span>
                <span className={`text-[10px] px-1 rounded-full ${
                  activeTab === 'lifecell' ? 'bg-amber-600 text-slate-950' : 'bg-slate-200 text-slate-700'
                }`}>
                  {lcStats.count}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('vodafone')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'vodafone'
                    ? 'bg-red-600 text-white font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Vodafone</span>
                <span className={`text-[10px] px-1 rounded-full ${
                  activeTab === 'vodafone' ? 'bg-red-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {vfStats.count}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('news')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'news'
                    ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Newspaper className="w-3 h-3" />
                <span>Галузеві новини</span>
                <span className={`text-[10px] px-1 rounded-full ${
                  activeTab === 'news' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {periodNews.length}
                </span>
              </button>
            </div>
          </div>

          {/* Filter / Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 mt-2">
            <div className="relative flex-1 w-full sm:max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Пошук за ключовим словом або містом..."
                className="pl-8 h-8 text-xs bg-white border-slate-200 focus-visible:ring-red-500"
              />
            </div>

            {activeTab !== 'news' && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={filterRiskOnly ? 'destructive' : 'outline'}
                  onClick={() => setFilterRiskOnly(!filterRiskOnly)}
                  className="h-7 text-xs px-2.5 cursor-pointer font-medium"
                >
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Критичний ризик (≥50)
                </Button>

                <Button
                  size="sm"
                  variant={filterChurnOnly ? 'destructive' : 'outline'}
                  onClick={() => setFilterChurnOnly(!filterChurnOnly)}
                  className="h-7 text-xs px-2.5 cursor-pointer font-medium"
                >
                  <UserX className="w-3 h-3 mr-1" />
                  Ризик відтоку (Churn)
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        {/* Feed list */}
        <CardContent className="p-4 max-h-[460px] overflow-y-auto space-y-3">
          {activeTab === 'news' ? (
            feedItems.length > 0 ? (
              (feedItems as MarketNewsItem[]).map((news, idx) => (
                <div 
                  key={idx} 
                  className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200/80 text-xs space-y-2 transition-colors"
                >
                  <div className="flex justify-between items-center text-slate-500">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[10px] font-semibold py-0 px-1.5">
                        Галузевий контекст
                      </Badge>
                      <span className="flex items-center gap-1 font-medium text-slate-700">
                        {getSourceIcon(news.source)}
                        <span>{getSourceLabel(news.source)}</span>
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      {format(parseISO(news.timestamp), 'dd.MM.yyyy HH:mm')}
                    </span>
                  </div>

                  <p className="text-slate-800 leading-relaxed font-normal">
                    {cleanFeedText(news.content)}
                  </p>

                  <div className="flex justify-between items-center pt-1 border-t border-slate-200/50 text-[10px] text-slate-500">
                    <span className="capitalize">
                      Тематика: {news.cause || 'загальна'}
                    </span>
                    {news.url && (
                      <a
                        href={news.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-red-600 hover:text-red-700 font-medium inline-flex items-center gap-1"
                      >
                        Джерело <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">
                У обраний проміжок дат галузевих новин не знайдено. Спробуйте розширити період.
              </div>
            )
          ) : (
            feedItems.length > 0 ? (
              (feedItems as FeedbackRecord[]).map((record) => (
                <div 
                  key={record.id} 
                  className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200/80 text-xs space-y-2 transition-colors"
                >
                  <div className="flex justify-between items-center text-slate-500">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline"
                        className={`text-[10px] py-0 px-1.5 font-bold ${
                          record.brand === 'kyivstar'
                            ? 'bg-sky-50 text-sky-700 border-sky-300'
                            : record.brand === 'lifecell'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-red-50 text-red-700 border-red-300'
                        }`}
                      >
                        {record.brand === 'kyivstar' ? 'Київстар' : record.brand === 'lifecell' ? 'lifecell' : 'Vodafone'}
                      </Badge>
                      <span className="flex items-center gap-1 font-medium text-slate-700">
                        {getSourceIcon(record.source)}
                        <span>{getSourceLabel(record.source)}</span>
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      {format(parseISO(record.timestamp), 'dd.MM.yyyy HH:mm')}
                    </span>
                  </div>

                  <p className="text-slate-800 leading-relaxed font-normal">
                    {cleanFeedText(record.content)}
                  </p>

                  <div className="flex flex-wrap justify-between items-center gap-2 pt-1 border-t border-slate-200/50">
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {record.locationName || 'Невідомо'}
                      </span>
                      {record.churnIntent && (
                        <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[9px] py-0 px-1 font-bold">
                          ⚠️ Ризик відтоку (Churn)
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={`text-[10px] py-0 px-1 font-semibold ${
                          record.reputationalRiskScore >= 50 
                            ? 'text-red-700 border-red-200 bg-red-50 font-bold' 
                            : 'text-slate-600 border-slate-200 bg-white'
                        }`}
                      >
                        Ризик: {record.reputationalRiskScore}
                      </Badge>
                      {record.originalUrl && (
                        <a
                          href={record.originalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-slate-700 transition-colors"
                          title="Відкрити першоджерело"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">
                Скарг за встановленими фільтрами у цей період не знайдено.
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
