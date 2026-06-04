package com.mobileapp.overlay;

import android.content.Intent;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;

/**
 * Holds mission params from notification tap until JS consumes them once.
 */
public final class OverlayLaunchHolder {

  private static final String EXTRA_MISSION_ID = "overlay_mission_id";
  private static final String EXTRA_TITLE = "overlay_mission_title";
  private static final String EXTRA_DESCRIPTION = "overlay_mission_description";
  private static final String EXTRA_POINTS = "overlay_mission_points";
  private static final String EXTRA_TYPE = "overlay_mission_type";
  private static final String EXTRA_METADATA = "overlay_mission_metadata";

  @Nullable private static WritableMap pending;

  private OverlayLaunchHolder() {}

  public static void setFromIntent(@Nullable Intent intent) {
    if (intent == null || !intent.hasExtra(EXTRA_MISSION_ID)) {
      return;
    }
    WritableMap map = Arguments.createMap();
    map.putString("missionId", intent.getStringExtra(EXTRA_MISSION_ID));
    map.putString("title", intent.getStringExtra(EXTRA_TITLE));
    map.putString("description", intent.getStringExtra(EXTRA_DESCRIPTION));
    map.putInt("points", intent.getIntExtra(EXTRA_POINTS, 0));
    map.putString("missionType", intent.getStringExtra(EXTRA_TYPE));
    map.putString("metadataJson", intent.getStringExtra(EXTRA_METADATA));
    pending = map;
    clearMissionIntentExtras(intent);
    OverlayEventBridge.emitPendingNotificationReady();
  }

  /** Prevent re-delivering the same notification mission on every activity restart. */
  public static void clearMissionIntentExtras(Intent intent) {
    intent.removeExtra(EXTRA_MISSION_ID);
    intent.removeExtra(EXTRA_TITLE);
    intent.removeExtra(EXTRA_DESCRIPTION);
    intent.removeExtra(EXTRA_POINTS);
    intent.removeExtra(EXTRA_TYPE);
    intent.removeExtra(EXTRA_METADATA);
  }

  public static void putExtras(Intent intent, String missionId, String title, String description,
      int points, String missionType, String metadataJson) {
    intent.putExtra(EXTRA_MISSION_ID, missionId);
    intent.putExtra(EXTRA_TITLE, title);
    intent.putExtra(EXTRA_DESCRIPTION, description);
    intent.putExtra(EXTRA_POINTS, points);
    intent.putExtra(EXTRA_TYPE, missionType);
    intent.putExtra(EXTRA_METADATA, metadataJson);
  }

  @Nullable
  public static WritableMap consumePending() {
    WritableMap map = pending;
    pending = null;
    return map;
  }

  public static void clearPending() {
    pending = null;
  }
}
