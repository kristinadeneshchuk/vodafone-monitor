'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { feedbackService } from '@/lib/data/feedback-service';
import { FeedbackRecord, ImportanceLevel, ProblemType } from '@/lib/data/types';
import { format, parseISO } from 'date-fns';
import { ExternalLink, Search, Filter } from 'lucide-react';

export default function FeedPage() {
  const [feedbacks, setFeedbacks] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [importanceFilter, setImportanceFilter] = useState<string>('all');
  const [problemFilter, setProblemFilter] = useState<string>('all');

  const fetchFeedbacks = async () => {
    setLoading(true);
    let filters: any = {};
    if (importanceFilter !== 'all') filters.importance = [importanceFilter as ImportanceLevel];
    if (problemFilter !== 'all') filters.problemType = [problemFilter as ProblemType];
    
    let data = await feedbackService.getFeedbacks(filters);
    
    // Client-side text search (since our mock service doesn't have it built-in)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(f => 
        f.content.toLowerCase().includes(q) || 
        f.locationName.toLowerCase().includes(q)
      );
    }
    
    setFeedbacks(data);
    setLoading(false);
    setPage(1); // Reset page on new filter
  };

  useEffect(() => {
    fetchFeedbacks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importanceFilter, problemFilter]); // re-fetch when filters change (except search, we'll do search on Enter or button)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFeedbacks();
  };

  const displayedFeedbacks = feedbacks.slice(0, page * itemsPerPage);

  const getImportanceColor = (imp: ImportanceLevel) => {
    switch(imp) {
      case 'critical': return 'bg-red-500 hover:bg-red-600 text-white';
      case 'high': return 'bg-orange-500 hover:bg-orange-600 text-white';
      case 'medium': return 'bg-yellow-500 hover:bg-yellow-600 text-white';
      case 'low': return 'bg-green-500 hover:bg-green-600 text-white';
    }
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 pt-2 pb-2 -mt-2 bg-slate-100">
        <Card className="shadow-md">
          <CardContent className="p-4">
            <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                <Input 
                  placeholder="Пошук за текстом або локацією..." 
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <div className="flex gap-4 w-full md:w-auto">
                <Select value={importanceFilter} onValueChange={(v) => setImportanceFilter(v ?? 'all')}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Важливість" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Усі рівні</SelectItem>
                    <SelectItem value="critical">Критичний</SelectItem>
                    <SelectItem value="high">Високий</SelectItem>
                    <SelectItem value="medium">Середній</SelectItem>
                    <SelectItem value="low">Низький</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={problemFilter} onValueChange={(v) => setProblemFilter(v ?? 'all')}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="w-4 h-4 mr-2" />
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

                <Button type="submit" variant="secondary">Шукати</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white border rounded-xl shadow-sm">
        <div className="p-4 border-b bg-slate-50 flex justify-between items-center text-sm text-slate-500 rounded-t-xl">
          <span>Знайдено записів: {feedbacks.length}</span>
          <span>Показано: {displayedFeedbacks.length}</span>
        </div>
        
        <div className="p-4">
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-10 text-slate-500">Завантаження...</div>
            ) : displayedFeedbacks.length === 0 ? (
              <div className="text-center py-10 text-slate-500">Повідомлень не знайдено</div>
            ) : (
              displayedFeedbacks.map(record => (
                <Card key={record.id} className="overflow-hidden">
                  <div className="p-4 flex flex-col md:flex-row gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getImportanceColor(record.importance)}>
                          {record.importance.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="text-slate-600">
                          {record.problemType}
                        </Badge>
                        <span className="text-sm text-slate-500 ml-auto">
                          {format(parseISO(record.timestamp), 'dd.MM.yyyy HH:mm')}
                        </span>
                      </div>
                      
                      <p className="text-slate-800">{record.content}</p>
                      
                      <div className="flex items-center gap-4 text-sm text-slate-500 pt-2">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-slate-700">Локація:</span> 
                          {record.locationName}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-slate-700">Джерело:</span> 
                          <span className="capitalize">{record.source}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-slate-700">Ризик:</span> 
                          <span className={record.reputationalRiskScore > 50 ? 'text-red-500 font-bold' : ''}>
                            {record.reputationalRiskScore}/100
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col justify-between border-l pl-4 md:w-32">
                      <div className="text-right">
                        <Badge variant={record.isConstructive ? "default" : "secondary"} className="mb-1 w-full justify-center text-xs">
                          {record.isConstructive ? 'Конструктив' : 'Емоції'}
                        </Badge>
                      </div>
                      <a 
                        href={record.originalUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-red-600 hover:text-red-700 text-sm flex items-center justify-end gap-1 mt-auto font-medium"
                      >
                        Джерело <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                </Card>
              ))
            )}
            
            {!loading && displayedFeedbacks.length < feedbacks.length && (
              <div className="flex justify-center pt-4 pb-2">
                <Button variant="outline" onClick={() => setPage(p => p + 1)}>
                  Завантажити ще
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
