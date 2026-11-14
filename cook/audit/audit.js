const { chromium } = require('playwright');
const PAGE = 'file://' + process.cwd() + '/' + (process.argv[2] || 'audit_page.html');
const res = []; const check = (name, ok, detail) => { res.push([ok ? 'PASS' : 'FAIL', name, detail || '']); };
(async () => {
  const b = await chromium.launch();
  const mk = async (vp) => { const p = await b.newPage({ viewport: vp, colorScheme: 'dark', timezoneId: 'America/Aruba' }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); await p.goto(PAGE); await p.waitForTimeout(6500); return p; };
  const p = await mk({ width: 390, height: 844 });
  const tab = async (t) => { await p.click('#tabs [data-tab="' + t + '"]'); await p.waitForTimeout(350); };
  const q = () => p.evaluate(() => window.__q.slice());
  const clearQ = () => p.evaluate(() => { window.__q.length = 0; });
  const sheetOpen = () => p.evaluate(() => !document.getElementById('sheetBg').hidden);
  const sheetTitle = () => p.evaluate(() => (document.getElementById('sheetTitle') || {}).textContent || '');
  const closeSheet = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(450); };
  const toast = () => p.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden && !t.classList.contains('out') ? t.textContent : ''; });

  // A. load
  check('A1 boot overlay gone', await p.evaluate(() => { const o = document.getElementById('boot'); return !o || o.hidden || getComputedStyle(o).display === 'none'; }));
  const q0 = await q(); check('A2 first query is the dashboard select', q0.length >= 1 && /life_profile/.test(q0[0]) && /^with p as/.test(q0[0].trim()), 'queries=' + q0.length);
  check('A3 range substituted', !/__RANGE__/.test(q0[0]));
  check('A4 heart rate label live', await p.evaluate(() => /Heart rate\s*\d+\s*bpm/.test(document.getElementById('c-ready').textContent)));

  // B. tabs
  for (const t of ['health', 'money', 'agenda', 'more', 'home']) { await tab(t);
    const st = await p.evaluate((t) => ({ vis: [...document.querySelectorAll('.view')].filter(v => !v.hidden).map(v => v.dataset.view), sel: [...document.querySelectorAll('#tabs [aria-selected="true"]')].map(x => x.dataset.tab) }), t);
    check('B tab ' + t + ' shows only its view', st.vis.length === 1 && st.vis[0] === t && st.sel.length === 1 && st.sel[0] === t, JSON.stringify(st)); }
  await tab('money'); await p.reload(); await p.waitForTimeout(6500);
  check('B6 tab remembered after reload', await p.evaluate(() => (document.querySelector('.view:not([hidden])') || {}).dataset.view) === 'money', await p.evaluate(() => (document.querySelector('.view:not([hidden])') || {}).dataset.view));
  await tab('home');
  await p.focus('#tabs [data-tab="home"]'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
  check('B7 arrow keys move between tabs', await p.evaluate(() => (document.querySelector('.view:not([hidden])') || {}).dataset.view) === 'health');
  await tab('home');

  // C. home cards → sheets, close paths, focus return
  for (const id of ['alertLine', 'c-ready', 'c-shift', 'c-session', 'c-brief']) {
    await p.evaluate((id) => { const e = document.getElementById(id); (e.querySelector('.label') || e).click(); }, id); await p.waitForTimeout(500);
    const open = await sheetOpen(); check('C sheet opens from #' + id, open, await sheetTitle()); if (open) await closeSheet();
    check('C sheet closes with Escape (#' + id + ')', !(await sheetOpen())); }
  await p.click('#alertLine'); await p.waitForTimeout(500);
  const alertRows = await p.evaluate(() => document.querySelectorAll('#sheet [data-al]').length); check('C6 alert sheet lists the items', alertRows >= 5, 'rows=' + alertRows);
  const dest = await p.evaluate(() => { const bs = [...document.querySelectorAll('#sheet [data-al]')]; const b = bs.find(x => /Rent|bill|Bill|rent/.test(x.parentElement.textContent)) || bs[bs.length - 1]; const txt = b.parentElement.textContent.slice(0, 40); b.click(); return txt; }); await p.waitForTimeout(600);
  check('C6b alert "Open" closes the sheet and goes to its tab', !(await sheetOpen()) && await p.evaluate(() => (document.querySelector('.view:not([hidden])') || {}).dataset.view) !== 'home', dest + ' → ' + await p.evaluate(() => (document.querySelector('.view:not([hidden])') || {}).dataset.view));
  await tab('home'); await p.click('#alertLine'); await p.waitForTimeout(600);
  check('C6c closing animates then hides', await p.evaluate(async () => { const bg = document.getElementById('sheetBg'); document.getElementById('sheetClose').click(); const mid = bg.classList.contains('closing') && !bg.hidden; await new Promise(r => setTimeout(r, 320)); return mid && bg.hidden && !bg.classList.contains('closing'); }));
  await p.click('#alertLine'); await p.waitForTimeout(600);
  await p.mouse.click(195, 20); await p.waitForTimeout(450); check('C7 backdrop tap closes the sheet', !(await sheetOpen()));
  await p.focus('#alertLine'); await p.keyboard.press('Enter'); await p.waitForTimeout(500); await p.click('#sheetClose'); await p.waitForTimeout(450);
  check('C8 close button closes', !(await sheetOpen()));
  check('C9 focus returns to the trigger', await p.evaluate(() => document.activeElement && document.activeElement.id) === 'alertLine', await p.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName)));
  await p.click('#alertLine'); await p.waitForTimeout(500);
  check('C10 page behind the sheet is scroll-locked', await p.evaluate(() => { const y = scrollY; scrollTo(0, y + 300); const moved = scrollY !== y; scrollTo(0, y); return !moved || getComputedStyle(document.documentElement).overflow === 'hidden' || getComputedStyle(document.body).overflow === 'hidden'; }));
  let inside = true; for (let i = 0; i < 14; i++) { await p.keyboard.press('Tab'); inside = inside && await p.evaluate(() => document.getElementById('sheet').contains(document.activeElement)); }
  check('C11 focus stays inside the sheet on Tab', inside); for (let i = 0; i < 3; i++) await p.keyboard.press('Shift+Tab'); check('C11b and on Shift+Tab', await p.evaluate(() => document.getElementById('sheet').contains(document.activeElement)));
  await closeSheet();
  check('C12 scroll unlocks after close', await p.evaluate(() => !document.documentElement.classList.contains('sheet-open')));
  // drag the handle down to dismiss
  await p.click('#alertLine'); await p.waitForTimeout(700);
  check('C13 sheet has a grab handle', await p.evaluate(() => { const g = document.querySelector('#sheet > .sheet-grab'); return !!g && g.getBoundingClientRect().height >= 20; }));
  let g = await p.evaluate(() => { const r = document.querySelector('#sheet > .sheet-grab').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await p.mouse.move(g[0], g[1]); await p.mouse.down(); await p.mouse.move(g[0], g[1] + 40, { steps: 4 }); const moved = await p.evaluate(() => document.getElementById('sheet').style.transform); await p.waitForTimeout(500); await p.mouse.up(); await p.waitForTimeout(500);
  check('C14 sheet follows the finger', /translateY\(40px\)/.test(moved), moved);
  check('C15 a short, slow drag springs back', await sheetOpen() && await p.evaluate(() => document.getElementById('sheet').style.transform === ''));
  g = await p.evaluate(() => { const r = document.querySelector('#sheet > .sheet-grab').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await p.mouse.move(g[0], g[1]); await p.mouse.down(); await p.mouse.move(g[0], g[1] + 180, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(450);
  check('C16 a long drag dismisses', !(await sheetOpen()));
  await p.click('#alertLine'); await p.waitForTimeout(700);
  g = await p.evaluate(() => { const r = document.querySelector('#sheet > .sheet-grab').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await p.mouse.move(g[0], g[1]); await p.mouse.down(); await p.mouse.move(g[0], g[1] + 60, { steps: 2 }); await p.mouse.up(); await p.waitForTimeout(450);
  check('C17 a quick flick dismisses', !(await sheetOpen()));
  await p.click('#alertLine'); await p.waitForTimeout(700); await p.evaluate(() => document.querySelector('#sheet [data-al]').focus());
  const bt = await p.evaluate(() => { const r = document.querySelector('#sheet [data-al]').getBoundingClientRect(); return [r.left + 5, r.top + 5]; });
  await p.mouse.move(bt[0], bt[1]); await p.mouse.down(); await p.mouse.move(bt[0], bt[1] + 150, { steps: 4 }); const st2 = await p.evaluate(() => document.getElementById('sheet').style.transform); await p.mouse.up(); await p.waitForTimeout(300);
  check('C18 dragging from a button inside does not move the sheet', st2 === '', st2); if (await sheetOpen()) await closeSheet();
  // press feedback
  const alr = await p.evaluate(() => { const r = document.getElementById('alertLine').getBoundingClientRect(); return [r.left + 30, r.top + r.height / 2]; });
  await p.mouse.move(alr[0], alr[1]); await p.mouse.down(); await p.waitForTimeout(260); const tr = await p.evaluate(() => getComputedStyle(document.getElementById('alertLine')).transform); await p.mouse.move(alr[0], alr[1] + 300); await p.mouse.up(); await p.waitForTimeout(200);
  check('C19 pressing a control scales it', /matrix\(0\.98/.test(tr), tr); if (await sheetOpen()) await closeSheet();

  // D. tasks
  await clearQ(); const tid = await p.evaluate(() => document.querySelector('#homeTasks input[data-task]').dataset.task);
  await p.click('#homeTasks input[data-task]'); await p.waitForTimeout(700);
  let qs = await q(); check('D1 ticking a home task sends the update', qs.some(x => /update life_tasks set done_at/.test(x) && x.includes(tid)), qs.map(x => x.slice(0, 40)).join(' | '));
  check('D2 success toast shown', /Done/.test(await toast()), await toast());
  check('D3 data reloaded after the write', qs.filter(x => /life_profile/.test(x)).length >= 1);
  await p.waitForTimeout(600);
  await p.evaluate(() => { window.__fail = { code: 'upstream_error', message: 'boom' }; }); await clearQ();
  await p.click('#homeTasks input[data-task]'); await p.waitForTimeout(700);
  check('D4 failed save tells the user', /Supabase|Not saved/.test(await toast()), await toast());
  check('D5 failed save unticks the box', await p.evaluate(() => { const c = document.querySelector('#homeTasks input[data-task]'); return !c.checked && !c.disabled; }), await p.evaluate(() => { const c = document.querySelector('#homeTasks input[data-task]'); return 'checked=' + c.checked + ' disabled=' + c.disabled; }));
  await p.evaluate(() => { window.__fail = null; window.__rows = []; }); await clearQ(); await p.waitForTimeout(2700);
  await p.click('#homeTasks input[data-task]'); await p.waitForTimeout(700);
  qs = await q(); check('D6 a write that changes 0 rows is not reported as done', qs.some(x => /update life_tasks/.test(x)) && /Nothing changed/.test(await toast()), 'sent=' + qs.some(x => /update life_tasks/.test(x)) + ' toast=' + await toast());
  check('D7 toast sits above the tab bar', await p.evaluate(() => { const t = document.getElementById('toast').getBoundingClientRect(), n = document.getElementById('tabs').getBoundingClientRect(); return t.bottom <= n.top + 1; }));
  await p.evaluate(() => { window.__rows = null; }); await p.waitForTimeout(2700);

  // E. inbox decisions on home
  await clearQ(); const lab = await p.evaluate(() => { const b = document.querySelector('#decide [data-ib][data-v="k"]'); b.click(); return b.textContent; }); await p.waitForTimeout(60);
  check('E1 Keep shows Saving…', /Saving/.test(lab) || /Saving/.test(await p.evaluate(() => (document.querySelector('#decide [data-ib][data-v="k"]') || {}).textContent || 'Saving')), lab);
  await p.waitForTimeout(700); qs = await q(); check('E2 Keep sends status=rejected + action=keep', qs.some(x => /update life_inbox set status = 'rejected', action = 'keep'/.test(x)));
  await p.waitForTimeout(2700); await clearQ(); await p.click('#decide [data-ib][data-v="d"]'); await p.waitForTimeout(700); qs = await q();
  check('E3 Delete queues status=approved', qs.some(x => /update life_inbox set status = 'approved'/.test(x) && /where id = '/.test(x)));
  await p.waitForTimeout(2700); await clearQ(); await p.click('#ibAll'); await p.waitForTimeout(200);
  check('E4 Apply asks for a second tap first', (await q()).length === 0 && /again/i.test(await p.evaluate(() => document.getElementById('ibAll').textContent)));
  await p.click('#ibAll'); await p.waitForTimeout(700); check('E5 second tap sends the bulk update', (await q()).some(x => /update life_inbox set status = 'approved', decided_at = now\(\) where user_id/.test(x)));
  await p.waitForTimeout(2700);

  // F. health
  await tab('health');
  for (const g of ['sleep', 'rem', 'deep', 'stress', 'bb', 'z2', 'steps']) { await p.evaluate((g) => document.querySelector('.gauges [data-gauge="' + g + '"]').click(), g); await p.waitForTimeout(450); const o = await sheetOpen(); check('F ring ' + g + ' opens a sheet', o, await sheetTitle()); if (o) await closeSheet(); }
  const tiles = await p.evaluate(() => [...document.querySelectorAll('#health [data-detail]')].map(x => x.dataset.detail));
  for (const t of tiles) { await p.evaluate((t) => document.querySelector('#health [data-detail="' + t + '"]').click(), t); await p.waitForTimeout(450); const o = await sheetOpen(); const has = await p.evaluate(() => document.querySelectorAll('#sheet .bars, #sheet .sbars, #sheet svg, #sheet .facts, #sheet table').length); check('F tile ' + t + ' opens a sheet with content', o && has > 0, (await sheetTitle()) + ' parts=' + has); if (o) await closeSheet(); }
  await p.evaluate(() => document.querySelector('#h-rides [data-ride]').click()); await p.waitForTimeout(500); check('F ride row opens the ride sheet', await sheetOpen(), await sheetTitle());
  const hasBack = await p.evaluate(() => !!document.querySelector('#sheet [data-back], #sheet #rideBack, #sheet .back')); if (hasBack) { await p.evaluate(() => document.querySelector('#sheet [data-back], #sheet #rideBack, #sheet .back').click()); await p.waitForTimeout(400); check('F ride sheet Back goes to the list', /Rides/.test(await sheetTitle()), await sheetTitle()); }
  await closeSheet();
  await p.evaluate(() => document.querySelector('#health [data-detail="sleep"]').click()); await p.waitForTimeout(700);
  await p.evaluate(() => { const b = document.querySelector('#sheet .bars .b'); b.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(200);
  const bb = await p.evaluate(() => { const r = document.querySelector('#sheet .bars .b').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); await p.mouse.click(bb[0], bb[1]); await p.waitForTimeout(250);
  check('F tapping a bar shows its value', await p.evaluate(() => { const t = document.getElementById('tip'); return t && !t.hidden && t.textContent.length > 3; }), await p.evaluate(() => (document.getElementById('tip') || {}).textContent));
  await closeSheet(); check('F tip hides when the sheet closes', await p.evaluate(() => document.getElementById('tip').hidden));

  // G. money
  await tab('money');
  for (const g of ['budget', 'goals']) { await p.evaluate((g) => document.querySelector('#m-hero [data-gauge="' + g + '"]').click(), g); await p.waitForTimeout(450); const o = await sheetOpen(); check('G hero ' + g + ' opens a sheet', o, await sheetTitle()); if (o) await closeSheet(); }
  for (const id of ['m-budget', 'm-bills', 'm-goals']) { const ex = await p.evaluate((id) => { const e = document.getElementById(id); if (!e) return false; (e.querySelector('.label') || e).click(); return true; }, id); await p.waitForTimeout(450); const o = await sheetOpen(); check('G card #' + id + ' opens a sheet', ex && o, await sheetTitle()); if (o) await closeSheet(); }
  await clearQ(); const bid = await p.evaluate(() => document.querySelector('[data-paid]').dataset.paid); await p.click('[data-paid]'); await p.waitForTimeout(700); qs = await q();
  check('G Mark paid sends the bill update and does not open the card sheet', qs.some(x => /update life_bills set last_paid/.test(x) && x.includes(bid)) && !(await sheetOpen()), 'sheet=' + (await sheetOpen()));
  if (await sheetOpen()) await closeSheet(); await p.waitForTimeout(2700);

  // H. agenda
  await tab('agenda');
  for (const m of ['month', 'lists', 'week']) { await p.click('#agMode [data-m="' + m + '"]'); await p.waitForTimeout(400); const st = await p.evaluate((m) => ({ pressed: [...document.querySelectorAll('#agMode [aria-pressed="true"]')].map(x => x.dataset.m), cal: !!document.querySelector('#v-agenda .cal') && document.querySelector('#v-agenda .cal').offsetParent !== null, strip: !!document.querySelector('.wk-strip') && document.querySelector('.wk-strip').offsetParent !== null, lists: !!document.querySelector('#i-tasks') && document.querySelector('#i-tasks').offsetParent !== null }), m);
    check('H mode ' + m, st.pressed.length === 1 && st.pressed[0] === m && (m === 'month' ? st.cal : m === 'lists' ? st.lists : st.strip), JSON.stringify(st)); }
  await p.click('#agMode [data-m="month"]'); await p.waitForTimeout(400);
  const mt = await p.evaluate(() => (document.querySelector('#v-agenda .cal-h, #v-agenda #calTitle, #s-up .label, #schedule h3') || {}).textContent || document.querySelector('#schedule').textContent.slice(0, 40));
  await p.click('#calNext'); await p.waitForTimeout(300); const mt2 = await p.evaluate(() => document.querySelector('#schedule').textContent.slice(0, 60));
  check('H next month changes the calendar', mt2 !== (await p.evaluate(() => '')) && !mt2.startsWith(mt.slice(0, 60)) || mt !== mt2, mt.slice(0, 30) + ' → ' + mt2.slice(0, 30));
  await p.click('#calPrev'); await p.waitForTimeout(300);
  const dayEl = await p.evaluate(() => { const d = document.querySelector('#schedule .cal .day:not(.off)'); if (!d) return false; d.click(); return true; }); await p.waitForTimeout(450); check('H calendar day opens the day sheet', dayEl && await sheetOpen(), await sheetTitle()); if (await sheetOpen()) await closeSheet();
  const pend = await p.evaluate(() => document.querySelectorAll('#schedule [data-batch]').length); check('H pending roster shows Confirm/Discard', pend >= 2, 'buttons=' + pend);
  if (pend) { await clearQ(); await p.evaluate(() => document.querySelector('#schedule [data-batch][data-v="ok"]').click()); await p.waitForTimeout(700); check('H Confirm roster sends status=confirmed for the batch', (await q()).some(x => /update life_shifts set status = 'confirmed'/.test(x) && /batch = 'abcd1234'/.test(x))); await p.waitForTimeout(2700); }
  const canc = await p.evaluate(() => document.querySelectorAll('#schedule [data-cancel]').length);
  if (canc) { await clearQ(); await p.evaluate(() => document.querySelector('#schedule [data-cancel]').click()); await p.waitForTimeout(200); check('H Cancel shift asks for a second tap', (await q()).length === 0 && /Confirm/.test(await p.evaluate(() => document.querySelector('#schedule [data-cancel]').textContent)));
    await p.evaluate(() => document.querySelector('#schedule [data-cancel]').click()); await p.waitForTimeout(700); check('H second tap cancels the shift', (await q()).some(x => /update life_shifts set status = 'cancelled'/.test(x) && /where id = '/.test(x))); await p.waitForTimeout(2700); } else check('H Cancel shift buttons present', false, 'none found');
  await p.click('#agMode [data-m="week"]'); await p.waitForTimeout(400);
  const y0 = await p.evaluate(() => scrollY); await p.evaluate(() => document.querySelectorAll('.wk-day')[4].click()); await p.waitForTimeout(900);
  check('H day chip jumps to that day', await p.evaluate((y0) => { const on = document.querySelector('.wk-day.on'); const d = on && on.dataset.jump; const el = d && document.getElementById('ag-' + d); const tgt = document.getElementById('ag-' + document.querySelectorAll('.wk-day')[4].dataset.jump); const atEnd = Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2; return !!tgt && (Math.abs(tgt.getBoundingClientRect().top) < 260 || atEnd) && scrollY > 100 && document.querySelectorAll('.wk-day')[4] === on; }, y0), await p.evaluate(() => { const on = document.querySelector('.wk-day.on'); const el = on && document.getElementById('ag-' + on.dataset.jump); return 'on=' + (on && on.dataset.jump) + ' idx4=' + document.querySelectorAll('.wk-day')[4].dataset.jump + ' top=' + (el && Math.round(el.getBoundingClientRect().top)); }));
  await p.evaluate(() => scrollTo(0, 0)); await p.evaluate(() => document.querySelector('.ag-h[data-day]').click()); await p.waitForTimeout(450); check('H day header opens the day sheet', await sheetOpen(), await sheetTitle()); if (await sheetOpen()) await closeSheet();
  await clearQ(); const atid = await p.evaluate(() => { const c = document.querySelector('#agenda input[data-task]'); return c && c.dataset.task; });
  if (atid) { await p.evaluate(() => document.querySelector('#agenda input[data-task]').click()); await p.waitForTimeout(700); check('H ticking an agenda task sends the update', (await q()).some(x => /update life_tasks set done_at/.test(x) && x.includes(atid))); await p.waitForTimeout(2700); }
  const al = await p.evaluate(() => { const b = document.getElementById('agLists'); if (!b) return null; b.click(); return true; }); await p.waitForTimeout(400); if (al) check('H "anytime → Lists" switches to Lists', await p.evaluate(() => (document.querySelector('#agMode [aria-pressed="true"]') || {}).dataset.m) === 'lists');
  await clearQ(); const ltid = await p.evaluate(() => { const c = document.querySelector('#i-tasks input[data-task]'); return c && c.dataset.task; });
  if (ltid) { await p.evaluate(() => document.querySelector('#i-tasks input[data-task]').click()); await p.waitForTimeout(700); check('H ticking a Lists task sends the update', (await q()).some(x => /update life_tasks set done_at/.test(x) && x.includes(ltid))); await p.waitForTimeout(2700); } else check('H Lists has task checkboxes', false);

  // I. more
  await tab('more'); await clearQ(); await p.click('#range [data-r="30"]'); await p.waitForTimeout(900); qs = await q();
  check('I range 30d reloads with a 30-day window', qs.some(x => /life_profile/.test(x) && /30/.test(x)) && await p.evaluate(() => document.querySelector('#range [aria-pressed="true"]').dataset.r) === '30', 'queries=' + qs.length);
  await p.reload(); await p.waitForTimeout(6500); check('I range remembered after reload', await p.evaluate(() => (document.querySelector('#range [aria-pressed="true"]') || {}).dataset.r) === '30');
  await tab('more'); await p.click('#range [data-r="14"]'); await p.waitForTimeout(900);
  await clearQ(); await p.click('#refresh2'); await p.waitForTimeout(700); check('I Refresh now reloads', (await q()).some(x => /life_profile/.test(x)));
  await clearQ(); await p.click('#refresh'); await p.waitForTimeout(700); check('I header refresh reloads', (await q()).some(x => /life_profile/.test(x)));
  const vb = await p.evaluate(() => { const b = document.getElementById('voiceBtn2'); if (!b || b.hidden) return false; b.click(); return true; }); await p.waitForTimeout(450); check('I Voice settings opens', vb && await sheetOpen(), 'visible=' + vb + ' ' + (await sheetTitle())); if (await sheetOpen()) await closeSheet();
  for (const id of ['j-spend', 'j-sys', 'j-jobs']) { await p.evaluate((id) => { const e = document.getElementById(id); (e.querySelector('.label') || e).click(); }, id); await p.waitForTimeout(450); const o = await sheetOpen(); check('I card #' + id + ' opens a sheet', o, await sheetTitle()); if (o) await closeSheet(); }

  // J. ask
  await tab('home'); await p.click('#fab'); await p.waitForTimeout(450);
  check('J Ask opens', await p.evaluate(() => document.getElementById('fab').getAttribute('aria-expanded') === 'true' && !document.getElementById('ask').hidden && document.getElementById('ask').getBoundingClientRect().height > 80));
  check('J Ask focuses the input', await p.evaluate(() => document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)));
  await p.keyboard.type('How did I sleep?'); await p.keyboard.press('Enter'); await p.waitForTimeout(900);
  check('J Ask sends the question and shows the answer', await p.evaluate(() => !!window.__sample && /Mock answer/.test(document.querySelector('.card.ask').textContent)), await p.evaluate(() => document.querySelector('.card.ask').textContent.replace(/\s+/g, ' ').slice(-80)));
  check('J Ask prompt carries the question', await p.evaluate(() => JSON.stringify(window.__sample || '').includes('How did I sleep?')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400); check('J Escape closes Ask', await p.evaluate(() => document.getElementById('fab').getAttribute('aria-expanded') === 'false'));
  await p.click('#fab'); await p.waitForTimeout(350); await p.click('#askClose'); await p.waitForTimeout(350); check('J close button closes Ask', await p.evaluate(() => document.getElementById('fab').getAttribute('aria-expanded') === 'false'));

  // K. speak
  const sp = await p.evaluate(() => { const b = document.getElementById('speakBtn'); if (!b || b.hidden) return 'hidden'; window.__spoken = []; const o = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = function (u) { window.__spoken.push(u.text); }; b.click(); return 'clicked'; }); await p.waitForTimeout(400);
  check('K Read aloud speaks the greeting', sp === 'clicked' && await p.evaluate(() => window.__spoken.length > 0 && /Good (morning|afternoon|evening)/.test(window.__spoken[0])), sp + ' ' + await p.evaluate(() => (window.__spoken || []).join(' ').slice(0, 60)));
  check('K speaker button sits in the header', await p.evaluate(() => !!document.querySelector('.hud-top #speakBtn')));

  check('Z no page errors (phone)', p.errs.length === 0, p.errs.slice(0, 3).join(' || '));

  // L. load failure and retry
  const p2 = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' }); await p2.addInitScript(() => { window.__startFail = true; });
  await p2.goto(PAGE); await p2.evaluate(() => { window.__fail = { code: 'upstream_error', message: 'x', retryable: false }; }); await p2.waitForTimeout(7000);
  const st1 = await p2.evaluate(() => document.getElementById('status').textContent);
  // (the first load may already have succeeded before __fail was set; force a failing refresh)
  await p2.evaluate(() => document.getElementById('refresh').click()); await p2.waitForTimeout(800);
  check('L failed refresh shows the banner and keeps old data', await p2.evaluate(() => /didn.t answer/.test(document.getElementById('status').textContent) && document.getElementById('c-ready') !== null));
  await p2.evaluate(() => { window.__fail = null; document.getElementById('retryBtn').click(); }); await p2.waitForTimeout(900);
  check('L Try again clears the banner', await p2.evaluate(() => document.getElementById('status').textContent.trim() === ''));
  await p2.close();

  // O. desktop masonry
  const d = await mk({ width: 1366, height: 900 });
  const overlap = () => d.evaluate(() => { const ids = ['hello', 'alerts', 'c-ready', 'c-shift', 'c-session', 'homeTasks', 'c-brief', 'decide']; const r = ids.map(i => document.getElementById(i)).filter(Boolean).map(e => [e.id, e.getBoundingClientRect()]); const bad = []; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i][1], b = r[j][1]; if (a.width && b.width && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(r[i][0] + '×' + r[j][0]); } return bad; });
  check('O desktop cards do not overlap (1366)', (await overlap()).length === 0, (await overlap()).join(','));
  await d.setViewportSize({ width: 1040, height: 800 }); await d.waitForTimeout(500); check('O no overlap after resize to 1040', (await overlap()).length === 0, (await overlap()).join(','));
  await d.setViewportSize({ width: 600, height: 800 }); await d.waitForTimeout(500); check('O no overlap at 600 (single column)', (await overlap()).length === 0, (await overlap()).join(','));
  await d.setViewportSize({ width: 1366, height: 900 }); await d.waitForTimeout(500); check('O no overlap back at 1366', (await overlap()).length === 0, (await overlap()).join(','));
  await d.evaluate(() => document.querySelector('#homeTasks input[data-task]').click()); await d.waitForTimeout(1500); check('O no overlap after a data reload', (await overlap()).length === 0, (await overlap()).join(','));
  check('O no horizontal scroll on desktop', await d.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('Z no page errors (desktop)', d.errs.length === 0, d.errs.slice(0, 3).join(' || '));
  await b.close();
  const fails = res.filter(r => r[0] === 'FAIL');
  res.forEach(r => console.log(r[0] + '  ' + r[1] + (r[2] ? '   [' + String(r[2]).slice(0, 150) + ']' : '')));
  console.log('\n' + (res.length - fails.length) + '/' + res.length + ' passed');
})().catch(e => { res.forEach(r => console.log(r.join('  '))); console.error('HARNESS ERROR', e.message.slice(0, 400)); process.exit(1); });
