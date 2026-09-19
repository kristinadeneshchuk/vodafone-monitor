'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { feedbackService } from '@/lib/data/feedback-service';
import { DashboardMetrics } from '@/lib/data/types';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { Slider } from '@/components/ui/slider';

export default function TimelinePage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Slider values representing "days ago". 0 means today, 30 means 30 days ago.
  // We allow selecting a range, e.g. [30, 0]
  const [daysRange, setDaysRange] = useState<[number, number]>([30, 0]);
  
  const fetchMetrics = async (range: [number, number]) => {
    setLoading(true);
    const now = new Date();
    // range[0] is start (e.g. 30 days ago), range[1] is end (e.g. 0 days ago)
    const startDate = startOfDay(subDays(now, range[0])).toISOString();
    const endDate = endOfDay(subDays(now, range[1])).toISOString();

    const data = await feedbackService.getMetrics({ startDate, endDate });
    setMetrics(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchMetrics(daysRange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSliderChange = (value: number[]) => {
    if (value.length === 2) {
      // Reversing values because the slider goes left to right (0 to 30), 
      // but we want left to be '30 days ago' and right to be 'today (0)'
      // Wait, shadcn slider usually supports ranges natively.
      const newRange = [30 - value[0], 30 - value[1]] as [number, number];
      setDaysRange(newRange);
      fetchMetrics(newRange);
    }
  };

  // Convert daysRange to slider value (0 to 30)
  const sliderValue = [30 - daysRange[0], 30 - daysRange[1]];

  const formatDateLabel = (daysAgo: number) => {
    if (daysAgo === 0) return 'Сьогодні';
    if (daysAgo === 1) return 'Вчора';
    return format(subDays(new Date(), daysAgo), 'dd.MM');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Аналіз періодів</CardTitle>
          <p className="text-sm text-slate-500">
            Оберіть проміжок часу для аналізу репутаційних ризиків. 
            Вибрано: {formatDateLabel(daysRange[0])} — {formatDateLabel(daysRange[1])}
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="px-4">
            <Slider 
              defaultValue={[0, 30]} 
              value={sliderValue}
              max={30} 
              step={1} 
              onValueChange={handleSliderChange}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-2">
              <span>30 днів тому</span>
              <span>Сьогодні</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {!loading && metrics ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="col-span-1 lg:col-span-2">
             <CardHeader>
               <CardTitle>Розподіл скарг за обраний період</CardTitle>
             </CardHeader>
             <CardContent className="h-[300px]">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={metrics.timelineData}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} />
                   <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fill: '#888', fontSize: 12}} />
                   <YAxis tickLine={false} axisLine={false} tick={{fill: '#888', fontSize: 12}} />
                   <Tooltip 
                     contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                   />
                   <Bar dataKey="issuesCount" fill="#ef4444" radius={[4, 4, 0, 0]} name="Кількість скарг" />
                 </BarChart>
               </ResponsiveContainer>
             </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Загальна статистика за період</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-600">Всього згадок:</span>
                <span className="font-bold text-lg">{metrics.totalComplaints}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-600">Середній ризик:</span>
                <span className={`font-bold text-lg ${metrics.averageRiskScore > 50 ? 'text-red-600' : 'text-orange-500'}`}>
                  {metrics.averageRiskScore} / 100
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg text-red-700">
                <span>Критичних проблем:</span>
                <span className="font-bold text-lg">{metrics.criticalIssuesCount}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Тональність повідомлень</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Негативні ({metrics.sentimentDistribution.negative})</span>
                    <span className="font-medium">{Math.round(metrics.sentimentDistribution.negative / (metrics.totalComplaints || 1) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500" style={{width: `${metrics.sentimentDistribution.negative / (metrics.totalComplaints || 1) * 100}%`}}></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Нейтральні ({metrics.sentimentDistribution.neutral})</span>
                    <span className="font-medium">{Math.round(metrics.sentimentDistribution.neutral / (metrics.totalComplaints || 1) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-400" style={{width: `${metrics.sentimentDistribution.neutral / (metrics.totalComplaints || 1) * 100}%`}}></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Позитивні ({metrics.sentimentDistribution.positive})</span>
                    <span className="font-medium">{Math.round(metrics.sentimentDistribution.positive / (metrics.totalComplaints || 1) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500" style={{width: `${metrics.sentimentDistribution.positive / (metrics.totalComplaints || 1) * 100}%`}}></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex items-center justify-center h-64 text-slate-500">Завантаження аналітики...</div>
      )}
    </div>
  );
}
