'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  Activity, 
  Users, 
  MapPin, 
  UserX, 
  Share2, 
  Zap, 
  Calendar,
  Sparkles,
  RefreshCw,
  ArrowRight,
  Sun,
  Database
} from 'lucide-react';
import { feedbackService } from '@/lib/data/feedback-service';
import { DashboardMetrics, DailyBriefing } from '@/lib/data/types';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useRouter } from 'next/navigation';

export default function DashboardOverview() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingBriefing, setLoadingBriefing] = useState(true);
  const [isRefreshingBriefing, setIsRefreshingBriefing] = useState(false);
  const [isCached, setIsCached] = useState(false);

  // 1. Fetch yesterday's metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      setLoadingMetrics(true);
      const data = await feedbackService.getMetrics();
      setMetrics(data);
      setLoadingMetrics(false);
    };
    fetchMetrics();
  }, []);

  // 2. Fetch or generate AI morning briefing for yesterday's date
  useEffect(() => {
    if (!metrics?.date) return;

    const fetchBriefing = async () => {
      setLoadingBriefing(true);
      try {
        // Ключ включає самі цифри: бриф, збережений на попередньому
        // вікні звіту, інакше лишався в браузері назавжди і підписував
        // нові метрики старим текстом.
        const localKey = `briefing_${metrics.date}_${metrics.windowStart ?? ''}`
          + `_${metrics.totalComplaints}_${metrics.totalMentions ?? 0}`;
        const cachedLocal = typeof window !== 'undefined' ? localStorage.getItem(localKey) : null;
        if (cachedLocal) {
          try {
            setBriefing(JSON.parse(cachedLocal));
            setIsCached(true);
          } catch {
            // ignore
          }
        }

        const res = await fetch(`/api/briefing?date=${metrics.date}`);
        if (res.ok) {
          const json = await res.json();
          if (json.briefing) {
            setBriefing(json.briefing);
            setIsCached(!!json.cached);
            if (typeof window !== 'undefined') {
              localStorage.setItem(localKey, JSON.stringify(json.briefing));
            }
          }
        }
      } catch (err) {
        console.error('Failed to load briefing:', err);
      } finally {
        setLoadingBriefing(false);
      }
    };

    fetchBriefing();
  }, [metrics?.date]);

  // Handle re-generation via Gemini API
  const handleRefreshBriefing = async () => {
    if (!metrics?.date) return;
    setIsRefreshingBriefing(true);
    try {
      const res = await fetch('/api/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: metrics.date, forceRefresh: true })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.briefing) {
          setBriefing(json.briefing);
          setIsCached(false);
          if (typeof window !== 'undefined') {
            localStorage.setItem(
              `briefing_${metrics.date}_${metrics.windowStart ?? ''}`
                + `_${metrics.totalComplaints}_${metrics.totalMentions ?? 0}`,
              JSON.stringify(json.briefing));
          }
        }
      }
    } catch (err) {
      console.error('Failed to refresh briefing:', err);
    } finally {
      setIsRefreshingBriefing(false);
    }
  };

  if (loadingMetrics || !metrics) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-3 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-red-600" />
        <span className="text-sm font-medium">Підготовка ранкового брифу та завантаження аналітики...</span>
      </div>
    );
  }

  // Critical checks: metric is critical only under severe threat
  const isComplaintsCrit = metrics.spikeVelocityRatio >= 2.0 && metrics.totalComplaints >= 50;
  const isRiskCrit = metrics.averageRiskScore >= 50;
  const isHighRiskCrit = metrics.highRiskIssuesCount > 0;
  const isChurnCrit = metrics.churnIntentCount > 0;
  const isReachCrit = metrics.averageResonance >= 3.0;
  const isSpikeCrit = metrics.spikeVelocityRatio >= 2.0 && metrics.totalComplaints >= 50;

  return (
    <div className="space-y-6">
      {/* Morning Briefing Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold gap-1 px-2.5 py-0.5 text-xs shadow-xs">
              <Sun className="w-3.5 h-3.5" /> MORNING BRIEFING
            </Badge>
            <Badge variant="outline" className="text-slate-600 border-slate-300 text-xs">
              Підсумки за місяць
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Ранковий аналітичний бриф
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Звітний період: <span className="font-semibold text-slate-800">{metrics.dateLabel || 'останні 30 днів'}</span> (30 днів)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isCached && (
            <Badge variant="outline" className="text-[11px] bg-slate-50 text-slate-500 border-slate-200 gap-1 font-normal py-1">
              <Database className="w-3 h-3 text-slate-400" /> Збережено в базі
            </Badge>
          )}

          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefreshBriefing}
            disabled={isRefreshingBriefing}
            className="gap-2 text-xs font-semibold h-8 border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingBriefing ? 'animate-spin' : ''}`} />
            {isRefreshingBriefing ? 'Генерація...' : 'Оновити бриф'}
          </Button>

          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white font-medium text-xs h-8 gap-1.5 shadow-xs"
            onClick={() => router.push('/dashboard/feed')}
          >
            Стрічка за період <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. AI MORNING BRIEFING CARD (WHITE BACKGROUND & CONCISE TEXT) */}
      {/* ========================================================================= */}
      <Card className="border border-slate-200 shadow-sm bg-white text-slate-900 rounded-xl overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/60 pb-3.5 pt-4 px-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-red-50 border border-red-100 text-red-600">
                <Sparkles className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg font-bold text-slate-700 tracking-wide flex items-center gap-2">
                    AI Репутаційний вердикт за період
                  </CardTitle>
                  <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 text-[10px] font-bold px-1.5 py-0 border border-slate-200">
                    Gemini AI
                  </Badge>
                </div>
                <CardDescription className="text-slate-400 text-xs mt-0.5">
                  Синтезовано штучним інтелектом на основі {metrics.totalComplaints} звернень та телеметрії за період {metrics.dateLabel}
                </CardDescription>
              </div>
            </div>

            {briefing && (
              <Badge 
                variant="outline"
                className={`text-xs px-2.5 py-0.5 font-bold tracking-wide ${
                  briefing.status === 'critical'
                    ? 'bg-red-50 text-red-700 border-red-300'
                    : briefing.status === 'warning'
                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                    : 'bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                {briefing.status === 'critical' && '🚨 '}
                {briefing.status === 'warning' && '⚠️ '}
                {briefing.status === 'normal' && ' '}
                {briefing.statusLabel}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {loadingBriefing && !briefing ? (
            <div className="flex items-center justify-center py-8 text-slate-400 text-sm gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
              <span>Формування резюме...</span>
            </div>
          ) : briefing ? (
            <>
              {/* Executive Summary Callout */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 text-slate-800 text-sm leading-relaxed">
                <div className="text-[11px] uppercase font-bold tracking-wider text-slate-500 mb-1 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-slate-400" /> Вердикт для керівництва
                </div>
                <p className="font-normal text-slate-800 text-sm">
                  {briefing.executiveSummary}
                </p>
              </div>

              {/* Key Problem Drivers (Short & Punchy) */}
              <div>
                <div className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-3">
                  🔍 Ключові фактори та драйвери скарг за місяць
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {briefing.keyDrivers.map((driver, idx) => (
                    <div 
                      key={idx} 
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200/70"
                    >
                      <div className="flex justify-between items-center gap-2 mb-1">
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {driver.title}
                        </span>
                        <Badge 
                          variant="outline"
                          className={`text-[9px] px-1.5 py-0 font-bold shrink-0 ${
                            driver.impact === 'high' 
                              ? 'text-red-700 border-red-200 bg-red-50' 
                              : 'text-slate-600 border-slate-200 bg-slate-100'
                          }`}
                        >
                          {driver.impact === 'high' ? 'Критично' : 'Норма'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 leading-snug">
                        {driver.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Churn & Media Virality Analysis (Concise) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className={`p-3 rounded-lg border text-xs leading-relaxed ${
                  isChurnCrit ? 'bg-red-50/40 border-red-200 text-red-950' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <div className={`flex items-center gap-1.5 font-bold text-xs mb-1 ${
                    isChurnCrit ? 'text-red-700' : 'text-slate-600'
                  }`}>
                    <UserX className="w-3.5 h-3.5" /> Ризик відтоку (Churn Intent)
                  </div>
                  <p>{briefing.churnRiskAnalysis}</p>
                </div>

                <div className={`p-3 rounded-lg border text-xs leading-relaxed ${
                  isReachCrit ? 'bg-red-50/40 border-red-200 text-red-950' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <div className={`flex items-center gap-1.5 font-bold text-xs mb-1 ${
                    isReachCrit ? 'text-red-700' : 'text-slate-600'
                  }`}>
                    <Share2 className="w-3.5 h-3.5" /> Медійний резонанс (ЗМІ / Telegram)
                  </div>
                  <p>{briefing.mediaViralityRisk}</p>
                </div>
              </div>

              {/* Action Plan for Today (Concise Bullets) */}
              <div className="pt-2 border-t border-slate-100">
                <div className="text-[11px] uppercase font-bold tracking-wider text-slate-500 mb-2">
                  План дій на сьогодні
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {briefing.recommendedActions.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200/70 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-800">{item.team}</span>
                        <Badge 
                          variant="outline" 
                          className={`text-[9px] px-1 py-0 font-semibold ${
                            item.priority === 'high' 
                              ? 'text-red-700 border-red-200 bg-red-50' 
                              : 'text-slate-500 border-slate-200 bg-slate-100'
                          }`}
                        >
                          {item.priority === 'high' ? 'Терміново' : 'Штатно'}
                        </Badge>
                      </div>
                      <p className="text-slate-600 leading-snug">
                        {item.action}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* 2. OPERATIONAL KPIS (GREY DEFAULT, RED ONLY WHEN CRITICAL) */}
      {/* ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <Activity className="w-4 h-4 text-red-600" />
            Операційні показники за 30 днів ({metrics.dateLabel})
          </h2>
          <span className="text-xs text-slate-500">Фактичні цифри за звітний період</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Complaints Count */}
          <Card className={`border shadow-sm transition-colors ${
            isComplaintsCrit ? 'border-red-200 bg-red-50/15' : 'border-slate-200 bg-white'
          }`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Скарг за 30 днів</CardTitle>
              <Users className="w-4 h-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{metrics.totalComplaints}</div>
              <p className="text-xs text-slate-500 mt-1">за звітний період</p>
            </CardContent>
          </Card>

          {/* Average Risk */}
          <Card className={`border shadow-sm transition-colors ${
            isRiskCrit ? 'border-red-200 bg-red-50/15' : 'border-slate-200 bg-white'
          }`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Середній ризик (0-100)</CardTitle>
              <Activity className={`w-4 h-4 ${isRiskCrit ? 'text-red-600' : 'text-slate-400'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${isRiskCrit ? 'text-red-600' : 'text-slate-600'}`}>
                {metrics.averageRiskScore}
              </div>
              <p className="text-xs text-slate-500 mt-1">індекс загрози за 30 днів</p>
            </CardContent>
          </Card>

          {/* High Risk Count */}
          <Card className={`border shadow-sm transition-colors ${
            isHighRiskCrit ? 'border-red-200 bg-red-50/15' : 'border-slate-200 bg-white'
          }`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Високий ризик (&gt;50)</CardTitle>
              <AlertTriangle className={`w-4 h-4 ${isHighRiskCrit ? 'text-red-600' : 'text-slate-400'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${isHighRiskCrit ? 'text-red-600' : 'text-slate-600'}`}>
                {metrics.highRiskIssuesCount}
              </div>
              <p className="text-xs text-slate-500 mt-1">вимагали реакції за 30 днів</p>
            </CardContent>
          </Card>

          {/* Top Location */}
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Головна локація проблем</CardTitle>
              <MapPin className={`w-4 h-4 ${isRiskCrit ? 'text-red-600' : 'text-slate-400'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-lg font-bold truncate ${isRiskCrit ? 'text-red-600' : 'text-slate-700'}`}>
                {metrics.topLocations[0]?.name || 'Нормально'}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {metrics.topLocations[0] ? `${metrics.topLocations[0].count} скарг за 30 днів` : 'аномалій не виявлено'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. ENTERPRISE RISK METRICS (GREY DEFAULT, RED ONLY WHEN CRITICAL) */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
            <Zap className="w-4 h-4 text-slate-500" />
            Глибокі бізнес-метрики загрози (Enterprise Risk) — Вчора
          </h2>
          <span className="text-xs text-slate-400">Аналіз впливу на LTV, вірусність та аварії</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Churn Intent */}
          <Card className={`border shadow-sm transition-colors ${
            isChurnCrit ? 'border-red-200 bg-red-50/15' : 'border-slate-200 bg-white'
          }`}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-semibold text-slate-600">Індекс відтоку (Churn Intent)</CardTitle>
              <UserX className={`w-4 h-4 ${isChurnCrit ? 'text-red-600' : 'text-slate-400'}`} />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-2xl font-bold ${isChurnCrit ? 'text-red-600' : 'text-slate-600'}`}>
                {metrics.churnIntentRate}%
              </div>
              <p className="text-xs text-slate-500 mt-1">
                <span className="font-semibold text-slate-700">{metrics.churnIntentCount}</span> погроз змінити оператора за 30 днів
              </p>
            </CardContent>
          </Card>

          {/* Resonance / Reach */}
          <Card className={`border shadow-sm transition-colors ${
            isReachCrit ? 'border-red-200 bg-red-50/15' : 'border-slate-200 bg-white'
          }`}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-semibold text-slate-600">Коефіцієнт резонансу (Reach)</CardTitle>
              <Share2 className={`w-4 h-4 ${isReachCrit ? 'text-red-600' : 'text-slate-400'}`} />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-2xl font-bold ${isReachCrit ? 'text-red-600' : 'text-slate-600'}`}>
                {metrics.averageResonance}x
              </div>
              <p className="text-xs text-slate-500 mt-1">
                середня вага джерел за 30 днів
              </p>
            </CardContent>
          </Card>

          {/* Spike Velocity */}
          <Card className={`border shadow-sm transition-colors ${
            isSpikeCrit ? 'border-red-200 bg-red-50/15' : 'border-slate-200 bg-white'
          }`}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-semibold text-slate-600">Spike Velocity (Спалах)</CardTitle>
              <Zap className={`w-4 h-4 ${isSpikeCrit ? 'text-red-600' : 'text-slate-400'}`} />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-2xl font-bold ${isSpikeCrit ? 'text-red-600' : 'text-slate-600'}`}>
                {metrics.spikeVelocityRatio}x
              </div>
              <p className="text-xs text-slate-500 mt-1">
                перевищення місячної норми
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. 30 DAYS DYNAMICS CHART & YESTERDAY TOP LOCATIONS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart of recent 30 days */}
        <Card className="col-span-1 border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Динаміка скарг по днях</span>
              <Badge variant="outline" className="text-[10px] font-normal text-slate-500">
                Останні 30 днів
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Хронологія кількості звернень за останній місяць
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.timelineData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  tickLine={false} 
                  axisLine={false} 
                  tick={{fill: '#888', fontSize: 11}}
                  interval={3}
                />
                <YAxis tickLine={false} axisLine={false} tick={{fill: '#888', fontSize: 12}} />
                <Tooltip 
                  formatter={(val: any) => [val, 'Кількість скарг']}
                  labelFormatter={(label) => `Дата: ${label}`}
                  contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)'}}
                />
                <Line 
                  type="monotone" 
                  dataKey="issuesCount" 
                  stroke="#ef4444" 
                  strokeWidth={2.5} 
                  dot={{r: 3, fill: '#ef4444'}} 
                  activeDot={{r: 5}}
                  name="Кількість скарг" 
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Locations for Yesterday */}
        <Card className="col-span-1 border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Топ проблемних ділянок за 30 днів</CardTitle>
            <CardDescription className="text-xs">
              Локації з найбільшою кількістю звернень за звітний період ({metrics.dateLabel})
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {metrics.topLocations.length > 0 ? (
              <div className="space-y-2.5">
                {metrics.topLocations.map((loc, i) => (
                  <div key={loc.name} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100/70 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs shadow-xs">
                        {i + 1}
                      </div>
                      <span className="font-medium text-slate-800 text-sm">{loc.name}</span>
                    </div>
                    <span className="text-slate-500 text-xs font-semibold bg-slate-200/60 px-2 py-0.5 rounded">
                      {loc.count} {loc.count === 1 ? 'згадка' : loc.count < 5 ? 'згадки' : 'згадок'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 text-sm space-y-2">
                <MapPin className="w-8 h-8 text-slate-300" />
                <p className="font-medium text-slate-600">Локальних аномалій за місяць не виявлено</p>
                <p className="text-xs text-slate-400 max-w-xs">
                  Усі базові станції працювали у штатному режимі
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
