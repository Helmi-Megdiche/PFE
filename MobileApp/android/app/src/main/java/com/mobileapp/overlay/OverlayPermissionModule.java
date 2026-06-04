package com.mobileapp.overlay;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.mobileapp.MainActivity;
import com.mobileapp.R;

/**
 * SYSTEM_ALERT_WINDOW permission and mission notification fallback.
 */
public class OverlayPermissionModule extends ReactContextBaseJavaModule {

    public static final String NAME = "OverlayPermission";
    private static final String MISSION_CHANNEL_ID = "pfe_mission_alerts";
    private static final int MISSION_NOTIFICATION_ID = 2001;

    public OverlayPermissionModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void hasOverlayPermission(Promise promise) {
        promise.resolve(canDrawOverlays());
    }

    @ReactMethod
    public void requestOverlayPermission(Promise promise) {
        try {
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getReactApplicationContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("E_OVERLAY_SETTINGS", "Cannot open overlay permission settings", e);
        }
    }

    @ReactMethod
    public void showMissionNotification(
            String missionId,
            String title,
            String description,
            int points,
            String missionType,
            String metadataJson,
            Promise promise) {
        try {
            ReactApplicationContext ctx = getReactApplicationContext();
            ensureMissionChannel(ctx);

            Intent launch = new Intent(ctx, MainActivity.class);
            launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            OverlayLaunchHolder.putExtras(
                    launch, missionId, title, description, points, missionType, metadataJson);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pending = PendingIntent.getActivity(ctx, MISSION_NOTIFICATION_ID, launch, flags);

            String body = description != null && !description.isEmpty()
                    ? description
                    : ctx.getString(R.string.mission_notification_title);

            Notification notification = new NotificationCompat.Builder(ctx, MISSION_CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_dialog_alert)
                    .setContentTitle(title != null ? title : ctx.getString(R.string.mission_notification_title))
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true)
                    .setContentIntent(pending)
                    .build();

            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.notify(MISSION_NOTIFICATION_ID, notification);
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("E_NOTIFICATION", "Failed to show mission notification", e);
        }
    }

    @ReactMethod
    public void getPendingNotificationMission(Promise promise) {
        promise.resolve(OverlayLaunchHolder.consumePending());
    }

    @ReactMethod
    public void clearPendingNotificationMission(Promise promise) {
        OverlayLaunchHolder.clearPending();
        promise.resolve(true);
    }

    private boolean canDrawOverlays() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return Settings.canDrawOverlays(getReactApplicationContext());
        }
        return true;
    }

    private static void ensureMissionChannel(ReactApplicationContext ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    MISSION_CHANNEL_ID,
                    ctx.getString(R.string.mission_notification_channel_name),
                    NotificationManager.IMPORTANCE_HIGH);
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }
}
