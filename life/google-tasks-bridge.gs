/**
 * Jarvis ↔ Google Tasks bridge (Google Apps Script).
 *
 * Setup (once, about 5 minutes; see docs/LIFE_ASSISTANT.md → "Google Tasks"):
 *   1. script.google.com → New project → paste this file.
 *   2. Services (+) → Google Tasks API → Add.
 *   3. Project Settings → Script properties → add JARVIS_SECRET = <the same
 *      value you save as the GTASKS_SECRET Supabase secret>.
 *   4. Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone
 *      → Authorize → copy the Web app URL into the GTASKS_URL Supabase secret.
 *
 * Only requests carrying the secret are answered. The script runs as you and
 * can only touch your Google Tasks.
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

function doGet() { return out_({ ok: true, service: 'jarvis-google-tasks' }); }

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function run_(req) {
  switch (req.op) {
    case 'ping':
      return { ok: true };
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
