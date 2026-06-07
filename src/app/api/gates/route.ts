import { NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { activeGate, recentGates, sweepExpiredGates } from '@/lib/gates';

export async function GET() {
  try {
    const user = await requireHunter();
    await sweepExpiredGates(user.id);
    const [active, recent] = await Promise.all([
      activeGate(user.id),
      recentGates(user.id, 10),
    ]);
    return NextResponse.json({ active, recent });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
