import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { allocateStat, getStats } from '@/lib/leveling';

export async function POST(req: NextRequest) {
  try {
    const user = requireUser();
    const { stat, amount } = await req.json();
    if (!['str', 'agi', 'vit', 'int_', 'per'].includes(stat)) {
      return NextResponse.json({ error: 'Bad stat' }, { status: 400 });
    }
    allocateStat(user.id, stat, Number(amount) || 1);
    return NextResponse.json({ stats: getStats(user.id) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
