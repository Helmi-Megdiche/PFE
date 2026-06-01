package com.mobileapp.overlay;

import android.content.Context;
import android.content.Intent;

import com.mobileapp.MainActivity;

/** Brings SafeGuard to the foreground so MissionScreen can host minigames / cognitive tasks. */
public final class OverlayMissionLauncher {

    private OverlayMissionLauncher() {}

    public static void launchMissionApp(
            Context context,
            String missionId,
            String title,
            String description,
            int points,
            String missionType,
            String metadataJson) {
        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        OverlayLaunchHolder.putExtras(
                launch, missionId, title, description, points, missionType, metadataJson);
        context.startActivity(launch);
    }
}
