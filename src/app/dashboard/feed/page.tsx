'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { feedbackService } from '@/lib/data/feedback-service';
import { FeedbackRecord, ProblemType, SourceType } from '@/lib/data/types';
import { format, parseISO } from 'date-fns';
import { 
  ExternalLink, 
  Search, 
  Filter, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  AlertTriangle,
  Target,
  MapPin,
  UserX,
  Calendar,
  Globe,
  Smartphone
} from 'lucide-react';

type SortField = 'timestamp' | 'reputationalRiskScore' | 'relevanceScore';
type SortOrder = 'asc' | 'desc';

const SOURCE_LABELS: Record<string, string> = {
  all: 'Усі джерела',
  review: 'Google Play',
  telegram: 'Telegram',
  news: 'ЗМІ / Новини',
  twitter: 'Twitter/X',
  facebook: 'Facebook',
};

const PROBLEM_LABELS: Record<string, string> = {
  all: 'Усі проблеми',
  no_signal: 'Немає сигналу',
  slow_internet: 'Повільний інтернет',
  dropped_calls: 'Обриви дзвінків',
  other: 'Інше',
};

const RELEVANCE_LABELS: Record<string, string> = {
  all: 'Уся релевантність',
  true: 'Релевантні (Так)',
  false: 'Нерелевантні (Ні)',
};

const CHURN_LABELS: Record<string, string> = {
  all: 'Усі відгуки',
  true: 'Тільки Churn (погрози)',
};

function FeedPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const dateParam = searchParams.get('date');
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');

  const [activeDate, setActiveDate] = useState<string | null>(dateParam);
  const [activeRange, setActiveRange] = useState<{ start: string; end: string } | null>(
    startDateParam && endDateParam ? { start: startDateParam, end: endDateParam } : null
  );

  useEffect(() => {
    const d = searchParams.get('date');
    const s = searchParams.get('startDate');
    const e = searchParams.get('endDate');
    setActiveDate(d);
    if (s && e) {
      setActiveRange({ start: s, end: e });
    } else {
      setActiveRange(null);
    }
  }, [searchParams]);

  const [feedbacks, setFeedbacks] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const itemsPerPage = 30;

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [problemFilter, setProblemFilter] = useState<string>('all');
  const [relevantFilter, setRelevantFilter] = useState<string>('all');
  const [churnFilter, setChurnFilter] = useState<string>('all');

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const fetchFeedbacks = async () => {
    setLoading(true);
    let filters: any = {};
    if (sourceFilter !== 'all') filters.source = sourceFilter as SourceType;
    if (problemFilter !== 'all') filters.problemType = [problemFilter as ProblemType];
    if (relevantFilter !== 'all') filters.isRelevant = relevantFilter === 'true';
    if (churnFilter !== 'all') filters.churnOnly = churnFilter === 'true';
    
    let data = await feedbackService.getFeedbacks(filters);
    
    // Filter by specific date or range from timeline if present
    if (activeDate) {
      data = data.filter(f => f.timestamp.startsWith(activeDate));
    } else if (activeRange) {
      data = data.filter(f => {
        const day = f.timestamp.slice(0, 10);
        return day >= activeRange.start && day <= activeRange.end;
      });
    }

    // Client-side text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(f => 
        f.content.toLowerCase().includes(q) || 
        f.locationName.toLowerCase().includes(q)
      );
    }
    
    setFeedbacks(data);
    setLoading(false);
    setPage(1);
  };

  useEffect(() => {
    fetchFeedbacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFilter, problemFilter, relevantFilter, churnFilter, activeDate, activeRange]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFeedbacks();
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Sorted list
  const sortedFeedbacks = useMemo(() => {
    return [...feedbacks].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'timestamp') {
        comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } else {
        comparison = (a[sortField] as number) - (b[sortField] as number);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [feedbacks, sortField, sortOrder]);

  const displayedFeedbacks = sortedFeedbacks.slice(0, page * itemsPerPage);

  // Analytics for the filtered sample
  const analytics = useMemo(() => {
    if (feedbacks.length === 0) {
      return { 
        avgRisk: 0, 
        highRiskCount: 0, 
        avgRelevance: 0, 
        topLocation: '-',
        churnCount: 0,
        churnRate: '0.0'
      };
    }
    const total = feedbacks.length;
    const riskyRecords = feedbacks.filter(f => f.reputationalRiskScore > 0);
    const avgRisk = riskyRecords.length > 0 
      ? Math.round(riskyRecords.reduce((acc, f) => acc + f.reputationalRiskScore, 0) / riskyRecords.length) 
      : 0;
    const highRiskCount = feedbacks.filter(f => f.reputationalRiskScore >= 50).length;
    const avgRelevance = (feedbacks.reduce((acc, f) => acc + f.relevanceScore, 0) / total).toFixed(2);
    
    // Намір піти рахується від СКАРГ, а не від усіх згадок: ділити
    // девʼять погроз на 1246 згадок разом із похвалами безглуздо.
    const complaints = feedbacks.filter(f => f.sentiment === 'negative');
    const churnCount = complaints.filter(f => f.churnIntent).length;
    const churnRate = complaints.length > 0
      ? ((churnCount / complaints.length) * 100).toFixed(1) : '0.0';

    // "Топ епіцентр" має показувати місце з найбільшою кількістю ПРОБЛЕМ,
    // інакше туди потрапляє місто, де про оператора найбільше пишуть добре.
    const locationCounts: Record<string, number> = {};
    complaints.forEach(f => {
      if (f.locationName !== 'Невідомо') {
        locationCounts[f.locationName] = (locationCounts[f.locationName] || 0) + 1;
      }
    });
    const topLocation = Object.entries(locationCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Невідомо';

    return { 
      avgRisk, 
      highRiskCount, 
      avgRelevance, 
      topLocation,
      churnCount,
      churnRate
    };
  }, [feedbacks]);

  /**
   * Підпис рядка. Жанр важливіший за тон: "Vodafone попередив про
   * перебої" — переказ офіційної заяви, а не скарга абонента, і
   * підписувати таке словом "скарга" означає рахувати одну подію як
   * сотню незадоволених людей. Клас "змішано" теж окремий: "все супер,
   * але на дачі інтернет поганий" — ні скарга, ні похвала.
   */
  const getToneLabel = (r: FeedbackRecord) =>
    r.genre === 'news' ? 'Новина'
      : r.tone === 'mixed' ? 'Змішано'
      : r.sentiment === 'negative' ? 'Скарга'
      : r.sentiment === 'positive' ? 'Похвала' : 'Нейтрально';

  const getToneClass = (r: FeedbackRecord, size: string) =>
    r.genre === 'news' ? `${size} font-normal text-sky-700 bg-sky-50 border-sky-200`
      : r.tone === 'mixed' ? `${size} font-normal text-amber-700 bg-amber-50 border-amber-200`
      : r.sentiment === 'negative' ? `${size} font-normal text-red-700 bg-red-50 border-red-200`
      : r.sentiment === 'positive' ? `${size} font-normal text-emerald-700 bg-emerald-50 border-emerald-200`
      : `${size} font-normal text-slate-600 bg-slate-50`;

  const getProblemLabel = (problem: ProblemType) => {
    switch(problem) {
      case 'no_signal': return 'Немає сигналу';
      case 'slow_internet': return 'Повільний 4G';
      case 'dropped_calls': return 'Обриви дзвінків';
      case 'other': return 'Інше';
      case 'none': return 'Без проблеми';
    }
  };

  const getExternalUrl = (url: string) => {
    if (!url) return '#';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('play_store_')) {
      const match = url.match(/^play_store_([a-zA-Z0-9._]+)_[a-f0-9-]+$/);
      const appId = match ? match[1] : 'ua.vodafone.myvodafone';
      return `https://play.google.com/store/apps/details?id=${appId}`;
    }
    if (url.startsWith('t.me/') || url.startsWith('telegram.me/')) {
      return `https://${url}`;
    }
    return url;
  };

  const getSourceBadge = (source: string) => {
    switch(source) {
      case 'telegram': return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">Telegram</Badge>;
      case 'twitter': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Twitter/X</Badge>;
      case 'facebook': return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Facebook</Badge>;
      case 'news': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">ЗМІ / Новини</Badge>;
      case 'review':
      case 'play_store':
      case 'google_play':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Google Play</Badge>;
      case 'app_store':
        return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">App Store</Badge>;
      default:
        return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">{source}</Badge>;
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 ml-1 inline text-slate-400 opacity-60" />;
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 ml-1 inline text-red-600" />
      : <ArrowDown className="w-3.5 h-3.5 ml-1 inline text-red-600" />;
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* 1. Static Filter & Sort Toolbar */}
      <div className="flex-none">
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4">
            <form onSubmit={handleSearch} className="flex flex-col gap-4">
              {activeDate && (
                <div className="flex items-center justify-between px-3 py-2 bg-red-50/90 border border-red-200 rounded-lg text-xs text-red-800 font-medium">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-red-600" />
                    <span>Фільтр за дату з таймлайну: <strong>{activeDate}</strong> (знайдено: {feedbacks.length} згадок, з них {feedbacks.filter(f => f.sentiment === 'negative').length} скарг)</span>
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setActiveDate(null);
                      router.push('/dashboard/feed');
                    }} 
                    className="h-6 px-2 text-xs bg-white text-red-700 hover:bg-red-100 border-red-200"
                  >
                    Скинути фільтр дати ✕
                  </Button>
                </div>
              )}
              <div className="flex flex-col md:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Пошук за текстом згадки або локацією..." 
                    className="pl-9 bg-slate-50/50"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full md:w-auto items-center">
                  <Select value={sourceFilter} onValueChange={(val) => { if (val) setSourceFilter(val); }}>
                    <SelectTrigger className="w-full sm:w-[150px] bg-slate-50/50 text-xs">
                      <Globe className="w-3.5 h-3.5 mr-1.5 text-slate-500 shrink-0" />
                      <SelectValue placeholder="Джерело" labelMap={SOURCE_LABELS} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Усі джерела</SelectItem>
                      <SelectItem value="review">Google Play</SelectItem>
                      <SelectItem value="telegram">Telegram</SelectItem>
                      <SelectItem value="news">ЗМІ / Новини</SelectItem>
                      <SelectItem value="twitter">Twitter/X</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={problemFilter} onValueChange={(val) => { if (val) setProblemFilter(val); }}>
                    <SelectTrigger className="w-full sm:w-[160px] bg-slate-50/50 text-xs">
                      <Filter className="w-3.5 h-3.5 mr-1.5 text-slate-500 shrink-0" />
                      <SelectValue placeholder="Тип проблеми" labelMap={PROBLEM_LABELS} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Усі проблеми</SelectItem>
                      <SelectItem value="no_signal">Немає сигналу</SelectItem>
                      <SelectItem value="slow_internet">Повільний інтернет</SelectItem>
                      <SelectItem value="dropped_calls">Обриви дзвінків</SelectItem>
                      <SelectItem value="other">Інше</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={relevantFilter} onValueChange={(val) => { if (val) setRelevantFilter(val); }}>
                    <SelectTrigger className="w-full sm:w-[150px] bg-slate-50/50 text-xs">
                      <Target className="w-3.5 h-3.5 mr-1.5 text-slate-500 shrink-0" />
                      <SelectValue placeholder="Релевантність" labelMap={RELEVANCE_LABELS} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Уся релевантність</SelectItem>
                      <SelectItem value="true">Релевантні (Так)</SelectItem>
                      <SelectItem value="false">Нерелевантні (Ні)</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={churnFilter} onValueChange={(val) => { if (val) setChurnFilter(val); }}>
                    <SelectTrigger className="w-full sm:w-[165px] bg-slate-50/50 text-xs">
                      <UserX className="w-3.5 h-3.5 mr-1.5 text-rose-600 shrink-0" />
                      <SelectValue placeholder="Загроза відтоку" labelMap={CHURN_LABELS} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Усі відгуки</SelectItem>
                      <SelectItem value="true">Тільки Churn (погрози)</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button type="submit" variant="secondary" className="col-span-2 sm:col-span-1 px-4 text-xs h-9">
                    Застосувати
                  </Button>
                </div>
              </div>

              {(sourceFilter !== 'all' || problemFilter !== 'all' || relevantFilter !== 'all' || churnFilter !== 'all') && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                  <span className="text-slate-400 text-[11px]">Активні фільтри:</span>
                  {sourceFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1 bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer text-xs" onClick={() => setSourceFilter('all')}>
                      Джерело: {SOURCE_LABELS[sourceFilter]} ×
                    </Badge>
                  )}
                  {problemFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1 bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer text-xs" onClick={() => setProblemFilter('all')}>
                      Проблема: {PROBLEM_LABELS[problemFilter]} ×
                    </Badge>
                  )}
                  {relevantFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1 bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer text-xs" onClick={() => setRelevantFilter('all')}>
                      Релевантність: {RELEVANCE_LABELS[relevantFilter]} ×
                    </Badge>
                  )}
                  {churnFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1 bg-rose-100 text-rose-800 hover:bg-rose-200 cursor-pointer text-xs" onClick={() => setChurnFilter('all')}>
                      Відтік: {CHURN_LABELS[churnFilter]} ×
                    </Badge>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSourceFilter('all');
                      setProblemFilter('all');
                      setRelevantFilter('all');
                      setChurnFilter('all');
                    }}
                    className="text-[11px] text-red-600 hover:underline ml-1 cursor-pointer"
                  >
                    Скинути всі
                  </button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      {/* 2. Scrollable Body: Analytics Block + Table */}
      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col">
        {/* Info header bar */}
        <div className="flex-none px-6 py-3 border-b bg-slate-50/80 flex flex-wrap justify-between items-center text-xs text-slate-600 rounded-t-xl gap-2">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-slate-800">
              Всього згадок: <span className="text-slate-900">{feedbacks.length}</span>
              {' '}· скарг: <span className="text-red-600">{feedbacks.filter(f => f.sentiment === 'negative').length}</span>
            </span>
            <span>Показано в таблиці: {displayedFeedbacks.length}</span>
          </div>
          <div className="text-slate-500 flex items-center gap-1.5">
            <span>Сортування:</span>
            <Badge variant="outline" className="font-normal bg-white">
              {sortField === 'timestamp' && 'Дата'}
              {sortField === 'reputationalRiskScore' && 'Репутаційний ризик'}
              {sortField === 'relevanceScore' && 'Релевантність'}
              {' '}({sortOrder === 'desc' ? 'спадання' : 'зростання'})
            </Badge>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Deep Analytics Block */}
          {!loading && feedbacks.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <Card className="bg-slate-50/60 border-slate-200 shadow-none">
                <CardContent className="p-3.5">
                  <div className="text-xs text-slate-500 mb-1">Середній ризик</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-xl font-bold ${analytics.avgRisk >= 50 ? 'text-red-600' : 'text-slate-800'}`}>
                      {analytics.avgRisk}
                    </span>
                    <span className="text-xs text-slate-400">/ 100</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-50/60 border-slate-200 shadow-none">
                <CardContent className="p-3.5">
                  <div className="text-xs text-slate-500 mb-1">Високий ризик (≥50)</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold text-red-600">
                      {analytics.highRiskCount}
                    </span>
                    <span className="text-xs text-slate-400">
                      ({((analytics.highRiskCount / Math.max(feedbacks.length, 1)) * 100).toFixed(1)}%)
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-rose-50/40 border-rose-200 shadow-none">
                <CardContent className="p-3.5">
                  <div className="text-xs text-rose-700 font-medium mb-1 flex items-center gap-1">
                    <UserX className="w-3 h-3 text-rose-600" /> Ризик Churn
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-rose-700">
                      {analytics.churnRate}%
                    </span>
                    <span className="text-xs text-rose-400">({analytics.churnCount})</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-50/60 border-slate-200 shadow-none">
                <CardContent className="p-3.5">
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Target className="w-3 h-3 text-slate-400" /> Релевантність
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-blue-600">
                      {analytics.avgRelevance}
                    </span>
                    <span className="text-xs text-slate-400">/ 1.0</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-50/60 border-slate-200 shadow-none col-span-2 md:col-span-1 lg:col-span-1">
                <CardContent className="p-3.5">
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" /> Топ епіцентр
                  </div>
                  <div className="text-sm font-bold text-slate-800 truncate" title={analytics.topLocation}>
                    {analytics.topLocation}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Table Container for Desktop + Mobile Cards List */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            {loading ? (
              <div className="text-center py-16 text-slate-500 text-sm">Завантаження та фільтрація даних...</div>
            ) : displayedFeedbacks.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-sm">Повідомлень не знайдено за заданими критеріями</div>
            ) : (
              <>
                {/* 1. Mobile Feed Cards (Visible on screens < md) */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {displayedFeedbacks.map((record) => (
                    <div key={record.id} className="p-3.5 space-y-2.5 hover:bg-slate-50/70 transition-colors">
                      {/* Top Header Row */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {getSourceBadge(record.source)}
                          <span className="text-[11px] font-mono text-slate-400">
                            {format(parseISO(record.timestamp), 'dd.MM.yy HH:mm')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge 
                            className={`text-[10px] px-1.5 py-0 font-bold ${
                              record.reputationalRiskScore >= 50
                                ? 'bg-red-500 text-white'
                                : record.reputationalRiskScore >= 30
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            Ризик {record.reputationalRiskScore}
                          </Badge>
                          <a 
                            href={getExternalUrl(record.originalUrl)} 
                            target="_blank" 
                            rel="noreferrer"
                            className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                            title="Відкрити джерело"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      {/* Badges Row */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge variant="outline" className={
                          getToneClass(record, 'text-[10px] py-0')
                        }>
                          {getToneLabel(record)}
                        </Badge>
                        {record.problemType !== 'none' && (
                          <Badge variant="outline" className="text-[10px] py-0 font-normal text-slate-700 bg-slate-50">
                            {getProblemLabel(record.problemType)}
                          </Badge>
                        )}
                        {record.churnIntent && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            <UserX className="w-2.5 h-2.5" /> Churn
                          </span>
                        )}
                      </div>

                      {/* Message Content */}
                      <p className="text-xs text-slate-800 leading-relaxed font-normal">
                        {record.content}
                      </p>

                      {/* Footer Row */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                        <span className="flex items-center gap-1 truncate max-w-[180px]">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{record.locationName}</span>
                        </span>
                        <span className="text-[10px] text-blue-600 font-medium">
                          {record.isRelevant ? `Покриття (${record.relevanceScore.toFixed(2)})` : 'Інша тема'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 2. Desktop Table (Visible on md+) */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50/80">
                      <TableRow>
                        <TableHead 
                          className="cursor-pointer hover:bg-slate-100 transition-colors w-[150px]"
                          onClick={() => handleSort('timestamp')}
                        >
                          Дата & Джерело {renderSortIndicator('timestamp')}
                        </TableHead>
                        <TableHead className="w-[180px]">Локація</TableHead>
                        <TableHead className="w-[140px]">Проблема</TableHead>
                        <TableHead className="min-w-[320px]">Повідомлення</TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-slate-100 transition-colors text-right w-[110px]"
                          onClick={() => handleSort('relevanceScore')}
                        >
                          До покриття (0-1) {renderSortIndicator('relevanceScore')}
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-slate-100 transition-colors text-right w-[110px]"
                          onClick={() => handleSort('reputationalRiskScore')}
                        >
                          Ризик (0-100) {renderSortIndicator('reputationalRiskScore')}
                        </TableHead>
                        <TableHead className="text-center w-[70px]">Джерело</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedFeedbacks.map((record) => (
                        <TableRow key={record.id} className="hover:bg-slate-50/60 transition-colors">
                          {/* Date & Source */}
                          <TableCell className="align-top py-3">
                            <div className="space-y-1">
                              <div className="text-xs text-slate-500">
                                {format(parseISO(record.timestamp), 'dd.MM.yy HH:mm')}
                              </div>
                              <div>{getSourceBadge(record.source)}</div>
                            </div>
                          </TableCell>

                          {/* Location */}
                          <TableCell className="align-top py-3 font-medium text-slate-700 text-xs">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[160px]" title={record.locationName}>
                                {record.locationName}
                              </span>
                            </div>
                          </TableCell>

                          {/* Problem Type */}
                          <TableCell className="align-top py-3">
                            <div className="flex flex-col gap-1 items-start">
                              <Badge variant="outline"
                                     className={getToneClass(record, 'text-xs')}>
                                {getToneLabel(record)}
                              </Badge>
                              {record.problemType !== 'none' && (
                                <Badge variant="outline" className="text-xs font-normal text-slate-700 bg-slate-50">
                                  {getProblemLabel(record.problemType)}
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          {/* Message Content */}
                          <TableCell className="align-top py-3">
                            <p className="text-xs text-slate-800 leading-relaxed max-w-xl whitespace-normal">
                              {record.content}
                              {record.churnIntent && (
                                <span className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  <UserX className="w-2.5 h-2.5" /> Churn
                                </span>
                              )}
                            </p>
                          </TableCell>

                          {/* Relevance Score (0 - 1) */}
                          <TableCell className="align-top py-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <Badge 
                                variant="outline" 
                                className={record.isRelevant ? "text-[10px] py-0 px-1.5 border-blue-200 bg-blue-50 text-blue-700" : "text-[10px] py-0 px-1.5 border-slate-200 text-slate-400"}
                              >
                                {record.isRelevant ? "Про покриття" : "Інша тема"}
                              </Badge>
                              <div className="inline-flex items-center gap-1.5">
                                <span className="font-semibold text-xs text-blue-700">
                                  {record.relevanceScore.toFixed(2)}
                                </span>
                                <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                                  <div 
                                    className="h-full bg-blue-500 rounded-full" 
                                    style={{ width: `${Math.round(record.relevanceScore * 100)}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          {/* Risk Score (0 - 100) */}
                          <TableCell className="align-top py-3 text-right">
                            <Badge 
                              className={`text-xs font-bold ${
                                record.reputationalRiskScore >= 50
                                  ? 'bg-red-500 text-white hover:bg-red-600'
                                  : record.reputationalRiskScore >= 30
                                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              }`}
                            >
                              {record.reputationalRiskScore}
                            </Badge>
                          </TableCell>

                          {/* External Link */}
                          <TableCell className="align-top py-3 text-center">
                            <a 
                              href={getExternalUrl(record.originalUrl)} 
                              target="_blank" 
                              rel="noreferrer"
                              className="inline-flex p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                              title={record.source === 'review' || record.originalUrl?.startsWith('play_store_') ? "Відкрити додаток у Google Play" : "Відкрити оригінал"}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>

          {/* Load More Button */}
          {!loading && displayedFeedbacks.length < sortedFeedbacks.length && (
            <div className="flex justify-center pt-2 pb-6">
              <Button 
                variant="outline" 
                onClick={() => setPage(p => p + 1)}
                className="px-6 shadow-sm hover:bg-slate-50"
              >
                Завантажити ще ({sortedFeedbacks.length - displayedFeedbacks.length} залишилось)
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-500">Завантаження стрічки...</div>}>
      <FeedPageContent />
    </Suspense>
  );
}
