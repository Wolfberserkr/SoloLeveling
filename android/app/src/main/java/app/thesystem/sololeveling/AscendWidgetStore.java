package app.thesystem.sololeveling;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * What the widget knows: the snapshot the app last sent (src/lib/widget.ts),
 * the current access token, and quests tapped but not yet confirmed.
 * Level math mirrors src/features/ascend/logic.ts.
 */
final class AscendWidgetStore {
    private static final String PREFS = "ascend_widget";
    private static final int XP_CURVE_K = 25;
    private static final int MAX_LEVEL = 100;
    private static final Object[][] TITLES = {
        {100, "Ascended"}, {75, "Master"}, {50, "Veteran"}, {25, "Adept"}, {10, "Apprentice"}, {1, "Initiate"},
    };

    private AscendWidgetStore() {}

    static final class Daily {
        String id;
        String title;
        int xp;
        int color;
        boolean done;
        boolean pending;
    }

    static final class View {
        boolean signedIn;
        int level;
        String title;
        long xp;
        float progress; // 0..1 towards the next level
        List<Daily> today = new ArrayList<>();
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void saveSnapshot(Context c, String json) {
        prefs(c).edit().putString("snapshot", json).putStringSet("pending", new HashSet<>()).apply();
    }

    static void saveSession(Context c, String url, String anonKey, String token, long expiresAt) {
        prefs(c).edit()
            .putString("url", url)
            .putString("anonKey", anonKey)
            .putString("token", token)
            .putLong("expiresAt", expiresAt)
            .apply();
    }

    static void clear(Context c) {
        prefs(c).edit().clear().apply();
    }

    static String url(Context c) { return prefs(c).getString("url", null); }
    static String anonKey(Context c) { return prefs(c).getString("anonKey", null); }
    static String token(Context c) { return prefs(c).getString("token", null); }

    /** Epoch seconds the access token expires at (0 when signed out). */
    static long expiresAt(Context c) { return prefs(c).getLong("expiresAt", 0); }

    /** A token with at least a minute left, so a tap can't race its expiry. */
    static boolean hasLiveToken(Context c) {
        return token(c) != null && expiresAt(c) * 1000L > System.currentTimeMillis() + 60_000L;
    }

    static Set<String> pending(Context c) {
        return new HashSet<>(prefs(c).getStringSet("pending", new HashSet<>()));
    }

    static void setPending(Context c, String questId, boolean on) {
        Set<String> s = pending(c);
        if (on) s.add(questId); else s.remove(questId);
        prefs(c).edit().putStringSet("pending", s).apply();
    }

    static JSONObject snapshot(Context c) {
        String raw = prefs(c).getString("snapshot", null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    static TimeZone zone(JSONObject snap) {
        String tz = snap == null ? null : snap.optString("tz", null);
        return tz == null || tz.isEmpty() ? TimeZone.getDefault() : TimeZone.getTimeZone(tz);
    }

    static String todayKey(TimeZone tz) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        f.setTimeZone(tz);
        return f.format(new java.util.Date());
    }

    /** Epoch millis of the next local midnight in the player's timezone. */
    static long nextMidnight(Context c) {
        Calendar cal = Calendar.getInstance(zone(snapshot(c)));
        cal.add(Calendar.DAY_OF_YEAR, 1);
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 5);
        cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }

    /** Record a completion confirmed by ascend_complete_quest. */
    static void applyCompletion(Context c, String questId, String localDate, int xp) {
        JSONObject snap = snapshot(c);
        if (snap == null) return;
        try {
            if (!localDate.equals(snap.optString("doneDate"))) {
                snap.put("doneDate", localDate);
                snap.put("doneIds", new JSONArray());
            }
            JSONArray ids = snap.getJSONArray("doneIds");
            boolean seen = false;
            for (int i = 0; i < ids.length(); i++) if (questId.equals(ids.optString(i))) seen = true;
            if (!seen) {
                ids.put(questId);
                snap.put("xp", snap.optLong("xp") + xp);
            }
            prefs(c).edit().putString("snapshot", snap.toString()).apply();
        } catch (JSONException ignored) {
            // A malformed snapshot is replaced on the next app sync.
        }
    }

    static View view(Context c) {
        View v = new View();
        JSONObject snap = snapshot(c);
        v.signedIn = snap != null && token(c) != null;
        if (snap == null) return v;

        v.xp = snap.optLong("xp");
        v.level = levelFromXp(v.xp);
        v.title = titleFor(v.level);
        if (v.level >= MAX_LEVEL) {
            v.progress = 1f;
        } else {
            long a = xpForLevel(v.level), b = xpForLevel(v.level + 1);
            v.progress = (float) (v.xp - a) / (float) (b - a);
        }

        TimeZone tz = zone(snap);
        String today = todayKey(tz);
        int weekday = Calendar.getInstance(tz).get(Calendar.DAY_OF_WEEK) - 1; // 0 = Sunday
        Set<String> done = new HashSet<>();
        if (today.equals(snap.optString("doneDate"))) {
            JSONArray ids = snap.optJSONArray("doneIds");
            if (ids != null) for (int i = 0; i < ids.length(); i++) done.add(ids.optString(i));
        }
        Set<String> pending = pending(c);

        JSONArray dailies = snap.optJSONArray("dailies");
        if (dailies == null) return v;
        for (int i = 0; i < dailies.length(); i++) {
            JSONObject q = dailies.optJSONObject(i);
            if (q == null || !scheduled(q.optJSONArray("days"), weekday)) continue;
            Daily d = new Daily();
            d.id = q.optString("id");
            d.title = q.optString("title");
            d.xp = q.optInt("xp");
            d.color = parseColor(q.optString("color"));
            d.done = done.contains(d.id);
            d.pending = !d.done && pending.contains(d.id);
            v.today.add(d);
        }
        return v;
    }

    private static boolean scheduled(JSONArray days, int weekday) {
        if (days == null) return false;
        for (int i = 0; i < days.length(); i++) if (days.optInt(i, -1) == weekday) return true;
        return false;
    }

    private static int parseColor(String hex) {
        try {
            return android.graphics.Color.parseColor(hex);
        } catch (IllegalArgumentException e) {
            return 0xFFA2AFC3;
        }
    }

    static long xpForLevel(int n) {
        int l = Math.max(1, Math.min(MAX_LEVEL, n));
        return (long) XP_CURVE_K * (l - 1) * (l + 2);
    }

    static int levelFromXp(long xp) {
        long x = Math.max(0, xp);
        int n = (int) Math.floor((-1 + Math.sqrt(9 + (4.0 * x) / XP_CURVE_K)) / 2);
        n = Math.max(1, Math.min(MAX_LEVEL, n));
        while (n < MAX_LEVEL && xpForLevel(n + 1) <= x) n++;
        while (n > 1 && xpForLevel(n) > x) n--;
        return n;
    }

    static String titleFor(int level) {
        for (Object[] t : TITLES) if (level >= (Integer) t[0]) return (String) t[1];
        return "Initiate";
    }
}
