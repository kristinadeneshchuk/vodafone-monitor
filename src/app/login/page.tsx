'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate login by setting a cookie
    document.cookie = "auth_token=true; path=/; max-age=86400"; // 1 day
    router.push('/dashboard');
    router.refresh(); // to trigger middleware re-eval if needed
  };

  return (
    <div className="flex items-center justify-center min-h-screen min-h-[100dvh] bg-slate-50 p-4">
      <Card className="w-full max-w-[400px] shadow-sm border-slate-200">
        <CardHeader>
          <CardTitle>Вхід у систему</CardTitle>
          <CardDescription>Дашборд аналізу репутаційних ризиків</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="username">Логін</label>
              <Input 
                id="username" 
                placeholder="Введіть логін" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password">Пароль</label>
              <Input 
                id="password" 
                type="password"
                placeholder="Введіть пароль" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">Увійти</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
