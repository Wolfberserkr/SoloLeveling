import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const user = requireUser();
    const db = getDb();
    const rows = db
      .prepare(
        'SELECT id, kind, title, body, created_at, read FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30'
      )
      .all(user.id);
    return NextResponse.json({ notifications: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
