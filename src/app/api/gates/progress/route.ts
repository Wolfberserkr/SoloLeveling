import { NextRequest, NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { activeGate, progressActiveGate } from '@/lib/gates';

// Manual progress logging for the dashboard gate banner — used when the
// player's progress isn't naturally mirrored from a daily quest or workout
// (e.g. an active 'run' gate without a parallel daily-quest log call).
export async function POST(req: NextRequest) {
  try {
    const user = await requireHunter();
    const { amount } = await req.json();
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Bad amount' }, { status: 400 });
    }
    const gate = await activeGate(user.id);
    if (!gate) return NextResponse.json({ error: 'No active gate' }, { status: 404 });
    const result = await progressActiveGate(user.id, gate.mirrors || '', amount);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
