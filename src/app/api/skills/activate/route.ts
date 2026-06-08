import { NextRequest, NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { useSkill } from '@/lib/skills';

export async function POST(req: NextRequest) {
  try {
    const user = await requireHunter();
    const { skillKey, args } = await req.json();
    const result = await useSkill(user.id, skillKey, args);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
