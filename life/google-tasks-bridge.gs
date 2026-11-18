/**
 * Jarvis ↔ Google bridge (Google Apps Script): Google Tasks and Google Calendar.
 *
 * Setup (once, about 5 minutes; see docs/LIFE_ASSISTANT.md → "Google Tasks and Calendar"):
 *   1. script.google.com → New project → paste this file.
 *   2. Services (+) → Google Tasks API → Add. (Calendar needs no service: CalendarApp is built in.)
 *   3. Project Settings → Script properties → add JARVIS_SECRET = <the same
 *      value you save as the GTASKS_SECRET Supabase secret>.
 *   4. Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone
 *      → Authorize → copy the Web app URL into the GTASKS_URL Supabase secret.
 *   5. Run selfTest_ once from the editor (▶). The log should say "selftest ok".
 * Updating an existing deployment: Deploy → Manage deployments → edit (✏️) →
 * Version: New version → Deploy. The URL stays the same.
 *
 * Only requests carrying the secret are answered. The script runs as you and
 * can only touch your Google Tasks and your default calendar. It only changes
 * or deletes calendar events whose description contains [jarvis].
 */
function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('JARVIS_SECRET');
    if (!secret || req.secret !== secret) return out_({ error: 'forbidden' });
    return out_({ result: run_(req) });
  } catch (err) {
    return out_({ error: String((err && err.message) || err) });
  }
}

function doGet() { return out_({ ok: true, service: 'jarvis-google' }); }

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function run_(req) {
  switch (req.op) {
    case 'ping':
      return { ok: true, calendar: true };
    case 'calEvents':
      return CalendarApp.getDefaultCalendar().getEvents(new Date(req.from), new Date(req.to)).map(calSlim_);
    case 'calCreate': {
      var e = req.event, cal = CalendarApp.getDefaultCalendar(), opts = { description: e.description || '' };
      if (e.location) opts.location = e.location;
      var ev = e.allDay
        ? cal.createAllDayEvent(e.title, new Date(e.start), new Date(e.end), opts)
        : cal.createEvent(e.title, new Date(e.start), new Date(e.end), opts);
      setReminders_(ev, e.remindersMin);
      return calSlim_(ev);
    }
    case 'calUpdate': {
      var ev = jarvisEvent_(req.id);
      if (!ev) throw new Error('event not found');
      var p = req.patch || {};
      if (p.start && p.end) ev.setTime(new Date(p.start), new Date(p.end));
      if (p.title !== undefined) ev.setTitle(p.title);
      if (p.location !== undefined) ev.setLocation(p.location || '');
      if (p.description !== undefined) ev.setDescription(p.description);
      if (p.remindersMin !== undefined) setReminders_(ev, p.remindersMin);
      return calSlim_(ev);
    }
    case 'calDelete': {
      var ev = jarvisEvent_(req.id);
      if (ev) ev.deleteEvent();
      return { ok: true };
    }
    case 'ensureLists': {
      var have = {}, token;
      do {
        var r = Tasks.Tasklists.list({ maxResults: 100, pageToken: token });
        (r.items || []).forEach(function (l) { have[l.title] = l.id; });
        token = r.nextPageToken;
      } while (token);
      var map = {};
      req.titles.forEach(function (t) { map[t] = have[t] || Tasks.Tasklists.insert({ title: t }).id; });
      return map;
    }
    case 'insert':
      return slim_(Tasks.Tasks.insert(clean_(req.task), req.list));
    case 'patch':
      return slim_(Tasks.Tasks.patch(clean_(req.task), req.list, req.id));
    case 'delete':
      try { Tasks.Tasks.remove(req.list, req.id); } catch (e) { /* already gone */ }
      return { ok: true };
    case 'changes': {
      var all = [];
      Object.keys(req.lists).forEach(function (name) {
        var id = req.lists[name], token;
        do {
          var r = Tasks.Tasks.list(id, { updatedMin: req.since, showCompleted: true, showDeleted: true, showHidden: true, maxResults: 100, pageToken: token });
          (r.items || []).forEach(function (t) { var s = slim_(t); s.list = name; all.push(s); });
          token = r.nextPageToken;
        } while (token);
      });
      return all;
    }
  }
  throw new Error('unknown op ' + req.op);
}

function clean_(t) {
  var o = {};
  ['title', 'notes', 'due', 'status'].forEach(function (k) { if (t[k] !== undefined) o[k] = t[k]; });
  if (o.due === null) delete o.due;
  if (o.status === 'needsAction') o.completed = null;
  return o;
}

function slim_(t) {
  return { id: t.id, title: t.title || '', notes: t.notes || '', due: t.due || null, status: t.status, completed: t.completed || null, deleted: !!t.deleted, updated: t.updated };
}

// ── Calendar helpers ─────────────────────────────────────────────────────

function calSlim_(ev) {
  return { id: ev.getId(), title: ev.getTitle(), start: ev.getStartTime().toISOString(), end: ev.getEndTime().toISOString(), allDay: ev.isAllDayEvent(), description: ev.getDescription() || '' };
}

/** The event, or null when it no longer exists. Refuses events Jarvis didn't make. */
function jarvisEvent_(id) {
  var ev = CalendarApp.getDefaultCalendar().getEventById(id);
  if (!ev) return null;
  if ((ev.getDescription() || '').indexOf('[jarvis]') < 0) throw new Error('not a jarvis event');
  return ev;
}

function setReminders_(ev, mins) {
  ev.removeAllReminders();
  (mins || []).forEach(function (m) { ev.addPopupReminder(m); });
}

/** Run once from the editor after deploying. Leaves nothing on the calendar. */
function selfTest_() {
  var y = new Date(Date.now() - 86400000); y.setHours(10, 0, 0, 0);
  var at = function (min) { return new Date(y.getTime() + min * 60000).toISOString(); };
  var made = run_({ op: 'calCreate', event: { title: 'Jarvis selftest', start: at(0), end: at(15), allDay: false, description: '[jarvis] selftest', remindersMin: [10] } });
  run_({ op: 'calUpdate', id: made.id, patch: { start: at(15), end: at(30) } });
  var found = run_({ op: 'calEvents', from: at(0), to: at(60) }).filter(function (e) { return e.id === made.id; });
  if (found.length !== 1 || found[0].start !== at(15)) throw new Error('selftest: update or list failed');
  run_({ op: 'calDelete', id: made.id });
  var plain = CalendarApp.getDefaultCalendar().createEvent('Jarvis selftest (not jarvis)', new Date(at(0)), new Date(at(15)));
  var refused = false;
  try { run_({ op: 'calDelete', id: plain.getId() }); } catch (e) { refused = /not a jarvis event/.test(String(e)); }
  plain.deleteEvent();
  if (!refused) throw new Error('selftest: deleted an event without [jarvis]');
  Logger.log('selftest ok');
}
