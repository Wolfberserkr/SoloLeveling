package app.thesystem.sololeveling;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AscendWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
