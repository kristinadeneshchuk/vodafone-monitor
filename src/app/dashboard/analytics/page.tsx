'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  RotateCcw, 
  Copy, 
  Check, 
  TrendingUp, 
  Zap, 
  MapPin, 
  Users, 
  ShieldAlert, 
  Database,
  ArrowRight
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  source?: string;
}

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome-msg',
  role: 'model',
  content: `🎯 **Вітаю. Я AI-аналітик ризиків та прогнозування Vodafone Україна.**

Підключено повну базу моніторингу за **2025–2026 роки** (1 051 верифікована згадка, телеметрія блекаутів, дані щодо Київстар та lifecell, Churn-сигнали).

Готовий надавати чітку аналітику, перевірені цифри та прогнози **ПА ДЄЛУ**. Оберіть швидке питання вище або запитайте про будь-який аспект мережі чи репутації бренду.`,
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  source: 'gemini-3.6-flash'
};

const PRESET_QUERIES = [
  {
    icon: TrendingUp,
    label: '🔮 Прогноз відтоку (Churn)',
    query: 'Який поточний ризик відтоку абонентів (Churn)? Зроби чіткий прогноз на наступний місяць: хто піде і до кого?'
  },
  {
    icon: Zap,
    label: '⚡ Ризики блекаутів та зими',
    query: 'Проаналізуй ризики зимових блекаутів. Що станеться з мережею, якщо світла не буде понад 4 години? Дай прогноз по містах.'
  },
  {
    icon: MapPin,
    label: '📍 Епіцентри та хронічні зони',
    query: 'Які топ проблемні локації за рік? Де зафіксовано хронічні деградаційні проблеми і де чекати наступний сплеск?'
  },
  {
    icon: Users,
    label: '🥊 Vodafone vs Київстар та lifecell',
    query: 'Як виглядає репутація Vodafone у порівнянні з Київстар та lifecell у скаргах користувачів? Хто лідирує за стійкістю?'
  },
  {
    icon: ShieldAlert,
    label: '🚨 Прогноз медійної кризи',
    query: 'Які інциденти мають найвищу ймовірність медіа-ескалації та потрапляння у великі Telegram-канали? Що робити PR прямо зараз?'
  },
];

export default function AnalyticsPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputValue('');
    setLoading(true);

    try {
      // Build conversation history excluding welcome message
      const history = newMessages
        .filter(m => m.id !== 'welcome-msg')
        .map(m => ({
          role: m.role,
          content: m.content
        }));

      const res = await fetch('/api/analytics/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history })
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();

      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'model',
        content: data.reply || 'Не вдалося сформувати відповідь. Спробуйте ще раз.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: data.source || 'gemini-3.6-flash'
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      console.error('[Analytics Chat] Error sending message:', err);
      const errorMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        content: '⚠️ Виникла технічна затримка зв’язку із сервером аналітики. Будь ласка, надішліть запит повторно.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearChat = () => {
    setMessages([INITIAL_MESSAGE]);
    setInputValue('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] space-y-4">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-red-600" />
              AI Аналітика & Прогнози
            </h1>
            <Badge className="bg-red-600 text-white font-bold text-[10px] px-2 py-0.5">
              Gemini 3.6 Flash
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Інтерактивний аналітичний чат із доступом до всієї річної бази моніторингу Vodafone, блекаутів та прогнозних моделей
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs bg-slate-50 border-slate-200 text-slate-600 gap-1.5 py-1 px-3">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span>База: <b>1 051 запис</b> (вересень 2025 – вересень 2026)</span>
          </Badge>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleClearChat}
            className="h-8 text-xs gap-1.5 text-slate-600 hover:text-slate-900 border-slate-200 cursor-pointer"
            title="Очистити історію діалогу"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Очистити
          </Button>
        </div>
      </div>

      {/* Quick Questions Horizon Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
        <span className="text-slate-400 text-[11px] font-medium mr-1 shrink-0 flex items-center gap-1">
          Швидкі прогнози:
        </span>
        {PRESET_QUERIES.map((preset, idx) => {
          const Icon = preset.icon;
          return (
            <button
              key={idx}
              type="button"
              disabled={loading}
              onClick={() => handleSendMessage(preset.query)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-700 text-slate-700 font-medium whitespace-nowrap transition-all shadow-2xs text-xs cursor-pointer disabled:opacity-50"
            >
              <Icon className="w-3 h-3 text-red-600 shrink-0" />
              <span>{preset.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Chat Log Area */}
      <Card className="flex-1 flex flex-col min-h-0 border-slate-200 shadow-sm bg-slate-50/40 rounded-xl overflow-hidden">
        <CardContent className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.map((msg) => {
            const isAI = msg.role === 'model';
            return (
              <div 
                key={msg.id} 
                className={`flex gap-3 max-w-[90%] md:max-w-[82%] ${isAI ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
              >
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-2xs ${
                  isAI 
                    ? 'bg-red-600 text-white' 
                    : 'bg-slate-800 text-white'
                }`}>
                  {isAI ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>

                {/* Message Body */}
                <div className="space-y-1.5">
                  <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-2xs ${
                    isAI 
                      ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs' 
                      : 'bg-red-600 text-white font-medium rounded-tr-xs'
                  }`}>
                    {isAI ? (
                      <div className="whitespace-pre-line space-y-2">
                        {msg.content.split('\n\n').map((paragraph, pIdx) => {
                          // Handle bold headings or bullet points cleanly
                          return (
                            <p key={pIdx} className="leading-relaxed">
                              {paragraph}
                            </p>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="whitespace-pre-line">{msg.content}</p>
                    )}
                  </div>

                  {/* Metadata and Actions */}
                  <div className={`flex items-center gap-2 text-[11px] text-slate-400 px-1 ${isAI ? 'justify-start' : 'justify-end'}`}>
                    <span>{msg.timestamp}</span>
                    {isAI && msg.source && (
                      <>
                        <span>·</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {msg.source === 'gemini-3.6-flash' ? 'Gemini 3.6 Flash' : 'Аналітичний рушій'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="hover:text-slate-700 ml-1 inline-flex items-center gap-1 cursor-pointer transition-colors"
                          title="Скопіювати відповідь"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedId === msg.id ? 'Скопійовано' : 'Копіювати'}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-3 max-w-[85%] mr-auto">
              <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200 rounded-tl-xs shadow-2xs space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <Sparkles className="w-3.5 h-3.5 text-red-600 animate-spin" />
                  <span>Gemini аналізує вибірку та генерує прогноз...</span>
                </div>
                <div className="flex gap-1.5 items-center pl-1 py-1">
                  <div className="w-2 h-2 rounded-full bg-red-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-red-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-red-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </CardContent>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-slate-200">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Поставте аналітичне запитання або запитайте про прогноз (напр: 'Що чекати від відтоку взимку?')..."
              disabled={loading}
              className="flex-1 bg-slate-50/60 border-slate-200 text-sm focus-visible:ring-red-600 h-10"
            />
            <Button 
              type="submit" 
              disabled={loading || !inputValue.trim()}
              className="bg-red-600 hover:bg-red-700 text-white h-10 px-4 font-semibold gap-1.5 shadow-sm cursor-pointer shrink-0 disabled:opacity-50"
            >
              <span>Запитати</span>
              <Send className="w-3.5 h-3.5" />
            </Button>
          </form>
          <div className="flex justify-between items-center px-1 pt-2 text-[11px] text-slate-400">
            <span>Натисніть Enter для відправки запиту</span>
            <span className="text-slate-400">Спирається на 100% реальних даних вибірки Vodafone (2025–2026)</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
