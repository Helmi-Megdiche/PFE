package com.mobileapp.foreground;

import android.app.AppOpsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;

/**
 * Resolves the current foreground app via UsageStatsManager (requires Usage access).
 */
public class ForegroundAppModule extends ReactContextBaseJavaModule {

    public static final String NAME = "ForegroundApp";

    public ForegroundAppModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void hasUsageAccess(Promise promise) {
        promise.resolve(hasUsageStatsPermission());
    }

    @ReactMethod
    public void openUsageAccessSettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("E_SETTINGS", "Cannot open usage access settings", e);
        }
    }

    @ReactMethod
    public void getCurrentForegroundApp(Promise promise) {
        if (!hasUsageStatsPermission()) {
            promise.reject("E_NO_USAGE_ACCESS", "Usage access not granted — enable in system settings");
            return;
        }

        try {
            UsageStatsManager usm = (UsageStatsManager)
                    getReactApplicationContext().getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) {
                promise.reject("E_NO_SERVICE", "UsageStatsManager unavailable");
                return;
            }

            long end = System.currentTimeMillis();
            long start = end - 60_000;
            List<UsageStats> stats = usm.queryUsageStats(
                    UsageStatsManager.INTERVAL_DAILY,
                    start,
                    end
            );

            if (stats == null || stats.isEmpty()) {
                promise.resolve(null);
                return;
            }

            SortedMap<Long, UsageStats> sorted = new TreeMap<>();
            for (UsageStats usage : stats) {
                if (usage.getLastTimeUsed() > 0) {
                    sorted.put(usage.getLastTimeUsed(), usage);
                }
            }

            if (sorted.isEmpty()) {
                promise.resolve(null);
                return;
            }

            UsageStats recent = sorted.get(sorted.lastKey());
            String packageName = recent.getPackageName();
            String appLabel = resolveAppLabel(packageName);

            WritableMap map = Arguments.createMap();
            map.putString("packageName", packageName);
            map.putString("appLabel", appLabel);
            map.putDouble("lastTimeUsed", recent.getLastTimeUsed());
            promise.resolve(map);
        } catch (Exception e) {
            promise.reject("E_USAGE_STATS", e.getMessage(), e);
        }
    }

    private boolean hasUsageStatsPermission() {
        Context ctx = getReactApplicationContext();
        AppOpsManager appOps = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
        if (appOps == null) {
            return false;
        }
        int mode = appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                ctx.getPackageName()
        );
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    private String resolveAppLabel(String packageName) {
        try {
            PackageManager pm = getReactApplicationContext().getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(packageName, 0);
            CharSequence label = pm.getApplicationLabel(info);
            return label != null ? label.toString() : packageName;
        } catch (PackageManager.NameNotFoundException e) {
            return packageName;
        }
    }
}
