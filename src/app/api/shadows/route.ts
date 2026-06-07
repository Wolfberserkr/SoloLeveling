import { NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { listArmy, totalArmyPower } from '@/lib/shadows';

export async function GET() {
  try {
    const user = await requireHunter();
    const army = await listArmy(user.id);
    return NextResponse.json({ army, totalPower: totalArmyPower(army) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
