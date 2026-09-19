import { NextRequest, NextResponse } from 'next/server';
import { feedbackService } from '@/lib/data/feedback-service';
import { 
  getStoredBriefings, 
  saveStoredBriefing, 
  generateBriefingWithGemini 
} from '@/lib/data/briefing-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const metrics = await feedbackService.getMetrics();
    const date = searchParams.get('date') || metrics.date || '2026-09-18';

    const stored = getStoredBriefings();
    if (stored[date]) {
      return NextResponse.json({ briefing: stored[date], cached: true });
    }

    // Get feedbacks for this day
    const allFeedbacks = await feedbackService.getFeedbacks();
    const dayFeedbacks = allFeedbacks.filter(f => f.timestamp.startsWith(date));

    // Generate fresh briefing via Gemini API
    const briefing = await generateBriefingWithGemini(date, dayFeedbacks, metrics);
    saveStoredBriefing(briefing);

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

    const stored = getStoredBriefings();
    if (!forceRefresh && stored[date]) {
      return NextResponse.json({ briefing: stored[date], cached: true });
    }

    const allFeedbacks = await feedbackService.getFeedbacks();
    const dayFeedbacks = allFeedbacks.filter(f => f.timestamp.startsWith(date));

    // Generate new briefing via Gemini API
    const briefing = await generateBriefingWithGemini(date, dayFeedbacks, metrics);
    saveStoredBriefing(briefing);

    return NextResponse.json({ briefing, cached: false });
  } catch (error) {
    console.error('[API /api/briefing POST] Error:', error);
    return NextResponse.json({ error: 'Failed to generate briefing' }, { status: 500 });
  }
}
