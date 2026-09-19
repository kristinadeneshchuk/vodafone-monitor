'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, BarChart3, Clock, Map, MessageSquare, LogOut, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    document.cookie = 'auth_token=; path=/; max-age=0';
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { name: 'Головна (Overview)', href: '/dashboard', icon: BarChart3 },
    { name: 'Аналіз періодів (Timeline)', href: '/dashboard/timeline', icon: Clock },
    { name: 'Географія проблем', href: '/dashboard/map', icon: Map },
    { name: 'Стрічка повідомлень', href: '/dashboard/feed', icon: MessageSquare },
    { name: 'Доказова аналітика', href: '/dashboard/insights', icon: Activity },
    { name: 'AI Аналітика', href: '/dashboard/analytics', icon: Activity },
  ];

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r flex flex-col">
        <div className="p-6 flex items-center gap-2 text-red-600">
          <ShieldAlert size={28} />
          <span className="text-xl font-bold">ReputationX</span>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <div className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive ? 'bg-red-50 text-red-600 font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}>
                  <item.icon size={20} />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t">
          <Button variant="ghost" className="w-full flex justify-start gap-3 text-slate-600" onClick={handleLogout}>
            <LogOut size={20} />
            Вийти
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b h-16 flex items-center px-8 justify-between">
          <h1 className="text-xl font-semibold text-slate-800">
            {navItems.find(i => i.href === pathname)?.name || 'Дашборд'}
          </h1>
          {/* <div className="flex items-center gap-4">
            <div className="text-sm text-slate-500">
              Аналітика репутаційних ризиків (Проблема покриття)
            </div>
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">
              А
            </div>
          </div> */}
        </header>
        <main className="flex-1 overflow-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
