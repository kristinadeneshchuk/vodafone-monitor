'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Activity, Users, MapPin } from 'lucide-react';
import { feedbackService } from '@/lib/data/feedback-service';
import { DashboardMetrics } from '@/lib/data/types';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';

export default function DashboardOverview() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      const data = await feedbackService.getMetrics();
      setMetrics(data);
      setLoading(false);
    };
    fetchMetrics();
  }, []);

  if (loading || !metrics) {
    return <div className="flex items-center justify-center h-full">Завантаження даних...</div>;
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Всього скарг</CardTitle>
            <Users className="w-4 h-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalComplaints}</div>
            <p className="text-xs text-slate-500 mt-1">за весь період</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Середній ризик (0-100)</CardTitle>
            <Activity className={`w-4 h-4 ${metrics.averageRiskScore > 50 ? 'text-red-500' : 'text-orange-500'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.averageRiskScore}</div>
            <p className="text-xs text-slate-500 mt-1">індекс репутаційної загрози</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Високий ризик (&gt;70)</CardTitle>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metrics.highRiskIssuesCount}</div>
            <p className="text-xs text-slate-500 mt-1">вимагають негайної реакції</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Головна локація проблем</CardTitle>
            <MapPin className="w-4 h-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold truncate">
              {metrics.topLocations[0]?.name || 'Немає даних'}
            </div>
            <p className="text-xs text-slate-500 mt-1">{metrics.topLocations[0]?.count || 0} згадок</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Динаміка скарг по днях</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.timelineData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fill: '#888', fontSize: 12}} />
                <YAxis tickLine={false} axisLine={false} tick={{fill: '#888', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Line type="monotone" dataKey="issuesCount" stroke="#ef4444" strokeWidth={3} dot={{r: 4, fill: '#ef4444'}} name="Кількість скарг" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Locations List */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Топ проблемних ділянок</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metrics.topLocations.map((loc, i) => (
                <div key={loc.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-medium text-sm">
                      {i + 1}
                    </div>
                    <span className="font-medium text-slate-700">{loc.name}</span>
                  </div>
                  <span className="text-slate-500 text-sm">{loc.count} згадок</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
