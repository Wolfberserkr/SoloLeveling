import { createClient } from '@supabase/supabase-js';

// Defaults target the live project; the anon key is public by design (it
// ships in the browser bundle either way) — RLS is what protects the data.
const DEFAULT_URL = 'https://npqpzzarohlvexqpqurg.supabase.co';
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wcXB6emFyb2hsdmV4cXBxdXJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3ODY2MzMsImV4cCI6MjA5NjM2MjYzM30.DMjaB3jgXy4EOx7BblenzQ8BW5fB-QSCW3F2zO85UpQ';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON_KEY;

export const supabase = createClient(url, anonKey);
