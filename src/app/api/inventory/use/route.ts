import { NextRequest, NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { applyPowerUp } from '@/lib/powerups';

export async function POST(req: NextRequest) {
  try {
    const user = await requireHunter();
    const { key, target } = await req.json();
    const result = await applyPowerUp(user.id, key, target);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
