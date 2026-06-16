// ─────────────────────────────────────────────────────────────────────────────
// AI — Phase 6. Gemini-powered generation for riddles and book questions.
//
// Uses the Gemini REST API directly (no SDK) with the free-tier key from
// aistudio.google.com, set as the GEMINI_API_KEY function secret. Every
// caller must tolerate null: no key, a timeout, or malformed output all mean
// "the Archive is silent" and the game falls back to offline content.
// Deno-only — never import this from the pure game/ directory.
// ─────────────────────────────────────────────────────────────────────────────
import type { Riddle } from './game/riddles.ts';
import type { ReviewSummary } from './game/review.ts';

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const TIMEOUT_MS = 20_000;

export function aiAvailable(): boolean {
  return Boolean(Deno.env.get('GEMINI_API_KEY'));
}

/** One JSON-mode generation round trip. Null on any failure. */
async function generateJson(prompt: string): Promise<unknown | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return null;
  const model = Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 1.0,
            maxOutputTokens: 2048,
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      console.error(`gemini: ${model} returned ${res.status}: ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') return null;
    return JSON.parse(text);
  } catch (err) {
    console.error('gemini call failed:', err);
    return null;
  }
}

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

// ── Riddle generation (System Events) ────────────────────────────────────────
export async function generateRiddle(theme: string): Promise<Riddle | null> {
  const out = (await generateJson(
    `Write one original riddle in the voice of "the System" from Solo Leveling: terse, ` +
      `slightly ominous, addressed to a lone player. Theme it loosely around ${theme}. ` +
      `2-4 lines, ending with "What am I?" or similar. The answer must be one or two ` +
      `common English words that an average adult could plausibly guess. ` +
      `Respond with JSON only: {"riddle": string, "answer": string, "accept": string[]} ` +
      `where "accept" lists 0-3 alternative phrasings of the answer.`,
  )) as { riddle?: unknown; answer?: unknown; accept?: unknown } | null;
  if (!out) return null;

  const prompt = str(out.riddle, 500);
  const answer = str(out.answer, 60);
  if (prompt.length < 20 || answer.length < 2) return null;

  const aliases = Array.isArray(out.accept)
    ? out.accept.map((a) => str(a, 60)).filter((a) => a.length >= 2)
    : [];
  return { prompt, answer: [answer, ...aliases.slice(0, 3)].join('|') };
}

// ── Book question generation (Library Archive Scan) ─────────────────────────
export type GeneratedQuestion = { prompt: string; answer: string };

export async function generateBookQuestions(args: {
  title: string;
  author: string;
  reflections: string[];
  existingPrompts: string[];
  count: number;
}): Promise<GeneratedQuestion[] | null> {
  const reflections = args.reflections
    .map((r) => `- ${r.slice(0, 400)}`)
    .join('\n');
  const existing = args.existingPrompts.map((p) => `- ${p.slice(0, 200)}`).join('\n');

  const out = (await generateJson(
    `You are "the System" testing a player's retention of a book they are reading: ` +
      `"${args.title}"${args.author ? ` by ${args.author}` : ''}.\n` +
      (reflections
        ? `The player's own reflections while reading (their actual takeaways — prefer these):\n${reflections}\n`
        : '') +
      (existing ? `Questions already in their bank (do NOT duplicate):\n${existing}\n` : '') +
      `Write ${args.count} recall questions about the book's core ideas, each answerable ` +
      `in a sentence or two. Questions must test understanding the player can apply, not ` +
      `trivia about page numbers or chapter titles. Include a model answer for each. ` +
      `If you don't know this specific book, ask about the player's own reflections instead. ` +
      `Respond with JSON only: an array of {"question": string, "answer": string}.`,
  )) as Array<{ question?: unknown; answer?: unknown }> | null;
  if (!Array.isArray(out)) return null;

  const questions = out
    .map((q) => ({ prompt: str(q.question, 500), answer: str(q.answer, 1000) }))
    .filter((q) => q.prompt.length >= 10 && q.answer.length >= 2)
    .slice(0, args.count);
  return questions.length > 0 ? questions : null;
}

// ── Weekly review (AI System Coach, Phase 10) ───────────────────────────────
// Turns a ReviewSummary into a short narrative in the System's voice. Read-only
// reflection: it observes, names the standout and the gap, and points at the
// week ahead — no targets are changed (that comes in a later slice).
export async function generateWeeklyReview(summary: ReviewSummary): Promise<string | null> {
  const facts = [
    `Week reviewed: ${summary.weekStart} to ${summary.weekEnd}.`,
    `Daily Training Quests completed: ${summary.daysCompleted} of 7 (failed: ${summary.daysFailed}, recovery: ${summary.recoveryDays}).`,
    `Perfect Clears: ${summary.perfectClears}.`,
    `Reps logged — push-ups ${summary.pushups}, sit-ups ${summary.situps}, squats ${summary.squats}; distance ${summary.runKm} km.`,
    `Side quests completed: ${summary.sideQuestsCompleted}.`,
    `Sleep: ${summary.nightsLogged} nights logged, averaging ${summary.avgSleepHours} h.`,
    `XP earned: ${summary.xpEarned}. Current streak now: ${summary.streakEnd} days.`,
    `Reading: ${summary.pagesRead} pages, ${summary.booksFinished} tome(s) finished.`,
    `Lifting personal records broken: ${summary.liftPrs}. New shadows: ${summary.newShadows}.`,
    summary.weightChangeKg === null
      ? `Bodyweight change: not enough measurements.`
      : `Bodyweight change: ${summary.weightChangeKg > 0 ? '+' : ''}${summary.weightChangeKg} kg.`,
  ].join('\n');

  const out = (await generateJson(
    `You are "the System" from Solo Leveling, delivering a weekly assessment to a lone ` +
      `player who trains in real life. Voice: terse, observational, slightly ominous, ` +
      `never cheerful, never effusive. Address the player as "you".\n\n` +
      `Here is the data for the week under review:\n${facts}\n\n` +
      (summary.quiet
        ? `The week was nearly silent — almost nothing was logged. Acknowledge the absence ` +
          `plainly, without scolding, and call the player back to the Daily Training Quest. `
        : `Write 3-5 sentences: name the single strongest result, name the clearest gap or ` +
          `risk, and end with one concrete directive for the week ahead. Cite real numbers ` +
          `from the data — do not invent any. `) +
      `Do not use markdown, headings, or bullet points — plain prose only. ` +
      `Respond with JSON only: {"review": string}.`,
  )) as { review?: unknown } | null;
  if (!out) return null;

  const review = str(out.review, 1200);
  return review.length >= 40 ? review : null;
}
