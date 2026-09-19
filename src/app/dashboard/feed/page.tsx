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
  Sparkles,
  MapPin,
  UserX,
  Share2,
  Calendar
} from 'lucide-react';

type SortField = 'timestamp' | 'reputationalRiskScore' | 'relevanceScore' | 'constructivenessScore';
type SortOrder = 'asc' | 'desc';

function FeedPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const dateParam = searchParams.get('date');
  const [activeDate, setActiveDate] = useState<string | null>(dateParam);

  useEffect(() => {
    setActiveDate(searchParams.get('date'));
  }, [searchParams]);

  const [feedbacks, setFeedbacks] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const itemsPerPage = 30;

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [problemFilter, setProblemFilter] = useState<string>('all');
  const [relevantFilter, setRelevantFilter] = useState<string>('all');
  const [constructiveFilter, setConstructiveFilter] = useState<string>('all');
  const [churnFilter, setChurnFilter] = useState<string>('all');

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const fetchFeedbacks = async () => {
    setLoading(true);
    let filters: any = {};
    if (problemFilter !== 'all') filters.problemType = [problemFilter as ProblemType];
    if (relevantFilter !== 'all') filters.isRelevant = relevantFilter === 'true';
    if (constructiveFilter !== 'all') filters.isConstructive = constructiveFilter === 'true';
    if (churnFilter !== 'all') filters.churnOnly = churnFilter === 'true';
    
    let data = await feedbackService.getFeedbacks(filters);
    
    // Filter by specific date from timeline if present
    if (activeDate) {
      data = data.filter(f => f.timestamp.startsWith(activeDate));
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
  }, [problemFilter, relevantFilter, constructiveFilter, churnFilter, activeDate]);

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
        avgConstructiveness: 0, 
        topLocation: '-',
        churnCount: 0,
        churnRate: '0.0',
        avgResonance: '0.0'
      };
    }
    const total = feedbacks.length;
    const riskyRecords = feedbacks.filter(f => f.reputationalRiskScore > 0);
    const avgRisk = riskyRecords.length > 0 
      ? Math.round(riskyRecords.reduce((acc, f) => acc + f.reputationalRiskScore, 0) / riskyRecords.length) 
      : 0;
    const highRiskCount = feedbacks.filter(f => f.reputationalRiskScore >= 50).length;
    const avgRelevance = (feedbacks.reduce((acc, f) => acc + f.relevanceScore, 0) / total).toFixed(2);
    const avgConstructiveness = (feedbacks.reduce((acc, f) => acc + f.constructivenessScore, 0) / total).toFixed(2);
    
    // Намір піти рахується від СКАРГ, а не від усіх згадок: ділити
    // девʼять погроз на 1246 згадок разом із похвалами безглуздо.
    const complaints = feedbacks.filter(f => f.sentiment === 'negative');
    const churnCount = complaints.filter(f => f.churnIntent).length;
    const churnRate = complaints.length > 0
      ? ((churnCount / complaints.length) * 100).toFixed(1) : '0.0';
    const totalResonance = feedbacks.reduce((acc, f) => acc + (f.resonance ?? (f.relevanceScore * (f.reachWeight ?? 1))), 0);
    const avgResonance = (totalResonance / (total || 1)).toFixed(1);

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
      avgConstructiveness, 
      topLocation,
      churnCount,
      churnRate,
      avgResonance
    };
  }, [feedbacks]);

  const getProblemLabel = (problem: ProblemType) => {
    switch(problem) {
      case 'no_signal': return 'Немає сигналу';
      case 'slow_internet': return 'Повільний 4G';
      case 'dropped_calls': return 'Обриви дзвінків';
      case 'other': return 'Інше';
    }
  };

  const getSourceBadge = (source: SourceType) => {
    switch(source) {
      case 'telegram': return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">Telegram</Badge>;
      case 'twitter': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Twitter/X</Badge>;
      case 'facebook': return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Facebook</Badge>;
      case 'news': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">ЗМІ / Новини</Badge>;
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
                
                <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
                  <Select value={problemFilter} onValueChange={(val) => { if (val) setProblemFilter(val); }}>
                    <SelectTrigger className="w-[170px] bg-slate-50/50">
                      <Filter className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                      <SelectValue placeholder="Тип проблеми" />
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
                    <SelectTrigger className="w-[170px] bg-slate-50/50">
                      <Target className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                      <SelectValue placeholder="Релевантність" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Уся релевантність</SelectItem>
                      <SelectItem value="true">Релевантні (Так)</SelectItem>
                      <SelectItem value="false">Нерелевантні (Ні)</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={constructiveFilter} onValueChange={(val) => { if (val) setConstructiveFilter(val); }}>
                    <SelectTrigger className="w-[180px] bg-slate-50/50">
                      <Sparkles className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                      <SelectValue placeholder="Конструктивність" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Будь-який відгук</SelectItem>
                      <SelectItem value="true">Конструктивні (Так)</SelectItem>
                      <SelectItem value="false">Емоційні / Без фактів</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={churnFilter} onValueChange={(val) => { if (val) setChurnFilter(val); }}>
                    <SelectTrigger className="w-[170px] bg-slate-50/50">
                      <UserX className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
                      <SelectValue placeholder="Загроза відтоку" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Усі відгуки</SelectItem>
                      <SelectItem value="true">🚨 Тільки Churn (погрози)</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button type="submit" variant="secondary" className="px-4">
                    Застосувати
                  </Button>
                </div>
              </div>
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
              {sortField === 'constructivenessScore' && 'Конструктивність'}
              {' '}({sortOrder === 'desc' ? 'спадання' : 'зростання'})
            </Badge>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Deep Analytics Block */}
          {!loading && feedbacks.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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

              <Card className="bg-blue-50/30 border-blue-200 shadow-none">
                <CardContent className="p-3.5">
                  <div className="text-xs text-blue-700 font-medium mb-1 flex items-center gap-1">
                    <Share2 className="w-3 h-3 text-blue-600" /> Сер. резонанс
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-blue-700">
                      {analytics.avgResonance}x
                    </span>
                    <span className="text-xs text-blue-400">охоплення</span>
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

              <Card className="bg-slate-50/60 border-slate-200 shadow-none">
                <CardContent className="p-3.5">
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-slate-400" /> Конструктив
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-emerald-600">
                      {analytics.avgConstructiveness}
                    </span>
                    <span className="text-xs text-slate-400">/ 1.0</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-50/60 border-slate-200 shadow-none col-span-2 md:col-span-1">
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

          {/* Table Container */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {loading ? (
              <div className="text-center py-16 text-slate-500">Завантаження та фільтрація даних...</div>
            ) : displayedFeedbacks.length === 0 ? (
              <div className="text-center py-16 text-slate-500">Повідомлень не знайдено за заданими критеріями</div>
            ) : (
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
                      Релев. (0-1) {renderSortIndicator('relevanceScore')}
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-slate-100 transition-colors text-right w-[120px]"
                      onClick={() => handleSort('constructivenessScore')}
                    >
                      Констр. (0-1) {renderSortIndicator('constructivenessScore')}
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
                        <Badge variant="outline" className="text-xs font-normal text-slate-700 bg-slate-50">
                          {getProblemLabel(record.problemType)}
                        </Badge>
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
                          {Boolean(record.resonance && record.resonance > 0) && (
                            <span className="inline-flex items-center gap-1 ml-1.5 px-1 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200" title="Коефіцієнт резонансу / вага джерела">
                              <Share2 className="w-2.5 h-2.5" /> {record.resonance?.toFixed(1)}x
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
                            {record.isRelevant ? "Релев." : "Нерелев."}
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

                      {/* Constructiveness Score (0 - 1) */}
                      <TableCell className="align-top py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <Badge 
                            variant="outline" 
                            className={record.isConstructive ? "text-[10px] py-0 px-1.5 border-emerald-200 bg-emerald-50 text-emerald-700" : "text-[10px] py-0 px-1.5 border-slate-200 text-slate-400"}
                          >
                            {record.isConstructive ? "Конструктив" : "Емоції"}
                          </Badge>
                          <div className="inline-flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-emerald-700">
                              {record.constructivenessScore.toFixed(2)}
                            </span>
                            <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                              <div 
                                className="h-full bg-emerald-500 rounded-full" 
                                style={{ width: `${Math.round(record.constructivenessScore * 100)}%` }}
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
                          href={record.originalUrl} 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-flex p-1 text-slate-400 hover:text-red-600 transition-colors"
                          title="Відкрити оригінал"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
