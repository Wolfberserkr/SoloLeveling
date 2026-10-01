import { useState } from 'react';
import { tally, ticketStatus, type TicketView } from '../logic';
import { useAscend } from '../store';
import { Bar, Empty, Icon, fmt, fmtDate } from '../ui';

const SUGGESTED: Array<[number, string]> = [
  [500, 'Movie night'], [1000, "Buy something I've been saving for"], [2500, 'Dinner out at a great restaurant'],
  [5000, 'Weekend staycation'], [10000, 'Bigger trip or experience'],
];

export function RewardsScreen() {
  const data = useAscend((s) => s.data);
  const addTicket = useAscend((s) => s.addTicket);
  const toast = useAscend((s) => s.toast);
  const [xp, setXp] = useState('');
  const [title, setTitle] = useState('');
  const total = tally(data).total, list = ticketStatus(data);
  const next = list.find((t) => t.status === 'locked'), ready = list.filter((t) => t.status === 'ready');
  const open = list.filter((t) => t.status !== 'claimed');
  const claimed = list.filter((t) => t.status === 'claimed').sort((a, b) => ((a.claimedAt ?? '') < (b.claimedAt ?? '') ? 1 : -1));

  async function add() {
    const n = parseInt(xp, 10);
    if (!(n > 0)) { toast('Set the lifetime XP that unlocks it.'); return; }
    if (!title.trim()) { toast('Name the reward.'); return; }
    if (await addTicket(n, title.trim())) { setXp(''); setTitle(''); }
  }

  return (
    <>
      <header className="pagehead"><h1>Golden Tickets</h1><p className="muted">Rewards unlock at lifetime XP milestones. No coins, no reward for every tap.</p></header>
      <div className="cols">
        <div className="stack">
          <section className="card" style={{ display: 'grid', gap: 10 }}>
            <div className="setrow">
              <div><div className="eyebrow">Lifetime XP</div><div className="num" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-.04em' }}>{fmt(total)}</div></div>
              <div style={{ textAlign: 'right' }}>
                {ready.length ? <span className="pill gold">{ready.length} ready</span>
                  : next ? <><div className="muted" style={{ fontSize: 13 }}>Next ticket at</div><div className="num" style={{ fontWeight: 600 }}>{fmt(next.xp)} XP</div></> : null}
              </div>
            </div>
            {next && <><Bar pct={next.pct} /><div className="hero-foot"><span>{next.title}</span><span className="num">{fmt(next.remaining)} to go</span></div></>}
          </section>
          {open.length ? <div className="ticketlist">{open.map((t) => <Ticket key={t.id} t={t} />)}</div> : (
            <section className="card">
              <Empty icon="ticket" title={data.tickets.length ? 'Every ticket claimed' : 'No Golden Tickets yet'}
                action={data.tickets.length ? undefined : <button className="btn primary sm" onClick={async () => { for (const [x, t] of SUGGESTED) await addTicket(x, t); }}>Add the suggested five</button>}>
                Set rewards that mean something at XP milestones. They should feel earned, and worth waiting for.
              </Empty>
            </section>
          )}
        </div>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Add a ticket</h2></div>
            <form className="addrow" onSubmit={(e) => { e.preventDefault(); void add(); }}>
              <input className="input num" id="tk-new-xp" type="number" inputMode="numeric" min={1} step={50} placeholder="XP" aria-label="XP milestone" value={xp} onChange={(e) => setXp(e.target.value)} />
              <input className="input" id="tk-new-title" placeholder="Reward, e.g. Concert tickets" aria-label="Reward" value={title} onChange={(e) => setTitle(e.target.value)} />
              <button className="btn primary" type="submit"><Icon name="plus" />Add</button>
            </form>
          </section>
          <section className="card">
            <div className="card-head"><h2>Claimed</h2><span className="muted num">{claimed.length}</span></div>
            {claimed.length ? <div className="ticketlist">{claimed.map((t) => <Ticket key={t.id} t={t} />)}</div>
              : <p className="muted" style={{ fontSize: 14 }}>Claimed tickets are kept here with the date you cashed them in.</p>}
          </section>
        </div>
      </div>
    </>
  );
}

function Ticket({ t }: { t: TicketView }) {
  const claim = useAscend((s) => s.claim);
  const openSheet = useAscend((s) => s.openSheet);
  return (
    <div className={`ticket ${t.status}`}>
      <button className="tmain" aria-label={`Edit ticket: ${t.title}`} onClick={() => openSheet({ kind: 'ticket', id: t.id })}>
        <span>{t.status === 'ready' ? <span className="pill gold">Ready to claim</span>
          : t.status === 'claimed' ? <span className="pill">Claimed {fmtDate(t.claimedAt, true)}</span>
          : <span className="pill">{fmt(t.remaining)} XP to go</span>}</span>
        <span className="tt">{t.title}</span>
        {t.status === 'locked' && <Bar pct={t.pct} />}
      </button>
      <div className="stub">
        <span className="x">{fmt(t.xp)}</span><span className="u">XP</span>
        {t.status === 'ready' && <button className="btn gold sm" onClick={() => void claim(t.id)}>Claim</button>}
      </div>
    </div>
  );
}
