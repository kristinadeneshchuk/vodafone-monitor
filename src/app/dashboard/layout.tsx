'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Activity, 
  BarChart3, 
  Clock, 
  Map, 
  MessageSquare, 
  LogOut, 
  ShieldAlert,
  Menu,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    document.cookie = 'auth_token=; path=/; max-age=0';
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { name: 'Головна', shortName: 'Головна', href: '/dashboard', icon: BarChart3 },
    { name: 'Аналіз періодів', shortName: 'Таймлайн', href: '/dashboard/timeline', icon: Clock },
    { name: 'Географія проблем', shortName: 'Карта', href: '/dashboard/map', icon: Map },
    { name: 'Стрічка повідомлень', shortName: 'Стрічка', href: '/dashboard/feed', icon: MessageSquare },
    { name: 'AI Аналітика', shortName: 'AI Чат', href: '/dashboard/analytics', icon: Activity },
  ];

  return (
    <div className="flex h-screen min-h-[100dvh] bg-slate-100 overflow-hidden">
      {/* ---------------------------------------------------- */}
      {/* 1. DESKTOP SIDEBAR (hidden on mobile, visible on md+)  */}
      {/* ---------------------------------------------------- */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col shrink-0">
        <div className="p-6 flex items-center gap-2 text-red-600">
          <ShieldAlert size={28} />
          <span className="text-xl font-bold tracking-tight">ReputationX</span>
        </div>
        <nav className="flex-1 px-4 space-y-1.5 mt-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                  isActive 
                    ? 'bg-red-50 text-red-600 font-semibold' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}>
                  <item.icon size={19} className="shrink-0" />
                  <span>{item.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-200">
          <Button 
            variant="ghost" 
            className="w-full flex justify-start gap-3 text-slate-600 hover:text-red-600 hover:bg-red-50 cursor-pointer" 
            onClick={handleLogout}
          >
            <LogOut size={19} />
            <span>Вийти</span>
          </Button>
        </div>
      </aside>

      {/* ---------------------------------------------------- */}
      {/* 2. MOBILE SLIDE-OVER DRAWER & BACKDROP               */}
      {/* ---------------------------------------------------- */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" 
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="relative w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-600">
                <ShieldAlert size={24} />
                <span className="text-lg font-bold">ReputationX</span>
              </div>
              <button 
                type="button" 
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                title="Закрити меню"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link 
                    key={item.name} 
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive 
                        ? 'bg-red-50 text-red-600 font-semibold' 
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}>
                      <item.icon size={19} className="shrink-0" />
                      <span>{item.name}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-slate-100">
              <Button 
                variant="ghost" 
                className="w-full flex justify-start gap-3 text-slate-600 hover:text-red-600 hover:bg-red-50 cursor-pointer" 
                onClick={handleLogout}
              >
                <LogOut size={19} />
                <span>Вийти з системи</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 3. MAIN CONTENT WRAPPER                              */}
      {/* ---------------------------------------------------- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 h-14 md:h-16 flex items-center px-4 sm:px-6 md:px-8 justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              title="Відкрити меню навігації"
            >
              <Menu size={22} />
            </button>
            <div className="flex items-center gap-2">
              <div className="md:hidden flex items-center text-red-600 mr-1">
                <ShieldAlert size={20} />
              </div>
              <h1 className="text-base sm:text-lg md:text-xl font-bold text-slate-800 truncate">
                {navItems.find(i => i.href === pathname)?.name || 'Дашборд'}
              </h1>
            </div>
          </div>
        </header>

        {/* Scrollable Main Area (with safe bottom padding for mobile bar) */}
        <main className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 lg:p-8 pb-20 md:pb-8">
          {children}
        </main>

        {/* ---------------------------------------------------- */}
        {/* 4. MOBILE BOTTOM NAVIGATION (Visible on mobile only) */}
        {/* ---------------------------------------------------- */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 flex items-center justify-around h-14 px-1 safe-area-pb shadow-lg">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.name} 
                href={item.href}
                className={`flex flex-col items-center justify-center flex-1 py-1 px-0.5 text-center transition-colors ${
                  isActive ? 'text-red-600 font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <item.icon size={18} className={isActive ? 'text-red-600' : 'text-slate-500'} />
                <span className="text-[10px] mt-0.5 leading-tight truncate max-w-[65px]">
                  {item.shortName}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
