import { NextRequest, NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { unlockSkill } from '@/lib/skills';

export async function POST(req: NextRequest) {
  try {
    const user = await requireHunter();
    const { skillKey } = await req.json();
    const result = await unlockSkill(user.id, skillKey);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
