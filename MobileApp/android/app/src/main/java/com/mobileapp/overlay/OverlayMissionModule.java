package com.mobileapp.overlay;

import android.content.Intent;
import android.os.Build;
import android.provider.Settings;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

@ReactModule(name = OverlayMissionModule.NAME)
public class OverlayMissionModule extends ReactContextBaseJavaModule {

    public static final String NAME = "OverlayMission";

    public OverlayMissionModule(ReactApplicationContext reactContext) {
        super(reactContext);
        OverlayEventBridge.attach(reactContext);
    }

    @Override
    public void invalidate() {
        OverlayEventBridge.detach();
        super.invalidate();
    }

    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void flushPendingOverlayEvents(Promise promise) {
        OverlayEventBridge.flushPending();
        promise.resolve(true);
    }

    @ReactMethod
    public void showOverlay(
            String missionId,
            String title,
            String description,
            int points,
            String missionType,
            String metadataJson,
            Promise promise) {
        try {
            ReactApplicationContext ctx = getReactApplicationContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    && !Settings.canDrawOverlays(ctx)) {
                promise.reject(
                        "E_NO_OVERLAY_PERMISSION",
                        "Display over other apps permission is not granted");
                return;
            }
            Intent intent = new Intent(ctx, OverlayService.class);
            intent.putExtra(OverlayService.EXTRA_MISSION_ID, missionId);
            intent.putExtra(OverlayService.EXTRA_TITLE, title);
            intent.putExtra(OverlayService.EXTRA_DESCRIPTION, description);
            intent.putExtra(OverlayService.EXTRA_POINTS, points);
            intent.putExtra(OverlayService.EXTRA_MISSION_TYPE, missionType);
            intent.putExtra(OverlayService.EXTRA_METADATA_JSON, metadataJson);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("E_SHOW_OVERLAY", "Failed to show mission overlay", e);
        }
    }

    @ReactMethod
    public void hideOverlay(Promise promise) {
        try {
            ReactApplicationContext ctx = getReactApplicationContext();
            OverlayService service = OverlayService.getRunningInstance();
            if (service != null) {
                service.removeOverlay();
                service.stopForeground(true);
                service.stopSelf();
            }
            Intent intent = new Intent(ctx, OverlayService.class);
            intent.setAction(OverlayService.ACTION_HIDE);
            ctx.startService(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("E_HIDE_OVERLAY", "Failed to hide mission overlay", e);
        }
    }

    /** Required for NativeEventEmitter. */
    @ReactMethod
    public void addListener(String eventName) {
        // Stub — events use RCTDeviceEventEmitter
    }

    @ReactMethod
    public void removeListeners(double count) {
        // Stub
    }
}
