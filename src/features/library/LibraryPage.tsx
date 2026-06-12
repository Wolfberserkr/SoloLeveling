import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { StatBar } from '@/components/system/StatBar';
import { GlitchText } from '@/components/system/GlitchText';
import { MANA_COSTS } from '@game/mana.ts';
import {
  MIN_REFLECTION_CHARS,
  MIN_APPLICATION_CHARS,
  RETENTION_INTERVALS,
} from '@game/library.ts';
import { REFLECTION_XP, APPLY_XP, RETENTION_PASS_XP } from '@game/constants.ts';
import type { Book, RetentionQuestion, XpAward } from '@/lib/types';

const INPUT_CLS =
  'mt-1 w-full border border-accent-cyan/30 bg-bg-base/60 px-2 py-1 font-sys text-sm text-white outline-none focus:border-accent-cyan';

export function LibraryPage() {
  const { books, dueQuestions } = usePlayerStore();
  const reading = books.filter((b) => b.status === 'reading');
  const finished = books.filter((b) => b.status === 'finished');

  return (
    <div className="flex flex-col gap-4">
      {dueQuestions.length > 0 && <KnowledgeCheckPanel />}
      <BookshelfPanel reading={reading} />
      <AddBookPanel shelfCount={reading.length} />
      {finished.length > 0 && <ArchivePanel finished={finished} />}
    </div>
  );
}

// ── Retain: due knowledge checks, asked one at a time ────────────────────────
function KnowledgeCheckPanel() {
  const { books, dueQuestions, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  const question = dueQuestions[0];
  if (!question) return null;
  const book = books.find((b) => b.id === question.book_id);

  async function answer(recalled: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await gameAction<{
        mastered: boolean;
        question: RetentionQuestion;
        award: XpAward | null;
      }>('review-question', { question_id: question.id, recalled });
      if (recalled) {
        pushAlert({
          kind: 'success',
          title: res.mastered ? 'QUESTION MASTERED' : 'Recalled',
          body: res.mastered
            ? 'This knowledge is yours now. The System stops asking.'
            : `+${res.award?.credited ?? RETENTION_PASS_XP} XP · next check in ${
                RETENTION_INTERVALS[res.question.stage]
              }d`,
        });
        if (res.award?.leveled_up) showLevelUp(res.award.new_level);
      } else {
        pushAlert({
          kind: 'warning',
          title: 'Knowledge slipped',
          body: 'Back to the start of the ladder. It returns tomorrow.',
        });
      }
      setRevealed(false);
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Check rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title={`Knowledge Check — ${dueQuestions.length} due`} accent="red" scan>
      <p className="font-sys text-[0.65rem] uppercase tracking-widest text-slate-500">
        {book ? `From “${book.title}”` : 'From your library'} · stage {question.stage + 1}/
        {RETENTION_INTERVALS.length}
        {question.source === 'system' && ' · ⌬ archive'}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-200">{question.prompt}</p>

      {revealed ? (
        <>
          {question.answer && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 border border-accent-cyan/20 bg-bg-base/40 p-3 text-xs leading-relaxed text-slate-400"
            >
              {question.answer}
            </motion.p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Grade yourself honestly — the System only works if you do.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="sys-btn" disabled={busy} onClick={() => answer(true)}>
              ⚔ Recalled
            </button>
            <button className="sys-btn sys-btn-ghost" disabled={busy} onClick={() => answer(false)}>
              ✗ Forgot
            </button>
          </div>
        </>
      ) : (
        <button className="sys-btn mt-4 w-full" onClick={() => setRevealed(true)}>
          Reveal Answer
        </button>
      )}
    </SystemWindow>
  );
}

// ── The shelf: tomes in progress ─────────────────────────────────────────────
function BookshelfPanel({ reading }: { reading: Book[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <SystemWindow title="Library — Active Tomes" scan delay={0.06}>
      {reading.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">
          The shelf is empty. Add a tome below — the intellect engine starts with one page.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {reading.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              open={openId === book.id}
              onToggle={() => setOpenId(openId === book.id ? null : book.id)}
            />
          ))}
        </div>
      )}
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Read → Reflect → Apply → Retain. Log pages with a written reflection, turn one insight
        into action, and bank questions — the System will test them when they fall due.
      </p>
    </SystemWindow>
  );
}

