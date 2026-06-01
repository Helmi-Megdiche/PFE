package com.mobileapp.overlay;

import android.util.Log;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * Emits overlay events to JavaScript when React is active; queues when backgrounded.
 */
public final class OverlayEventBridge {

    private static final String TAG = "OverlayEventBridge";

    public static final String EVENT_MISSION_ACTION = "onOverlayMissionAction";

    @Nullable
    private static ReactApplicationContext reactContext;

    @Nullable
    private static WritableMap pendingAction;

    private OverlayEventBridge() {}

    public static void attach(ReactApplicationContext context) {
        reactContext = context;
        flushPending();
    }

    public static void detach() {
        reactContext = null;
    }

    public static void emitMissionAction(
            String missionId,
            String action,
            String missionType,
            String metadataJson) {
        WritableMap map = Arguments.createMap();
        map.putString("missionId", missionId);
        map.putString("action", action);
        map.putString("missionType", missionType);
        map.putString("metadataJson", metadataJson != null ? metadataJson : "{}");
        if (!emit(EVENT_MISSION_ACTION, map)) {
            WritableMap queued = Arguments.createMap();
            queued.putString("missionId", missionId);
            queued.putString("action", action);
            queued.putString("missionType", missionType);
            queued.putString("metadataJson", metadataJson != null ? metadataJson : "{}");
            pendingAction = queued;
            Log.i(TAG, "queued overlay action (React not active): " + action);
        }
    }

    /** Call when app returns to foreground so Complete/Later still reach JS. */
    public static void flushPending() {
        WritableMap map = pendingAction;
        if (map == null) {
            return;
        }
        if (emit(EVENT_MISSION_ACTION, map)) {
            pendingAction = null;
            Log.i(TAG, "flushed queued overlay action");
        }
    }

    private static boolean emit(String eventName, WritableMap params) {
        ReactApplicationContext ctx = reactContext;
        if (ctx == null) {
            Log.w(TAG, "emit skipped — no React context: " + eventName);
            return false;
        }
        if (!ctx.hasActiveReactInstance()) {
            Log.w(TAG, "emit skipped — no active React instance: " + eventName);
            return false;
        }
        try {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, params);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "emit failed: " + eventName, e);
            return false;
        }
    }
}
