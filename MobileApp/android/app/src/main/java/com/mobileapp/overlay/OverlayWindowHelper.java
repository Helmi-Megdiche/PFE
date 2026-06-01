package com.mobileapp.overlay;

import android.content.Context;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import com.mobileapp.R;

/**
 * Attaches/detaches the mission overlay WindowManager view (must run on main thread for add/remove).
 */
public final class OverlayWindowHelper {

    private static final String TAG = "OverlayWindowHelper";

  private OverlayWindowHelper() {}

  public interface ActionListener {
    /** Opens the in-app game/quiz screen (quiz, minigame, cognitive). */
    void onStart(String missionId, String missionType, String metadataJson);

    void onComplete(String missionId, String missionType, String metadataJson);

    void onAbandon(String missionId, String missionType, String metadataJson);
  }

  private static boolean isPlayableMissionType(String missionType) {
    return "quiz".equals(missionType)
        || "minigame".equals(missionType)
        || "cognitive".equals(missionType);
  }

  public static boolean canDrawOverlay(Context context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      return Settings.canDrawOverlays(context);
    }
    return true;
  }

  /**
   * @return the attached root view, or null if permission missing / addView failed
   */
  public static View attach(
      Context context,
      WindowManager windowManager,
      String missionId,
      String title,
      String description,
      int points,
      String missionType,
      String metadataJson,
      ActionListener listener) {
    if (!canDrawOverlay(context)) {
      Log.e(TAG, "attach blocked — SYSTEM_ALERT_WINDOW not granted");
      Toast.makeText(
              context,
              "Allow \"Display over other apps\" for mission blocking",
              Toast.LENGTH_LONG)
          .show();
      return null;
    }

    LayoutInflater inflater = LayoutInflater.from(context);
    View root = inflater.inflate(R.layout.overlay_mission, null);

    TextView titleView = root.findViewById(R.id.overlay_title);
    TextView descView = root.findViewById(R.id.overlay_description);
    TextView pointsView = root.findViewById(R.id.overlay_points);
    Button completeBtn = root.findViewById(R.id.overlay_btn_complete);
    Button laterBtn = root.findViewById(R.id.overlay_btn_later);

    titleView.setText(title);
    descView.setText(description);
    pointsView.setText(points + " points · " + missionType);
    completeBtn.setText(resolveCompleteLabel(context, missionType));

    final boolean[] actionSent = {false};

    completeBtn.setOnClickListener(
        v -> {
          if (actionSent[0]) {
            return;
          }
          actionSent[0] = true;
          setButtonsEnabled(completeBtn, laterBtn, false);
          if (isPlayableMissionType(missionType)) {
            listener.onStart(missionId, missionType, metadataJson);
          } else {
            listener.onComplete(missionId, missionType, metadataJson);
          }
        });

    laterBtn.setOnClickListener(
        v -> {
          if (actionSent[0]) {
            return;
          }
          actionSent[0] = true;
          setButtonsEnabled(completeBtn, laterBtn, false);
          listener.onAbandon(missionId, missionType, metadataJson);
        });

    int overlayType =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

    WindowManager.LayoutParams params =
        new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            PixelFormat.TRANSLUCENT);
    params.gravity = Gravity.TOP | Gravity.START;

    try {
      windowManager.addView(root, params);
      Log.i(TAG, "overlay attached missionId=" + missionId);
      return root;
    } catch (Exception e) {
      Log.e(TAG, "addView failed", e);
      Toast.makeText(context, "Could not show mission overlay: " + e.getMessage(), Toast.LENGTH_LONG)
          .show();
      return null;
    }
  }

  public static void detach(WindowManager windowManager, View overlayView) {
    if (windowManager == null || overlayView == null) {
      return;
    }
    try {
      windowManager.removeView(overlayView);
      Log.i(TAG, "overlay detached");
    } catch (Exception e) {
      Log.w(TAG, "removeView: " + e.getMessage());
    }
  }

  public static void detachOnMainThread(
      Handler mainHandler, WindowManager windowManager, View overlayView) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      detach(windowManager, overlayView);
    } else {
      mainHandler.post(() -> detach(windowManager, overlayView));
    }
  }

  private static int resolveCompleteLabel(Context context, String missionType) {
    switch (missionType) {
      case "real_world":
        return R.string.overlay_mission_complete_real_world;
      case "quiz":
        return R.string.overlay_mission_start_quiz;
      case "cognitive":
        return R.string.overlay_mission_start_cognitive;
      case "minigame":
        return R.string.overlay_mission_start_minigame;
      default:
        return R.string.overlay_mission_complete_default;
    }
  }

  private static void setButtonsEnabled(Button complete, Button later, boolean enabled) {
    complete.setEnabled(enabled);
    later.setEnabled(enabled);
    complete.setAlpha(enabled ? 1f : 0.5f);
    later.setAlpha(enabled ? 1f : 0.5f);
  }
}