function BookCard({ book, open, onToggle }: { book: Book; open: boolean; onToggle: () => void }) {
  return (
    <div className="border border-accent-cyan/20 bg-bg-base/40">
      <button type="button" onClick={onToggle} className="w-full p-3 text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-sys text-sm text-slate-200">{book.title}</span>
          <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
            {open ? '▾' : '▸'}
          </span>
        </div>
        {book.author && (
          <div className="font-sys text-[0.65rem] uppercase tracking-widest text-slate-500">
            {book.author}
          </div>
        )}
        <div className="mt-2">
          <StatBar
            value={book.pages_read}
            max={book.total_pages}
            label={`${book.pages_read} / ${book.total_pages} pages`}
            accent="purple"
            height={6}
          />
        </div>
      </button>
      {open && <BookActions book={book} />}
    </div>
  );
}

// ── Read / Apply / Retain actions for one tome ───────────────────────────────
function BookActions({ book }: { book: Book }) {
  const { profile, readTodayBookIds, appliedTodayBookIds, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const [tab, setTab] = useState<'read' | 'apply' | 'retain'>('read');
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState('');
  const [reflection, setReflection] = useState('');
  const [action, setAction] = useState('');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');

  const readToday = readTodayBookIds.includes(book.id);
  const appliedToday = appliedTodayBookIds.includes(book.id);
  const affordable = (profile?.mana ?? 0) >= MANA_COSTS.reading;

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Action rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const logReading = () =>
    run(async () => {
      const res = await gameAction<{
        award: XpAward;
        finish_award: XpAward | null;
        reflected: boolean;
        finished: boolean;
      }>('log-reading', { book_id: book.id, pages: Number(pages), reflection });
      pushAlert({
        kind: 'success',
        title: 'Reading logged',
        body: `+${res.award.credited} XP${res.reflected ? ' (reflection bonus)' : ''} · −${MANA_COSTS.reading} mana${res.award.capped ? ' · DAILY XP SATURATED' : ''}`,
      });
      if (res.finished) {
        pushAlert({
          kind: 'success',
          title: `TOME CLEARED — ${book.title}`,
          body: res.finish_award ? `+${res.finish_award.credited} XP. Apply what you learned.` : undefined,
        });
      }
      const award = res.finish_award ?? res.award;
      if (award.leveled_up) showLevelUp(award.new_level);
      setPages('');
      setReflection('');
    });

  const logApplication = () =>
    run(async () => {
      const res = await gameAction<{ award: XpAward }>('log-application', {
        book_id: book.id,
        action,
      });
      pushAlert({
        kind: 'success',
        title: 'Insight applied',
        body: `+${res.award.credited} XP — knowledge became behavior.`,
      });
      if (res.award.leveled_up) showLevelUp(res.award.new_level);
      setAction('');
    });

  const bankQuestion = () =>
    run(async () => {
      await gameAction('add-question', { book_id: book.id, prompt, answer });
      pushAlert({
        kind: 'success',
        title: 'Question banked',
        body: 'The System will ask tomorrow — and keep asking until you master it.',
      });
      setPrompt('');
      setAnswer('');
    });

  const archiveScan = () =>
    run(async () => {
      const res = await gameAction<{ questions: unknown[]; bank_remaining: number }>(
        'generate-questions',
        { book_id: book.id },
      );
      pushAlert({
        kind: 'success',
        title: 'Archive scan complete',
        body: `${res.questions.length} questions generated · −${MANA_COSTS.study} mana. They fall due tomorrow.`,
      });
    });

  return (
    <div className="border-t border-accent-cyan/15 p-3">
      <div className="grid grid-cols-3 gap-1">
        {(['read', 'apply', 'retain'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border py-1 font-sys text-[0.65rem] uppercase tracking-widest transition-colors ${
              tab === t
                ? 'border-accent-cyan/60 bg-accent-cyan/10 text-accent-cyan'
                : 'border-accent-cyan/15 text-slate-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'read' && (
        <div className="mt-3">
          <label className="block">
            <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
              Pages read
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={pages}
              onChange={(e) => setPages(e.target.value)}
              className={INPUT_CLS}
            />
          </label>
          <label className="mt-2 block">
            <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
              Reflection — what did this change? (≥{MIN_REFLECTION_CHARS} chars: +{REFLECTION_XP} XP)
            </span>
            <textarea
              rows={3}
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              className={INPUT_CLS}
            />
          </label>
          <button
            className="sys-btn mt-3 w-full"
            disabled={busy || readToday || !affordable || !(Number(pages) > 0)}
            onClick={logReading}
          >
            {readToday
              ? 'Logged Today'
              : affordable
                ? `✦ Log Reading (−${MANA_COSTS.reading} ◈)`
                : 'Insufficient Mana'}
          </button>
        </div>
      )}

      {tab === 'apply' && (
        <div className="mt-3">
          <label className="block">
            <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
              One concrete action you took because of this tome (+{APPLY_XP} XP)
            </span>
            <textarea
              rows={2}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className={INPUT_CLS}
            />
          </label>
          <button
            className="sys-btn mt-3 w-full"
            disabled={busy || appliedToday || action.trim().length < MIN_APPLICATION_CHARS}
            onClick={logApplication}
          >
            {appliedToday ? 'Applied Today' : '⚔ Apply Insight'}
          </button>
        </div>
      )}

      {tab === 'retain' && (
        <div className="mt-3">
          <label className="block">
            <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
              Question — what must you still know in a month?
            </span>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className={INPUT_CLS}
            />
          </label>
          <label className="mt-2 block">
            <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
              Answer (shown when the check falls due)
            </span>
            <textarea
              rows={2}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className={INPUT_CLS}
            />
          </label>
          <button
            className="sys-btn mt-3 w-full"
            disabled={busy || prompt.trim().length < 5}
            onClick={bankQuestion}
          >
            ◈ Bank Question
          </button>
          <button
            className="sys-btn sys-btn-ghost mt-2 w-full !min-h-[34px] !py-1 !text-[0.65rem]"
            disabled={busy || book.pages_read <= 0 || (profile?.mana ?? 0) < MANA_COSTS.study}
            onClick={archiveScan}
          >
            {book.pages_read <= 0
              ? 'Read first — the Archive needs material'
              : (profile?.mana ?? 0) < MANA_COSTS.study
                ? 'Insufficient Mana for Archive Scan'
                : `⌬ Archive Scan — AI questions (−${MANA_COSTS.study} ◈)`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Register a new tome ──────────────────────────────────────────────────────
function AddBookPanel({ shelfCount }: { shelfCount: number }) {
  const { refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (busy || !title.trim() || !(Number(totalPages) >= 10)) return;
    setBusy(true);
    try {
      await gameAction('add-book', {
        title,
        author,
        total_pages: Number(totalPages),
      });
      pushAlert({
        kind: 'success',
        title: 'Tome added',
        body: 'It joins the shelf. Read, reflect, apply, retain.',
      });
      setTitle('');
      setAuthor('');
      setTotalPages('');
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Tome rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title="Add Tome" accent="purple" delay={0.12}>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 block">
          <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
            Title
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={INPUT_CLS}
          />
        </label>
        <label className="block">
          <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
            Author
          </span>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className={INPUT_CLS}
          />
        </label>
        <label className="block">
          <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
            Total pages
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={10}
            value={totalPages}
            onChange={(e) => setTotalPages(e.target.value)}
            className={INPUT_CLS}
          />
        </label>
      </div>
      <button
        className="sys-btn sys-btn-ghost mt-3 w-full !min-h-[34px] !py-1 !text-[0.65rem]"
        disabled={busy || !title.trim() || !(Number(totalPages) >= 10)}
        onClick={add}
      >
        Add to Shelf ({shelfCount}/10)
      </button>
    </SystemWindow>
  );
}

// ── Cleared tomes ────────────────────────────────────────────────────────────
function ArchivePanel({ finished }: { finished: Book[] }) {
  return (
    <SystemWindow title="Cleared Tomes" accent="gold" delay={0.18}>
      <div className="py-2 text-center">
        <div className="font-display text-xl font-bold uppercase tracking-[0.3em] text-accent-gold glow-text">
          <GlitchText text={`${finished.length} Cleared`} />
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {finished.map((b) => (
          <div
            key={b.id}
            className="flex items-baseline justify-between border border-accent-gold/20 bg-bg-base/40 p-2"
          >
            <span className="font-sys text-xs text-slate-300">{b.title}</span>
            <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
              {b.total_pages}p · {b.finished_date}
            </span>
          </div>
        ))}
      </div>
    </SystemWindow>
  );
}
