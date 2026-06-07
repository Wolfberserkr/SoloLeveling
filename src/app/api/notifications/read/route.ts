import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const user = requireUser();
    const { id } = await req.json();
    const db = getDb();
    if (id) {
      db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(id, user.id);
    } else {
      db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(user.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
