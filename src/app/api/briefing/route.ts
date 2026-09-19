import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { feedbackService } from '@/lib/data/feedback-service';
import { 
  getStoredBriefings, 
  saveStoredBriefing, 
  generateBriefingWithGemini 
} from '@/lib/data/briefing-service';
import type { DashboardMetrics, FeedbackRecord } from '@/lib/data/types';

/** Ключ кешу враховує не лише дату, а й самі цифри. Інакше бриф,
 *  згенерований на старому вікні, і далі підписував нові метрики:
 *  над текстом стояло "7 звернень", а в тексті — "1 звернень". */
function cacheKey(date: string, m: DashboardMetrics) {
  const fingerprint = [date, m.windowStart, m.totalComplaints,
                       m.totalMentions, m.averageRiskScore].join('|');
  return `${date}-${crypto.createHash('sha1').update(fingerprint).digest('hex').slice(0, 8)}`;
}

/** Повідомлення за той самий період, що й метрики, а не за одну добу. */
function periodFeedbacks(all: FeedbackRecord[], m: DashboardMetrics, date: string) {
  const from = m.windowStart ?? date;
  return all.filter(f => {
    const d = f.timestamp.slice(0, 10);
    return d >= from && d <= date;
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const metrics = await feedbackService.getMetrics();
    const date = searchParams.get('date') || metrics.date || '2026-09-18';

    const key = cacheKey(date, metrics);
    const stored = getStoredBriefings();
    if (stored[key]) {
      return NextResponse.json({ briefing: stored[key], cached: true });
    }

    const allFeedbacks = await feedbackService.getFeedbacks();
    const dayFeedbacks = periodFeedbacks(allFeedbacks, metrics, date);

    // Generate fresh briefing via Gemini API
    const briefing = await generateBriefingWithGemini(date, dayFeedbacks, metrics);
    saveStoredBriefing({ ...briefing, date: key });

    return NextResponse.json({ briefing, cached: false });
  } catch (error) {
    console.error('[API /api/briefing GET] Error:', error);
    return NextResponse.json({ error: 'Failed to retrieve or generate briefing' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const metrics = await feedbackService.getMetrics();
    const date = body.date || metrics.date || '2026-09-18';
    const forceRefresh = !!body.forceRefresh;

    const key = cacheKey(date, metrics);
    const stored = getStoredBriefings();
    if (!forceRefresh && stored[key]) {
      return NextResponse.json({ briefing: stored[key], cached: true });
    }

    const allFeedbacks = await feedbackService.getFeedbacks();
    const dayFeedbacks = periodFeedbacks(allFeedbacks, metrics, date);

    // Generate new briefing via Gemini API
    const briefing = await generateBriefingWithGemini(date, dayFeedbacks, metrics);
    saveStoredBriefing({ ...briefing, date: key });

    return NextResponse.json({ briefing, cached: false });
  } catch (error) {
    console.error('[API /api/briefing POST] Error:', error);
    return NextResponse.json({ error: 'Failed to generate briefing' }, { status: 500 });
  }
}
