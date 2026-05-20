package com.mobileapp.foreground;

import android.app.ActivityManager;
import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

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
 * Resolves foreground app via UsageStatsManager, with ActivityManager fallback.
 */
public class ForegroundAppModule extends ReactContextBaseJavaModule {

    private static final String TAG = "ForegroundAppModule";
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

    /** Alias for JS clarity (Sprint 3.7). */
    @ReactMethod
    public void hasUsageStatsPermission(Promise promise) {
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

    /**
     * Returns foreground package + label. Never rejects — uses fallback when Usage access is missing.
     */
    @ReactMethod
    public void getCurrentForegroundApp(Promise promise) {
        Log.d(TAG, "getCurrentForegroundApp() called");
        try {
            String ownPackage = getReactApplicationContext().getPackageName();

            if (hasUsageStatsPermission()) {
                WritableMap usage = resolveFromUsageStats(ownPackage);
                if (usage != null) {
                    usage.putString("source", "usage_stats");
                    Log.d(TAG, "getCurrentForegroundApp usage_stats => "
                            + usage.getString("packageName"));
                    promise.resolve(usage);
                    return;
                }
            } else {
                Log.w(TAG, "Usage access not granted — trying ActivityManager fallback");
            }

            WritableMap fallback = resolveFromActivityManager(ownPackage);
            if (fallback != null) {
                fallback.putString("source", "activity_manager");
                Log.d(TAG, "getCurrentForegroundApp fallback => "
                        + fallback.getString("packageName"));
                promise.resolve(fallback);
                return;
            }

            Log.w(TAG, "getCurrentForegroundApp => null (no foreground detected)");
            promise.resolve(null);
        } catch (Exception e) {
            Log.e(TAG, "getCurrentForegroundApp failed", e);
            promise.reject("E_FOREGROUND", e.getMessage(), e);
        }
    }

    private WritableMap resolveFromUsageStats(String ownPackage) {
        UsageStatsManager usm = (UsageStatsManager)
                getReactApplicationContext().getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) {
            return null;
        }

        long end = System.currentTimeMillis();
        long start = end - 15_000;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            WritableMap fromEvents = resolveFromUsageEvents(usm, start, end, ownPackage);
            if (fromEvents != null) {
                return fromEvents;
            }
        }

        List<UsageStats> stats = usm.queryUsageStats(
                UsageStatsManager.INTERVAL_BEST,
                start,
                end
        );

        if (stats == null || stats.isEmpty()) {
            return null;
        }

        SortedMap<Long, UsageStats> sorted = new TreeMap<>();
        for (UsageStats usage : stats) {
            if (usage.getLastTimeUsed() > 0
                    && !ownPackage.equals(usage.getPackageName())) {
                sorted.put(usage.getLastTimeUsed(), usage);
            }
        }

        if (sorted.isEmpty()) {
            return null;
        }

        UsageStats recent = sorted.get(sorted.lastKey());
        return buildResult(recent.getPackageName(), recent.getLastTimeUsed());
    }

    private WritableMap resolveFromUsageEvents(
            UsageStatsManager usm,
            long start,
            long end,
            String ownPackage
    ) {
        UsageEvents events = usm.queryEvents(start, end);
        if (events == null) {
            return null;
        }

        String lastPackage = null;
        long lastTime = 0;
        UsageEvents.Event event = new UsageEvents.Event();

        while (events.hasNextEvent()) {
            events.getNextEvent(event);
            int type = event.getEventType();
            if (type == UsageEvents.Event.MOVE_TO_FOREGROUND
                    || type == UsageEvents.Event.ACTIVITY_RESUMED) {
                String pkg = event.getPackageName();
                if (pkg != null && !ownPackage.equals(pkg) && event.getTimeStamp() >= lastTime) {
                    lastTime = event.getTimeStamp();
                    lastPackage = pkg;
                }
            }
        }

        if (lastPackage == null) {
            return null;
        }
        return buildResult(lastPackage, lastTime);
    }

    private WritableMap resolveFromActivityManager(String ownPackage) {
        ActivityManager am = (ActivityManager)
                getReactApplicationContext().getSystemService(Context.ACTIVITY_SERVICE);
        if (am == null) {
            return null;
        }

        List<ActivityManager.RunningAppProcessInfo> processes = am.getRunningAppProcesses();
        if (processes == null) {
            return null;
        }

        for (ActivityManager.RunningAppProcessInfo proc : processes) {
            if (proc.importance != ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
                continue;
            }
            String packageName = proc.pkgList != null && proc.pkgList.length > 0
                    ? proc.pkgList[0]
                    : proc.processName;
            if (packageName == null || ownPackage.equals(packageName)) {
                continue;
            }
            if (packageName.contains(":")) {
                packageName = packageName.split(":")[0];
            }
            if (ownPackage.equals(packageName)) {
                continue;
            }
            return buildResult(packageName, System.currentTimeMillis());
        }

        return null;
    }

    private WritableMap buildResult(String packageName, long lastTimeUsed) {
        WritableMap map = Arguments.createMap();
        map.putString("packageName", packageName);
        map.putString("appLabel", resolveAppLabel(packageName));
        map.putDouble("lastTimeUsed", lastTimeUsed);
        return map;
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
