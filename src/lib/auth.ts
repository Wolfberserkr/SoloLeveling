import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { getDb } from './db';

const COOKIE_NAME = 'sl_session';
const SESSION_DAYS = 30;

export type User = {
  id: number;
  email: string;
  hunter_name: string;
  created_at: number;
};

export async function createUser(email: string, hunterName: string, password: string): Promise<User> {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) throw new Error('A Hunter with that email already exists.');
  const hash = await bcrypt.hash(password, 10);
  const now = Date.now();
  const info = db
    .prepare('INSERT INTO users (email, hunter_name, password_hash, created_at) VALUES (?,?,?,?)')
    .run(email.toLowerCase(), hunterName, hash, now);
  const userId = info.lastInsertRowid as number;
  // Initialise Hunter stats: starts at Rank E, level 1.
  db.prepare(
    'INSERT INTO hunter_stats (user_id, level, xp, rank, str, agi, vit, int_, per, stat_points) VALUES (?, 1, 0, ?, 10, 10, 10, 10, 10, 0)'
  ).run(userId, 'E');
  return { id: userId, email: email.toLowerCase(), hunter_name: hunterName, created_at: now };
}

export async function verifyLogin(email: string, password: string): Promise<User> {
  const db = getDb();
  const row = db
    .prepare('SELECT id, email, hunter_name, password_hash, created_at FROM users WHERE email = ?')
    .get(email.toLowerCase()) as any;
  if (!row) throw new Error('Invalid credentials');
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) throw new Error('Invalid credentials');
  return { id: row.id, email: row.email, hunter_name: row.hunter_name, created_at: row.created_at };
}

export function createSession(userId: number) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, expires);
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(expires),
    path: '/',
  });
}

export function destroySession() {
  const db = getDb();
  const token = cookies().get(COOKIE_NAME)?.value;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  cookies().delete(COOKIE_NAME);
}

export function getCurrentUser(): User | null {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.hunter_name, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
    )
    .get(token) as any;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { id: row.id, email: row.email, hunter_name: row.hunter_name, created_at: row.created_at };
}

export function requireUser(): User {
  const u = getCurrentUser();
  if (!u) throw new Error('UNAUTHORIZED');
  return u;
}
