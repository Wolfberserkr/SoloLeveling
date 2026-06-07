import { NextRequest, NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { logQuestProgress } from '@/lib/quests';

export async function POST(req: NextRequest) {
  try {
    const user = await requireHunter();
    const { key, amount } = await req.json();
    if (!key || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Bad input' }, { status: 400 });
    }
    const result = await logQuestProgress(user.id, key, amount);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
