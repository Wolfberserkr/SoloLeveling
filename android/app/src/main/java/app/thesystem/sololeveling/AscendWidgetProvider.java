package app.thesystem.sololeveling;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Home-screen widget: today's Ascend dailies with level and XP. Tapping an
 * open quest completes it through ascend_complete_quest (same RPC the app
 * uses); everything else opens the app.
 */
public class AscendWidgetProvider extends AppWidgetProvider {
    static final String ACTION_COMPLETE = "app.thesystem.sololeveling.ascend.COMPLETE";
    static final String ACTION_REFRESH = "app.thesystem.sololeveling.ascend.REFRESH";
    private static final String EXTRA_QUEST = "quest";

    // Ascend caps dailies at 5 per weekday, so five fixed rows always fit.
    private static final int[] ROWS = {R.id.row0, R.id.row1, R.id.row2, R.id.row3, R.id.row4};
    private static final int[] CHECKS = {R.id.check0, R.id.check1, R.id.check2, R.id.check3, R.id.check4};
    private static final int[] TITLES = {R.id.title0, R.id.title1, R.id.title2, R.id.title3, R.id.title4};
    private static final int[] XPS = {R.id.xp0, R.id.xp1, R.id.xp2, R.id.xp3, R.id.xp4};

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, AscendWidgetProvider.class));
        for (int id : ids) m.updateAppWidget(id, render(c));
        if (ids.length > 0) scheduleRefresh(c);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, render(c));
        scheduleRefresh(c);
    }

    @Override
    public void onDisabled(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(refreshIntent(c));
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        String action = intent.getAction();
        if (ACTION_REFRESH.equals(action)
            || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
            || Intent.ACTION_TIME_CHANGED.equals(action)) {
            refreshAll(c);
            return;
        }
        if (ACTION_COMPLETE.equals(action)) {
            complete(c, intent.getStringExtra(EXTRA_QUEST));
            return;
        }
        super.onReceive(c, intent);
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    private static RemoteViews render(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.ascend_widget);
        AscendWidgetStore.View s = AscendWidgetStore.view(c);
        v.setOnClickPendingIntent(R.id.header, openApp(c, "ascend"));

        if (!s.signedIn) {
            v.setTextViewText(R.id.level, "");
            v.setViewVisibility(R.id.progress, View.GONE);
            v.setTextViewText(R.id.summary, "");
            for (int row : ROWS) v.setViewVisibility(row, View.GONE);
            v.setViewVisibility(R.id.empty, View.VISIBLE);
            v.setTextViewText(R.id.empty, c.getString(R.string.ascend_widget_signed_out));
            v.setOnClickPendingIntent(R.id.empty, openApp(c, "ascend"));
            return v;
        }

        v.setTextViewText(R.id.level, "Lv " + s.level + " · " + s.title);
        v.setViewVisibility(R.id.progress, View.VISIBLE);
        v.setProgressBar(R.id.progress, 1000, Math.round(s.progress * 1000), false);

        int done = 0;
        for (AscendWidgetStore.Daily d : s.today) if (d.done) done++;
        v.setTextViewText(R.id.summary, s.today.isEmpty() ? "" : done + "/" + s.today.size());

        boolean live = AscendWidgetStore.hasLiveToken(c);
        for (int i = 0; i < ROWS.length; i++) {
            if (i >= s.today.size()) {
                v.setViewVisibility(ROWS[i], View.GONE);
                continue;
            }
            AscendWidgetStore.Daily d = s.today.get(i);
            v.setViewVisibility(ROWS[i], View.VISIBLE);
            v.setTextViewText(TITLES[i], d.title);
            v.setTextViewText(XPS[i], d.done ? "+" + d.xp : d.pending ? "…" : d.xp + " XP");
            v.setImageViewResource(CHECKS[i], d.done ? R.drawable.ascend_check_done : R.drawable.ascend_check_open);
            v.setInt(CHECKS[i], "setColorFilter", d.color);
            v.setTextColor(TITLES[i], d.done ? 0xFF6B7280 : 0xFFF3F4F6);
            v.setTextColor(XPS[i], d.done ? d.color : 0xFF8B93A1);
            PendingIntent tap = d.done || d.pending || !live
                ? openApp(c, "ascend/quests")
                : completeIntent(c, d.id);
            v.setOnClickPendingIntent(ROWS[i], tap);
        }

        if (s.today.isEmpty()) {
            v.setViewVisibility(R.id.empty, View.VISIBLE);
            v.setTextViewText(R.id.empty, c.getString(R.string.ascend_widget_rest_day));
            v.setOnClickPendingIntent(R.id.empty, openApp(c, "ascend/quests"));
        } else if (done == s.today.size()) {
            v.setViewVisibility(R.id.empty, View.VISIBLE);
            v.setTextViewText(R.id.empty, c.getString(R.string.ascend_widget_all_done));
            v.setOnClickPendingIntent(R.id.empty, openApp(c, "ascend"));
        } else {
            v.setViewVisibility(R.id.empty, View.GONE);
        }
        return v;
    }

    private static PendingIntent openApp(Context c, String path) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("thesystem://" + path), c, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, path.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent completeIntent(Context c, String questId) {
        Intent i = new Intent(c, AscendWidgetProvider.class)
            .setAction(ACTION_COMPLETE)
            .setData(Uri.parse("ascend-widget://complete/" + questId)) // keeps each row's intent distinct
            .putExtra(EXTRA_QUEST, questId);
        return PendingIntent.getBroadcast(c, questId.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent refreshIntent(Context c) {
        Intent i = new Intent(c, AscendWidgetProvider.class).setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Redraw at local midnight (new day's dailies) or when the token lapses
     *  (rows switch to opening the app), whichever comes first. Inexact is fine. */
    private static void scheduleRefresh(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        long at = AscendWidgetStore.nextMidnight(c);
        if (AscendWidgetStore.hasLiveToken(c)) {
            long lapse = AscendWidgetStore.expiresAt(c) * 1000L - 60_000L;
            if (lapse < at) at = lapse;
        }
        am.set(AlarmManager.RTC, at, refreshIntent(c));
    }

    // ── Completing a quest ────────────────────────────────────────────────────

    private void complete(Context c, String questId) {
        if (questId == null) return;
        Context app = c.getApplicationContext();
        if (!AscendWidgetStore.hasLiveToken(app)) {
            toast(app, app.getString(R.string.ascend_widget_open_app));
            refreshAll(app);
            return;
        }
        AscendWidgetStore.setPending(app, questId, true);
        refreshAll(app);

        final PendingResult result = goAsync();
        new Thread(() -> {
            try {
                String msg = callComplete(app, questId);
                if (msg != null) toast(app, msg);
            } finally {
                AscendWidgetStore.setPending(app, questId, false);
                refreshAll(app);
                result.finish();
            }
        }).start();
    }

    /** Runs ascend_complete_quest. Returns a message to show, or null. */
    private static String callComplete(Context c, String questId) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(AscendWidgetStore.url(c) + "/rest/v1/rpc/ascend_complete_quest");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("apikey", AscendWidgetStore.anonKey(c));
            conn.setRequestProperty("Authorization", "Bearer " + AscendWidgetStore.token(c));
            byte[] body = new JSONObject().put("p_quest", questId).toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body);
            }
            int code = conn.getResponseCode();
            String text = read(code >= 400 ? conn.getErrorStream() : conn.getInputStream());
            if (code >= 200 && code < 300) {
                JSONObject row = new JSONObject(text);
                int xp = row.optInt("xp");
                AscendWidgetStore.applyCompletion(c, questId, row.optString("local_date"), xp);
                return row.optString("title") + " · +" + xp + " XP";
            }
            if (code == 401) return c.getString(R.string.ascend_widget_open_app);
            String message = text.isEmpty() ? "" : new JSONObject(text).optString("message");
            if (message.startsWith("Already done")) {
                // Done elsewhere since the last sync: show it ticked off.
                AscendWidgetStore.applyCompletion(c, questId, AscendWidgetStore.todayKey(
                    AscendWidgetStore.zone(AscendWidgetStore.snapshot(c))), 0);
            }
            return message.isEmpty() ? c.getString(R.string.ascend_widget_failed) : message;
        } catch (Exception e) {
            return c.getString(R.string.ascend_widget_offline);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String read(InputStream in) throws java.io.IOException {
        if (in == null) return "";
        try (InputStream s = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            for (int n; (n = s.read(buf)) != -1; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    private static void toast(Context c, String text) {
        new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(c, text, Toast.LENGTH_SHORT).show());
    }
}
