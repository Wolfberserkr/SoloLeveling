package app.thesystem.sololeveling;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS side: src/lib/widget.ts. Stores what the widget needs and redraws it. */
@CapacitorPlugin(name = "AscendWidget")
public class AscendWidgetPlugin extends Plugin {

    @PluginMethod
    public void sync(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null) {
            call.reject("snapshot is required");
            return;
        }
        AscendWidgetStore.saveSnapshot(getContext(), snapshot);
        AscendWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setSession(PluginCall call) {
        String url = call.getString("url");
        String anonKey = call.getString("anonKey");
        String token = call.getString("accessToken");
        Double expiresAt = call.getDouble("expiresAt");
        if (url == null || anonKey == null || token == null || expiresAt == null) {
            call.reject("url, anonKey, accessToken and expiresAt are required");
            return;
        }
        AscendWidgetStore.saveSession(getContext(), url, anonKey, token, expiresAt.longValue());
        AscendWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        AscendWidgetStore.clear(getContext());
        AscendWidgetProvider.refreshAll(getContext());
        call.resolve();
    }
}
