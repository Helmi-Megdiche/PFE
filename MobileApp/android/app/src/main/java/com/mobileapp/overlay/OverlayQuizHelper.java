package com.mobileapp.overlay;

import android.content.Context;
import android.graphics.Color;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Renders quiz questions inside the mission overlay (stays on top of Chrome).
 */
public final class OverlayQuizHelper {

    private OverlayQuizHelper() {}

    public interface QuizFinishedListener {
        void onQuizFinished(String missionId, String missionType, String metadataJson);

        void onQuizNeedsInApp(
                String missionId,
                String title,
                int points,
                String missionType,
                String metadataJson);
    }

    public static void showQuiz(
            Context context,
            View overlayRoot,
            String missionId,
            String title,
            int points,
            String metadataJson,
            QuizFinishedListener listener) {
        if (!(overlayRoot instanceof ViewGroup)) {
            listener.onQuizNeedsInApp(
                    missionId, title, points, "quiz", metadataJson);
            return;
        }
        ViewGroup rootGroup = (ViewGroup) overlayRoot;
        rootGroup.removeAllViews();

        JSONArray questions;
        try {
            JSONObject meta = new JSONObject(metadataJson != null ? metadataJson : "{}");
            questions = meta.optJSONArray("questions");
            if (questions == null || questions.length() == 0) {
                listener.onQuizNeedsInApp(
                        missionId, title, points, "quiz", metadataJson);
                return;
            }
        } catch (Exception e) {
            listener.onQuizNeedsInApp(
                    missionId, title, points, "quiz", metadataJson);
            return;
        }

        final JSONArray submittedAnswers = new JSONArray();

        LinearLayout card = buildCard(context);
        TextView badge = new TextView(context);
        badge.setText(context.getString(com.mobileapp.R.string.overlay_mission_badge));
        badge.setTextColor(Color.parseColor("#FBBF24"));
        badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        badge.setTypeface(null, android.graphics.Typeface.BOLD);
        card.addView(badge);

        TextView titleView = new TextView(context);
        titleView.setText(title != null ? title : "Quiz");
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        titleView.setTypeface(null, android.graphics.Typeface.BOLD);
        titleView.setPadding(0, dp(context, 8), 0, 0);
        card.addView(titleView);

        TextView pointsView = new TextView(context);
        pointsView.setText(points + " points · quiz");
        pointsView.setTextColor(Color.parseColor("#94A3B8"));
        pointsView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        pointsView.setPadding(0, dp(context, 8), 0, dp(context, 12));
        card.addView(pointsView);

        ScrollView scroll = new ScrollView(context);
        LinearLayout quizBody = new LinearLayout(context);
        quizBody.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(quizBody, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        final int[] index = {0};
        final TextView progress = new TextView(context);
        progress.setTextColor(Color.parseColor("#94A3B8"));
        progress.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        progress.setGravity(Gravity.CENTER_HORIZONTAL);
        progress.setPadding(0, 0, 0, dp(context, 8));
        quizBody.addView(progress);

        final TextView questionView = new TextView(context);
        questionView.setTextColor(Color.WHITE);
        questionView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        questionView.setTypeface(null, android.graphics.Typeface.BOLD);
        questionView.setPadding(0, 0, 0, dp(context, 12));
        quizBody.addView(questionView);

        LinearLayout optionsLayout = new LinearLayout(context);
        optionsLayout.setOrientation(LinearLayout.VERTICAL);
        quizBody.addView(optionsLayout);

        final String metaJson = metadataJson != null ? metadataJson : "{}";
        final Runnable[] renderQuestion = new Runnable[1];
        renderQuestion[0] =
                () -> {
                    optionsLayout.removeAllViews();
                    if (index[0] >= questions.length()) {
                        try {
                            JSONObject meta = new JSONObject(metaJson);
                            meta.put("submittedAnswers", submittedAnswers);
                            listener.onQuizFinished(
                                    missionId, "quiz", meta.toString());
                        } catch (Exception e) {
                            listener.onQuizFinished(missionId, "quiz", metaJson);
                        }
                        return;
                    }
                    try {
                        JSONObject q = questions.getJSONObject(index[0]);
                        progress.setText(
                                "Question "
                                        + (index[0] + 1)
                                        + " / "
                                        + questions.length());
                        questionView.setText(q.optString("text", "Question"));
                        JSONArray opts = q.optJSONArray("options");
                        int count = opts != null ? opts.length() : 0;
                        for (int i = 0; i < count; i++) {
                            final int optionIndex = i;
                            Button optBtn = new Button(context);
                            optBtn.setText(
                                    (char) ('A' + i) + ". " + opts.optString(i, ""));
                            optBtn.setAllCaps(false);
                            optBtn.setTextColor(Color.WHITE);
                            optBtn.setBackgroundColor(Color.parseColor("#1E293B"));
                            LinearLayout.LayoutParams lp =
                                    new LinearLayout.LayoutParams(
                                            LinearLayout.LayoutParams.MATCH_PARENT,
                                            LinearLayout.LayoutParams.WRAP_CONTENT);
                            lp.topMargin = dp(context, 8);
                            optBtn.setOnClickListener(
                                    v -> {
                                        submittedAnswers.put(
                                                String.valueOf((char) ('A' + optionIndex)));
                                        index[0] += 1;
                                        renderQuestion[0].run();
                                    });
                            optionsLayout.addView(optBtn, lp);
                        }
                    } catch (Exception e) {
                        listener.onQuizNeedsInApp(
                                missionId, title, points, "quiz", metaJson);
                    }
                };

        renderQuestion[0].run();
        card.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        android.widget.FrameLayout.LayoutParams rootLp =
                new android.widget.FrameLayout.LayoutParams(
                        android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                        android.widget.FrameLayout.LayoutParams.MATCH_PARENT);
        rootLp.gravity = Gravity.CENTER;
        rootLp.setMargins(dp(context, 20), dp(context, 32), dp(context, 20), dp(context, 32));
        if (rootGroup instanceof android.widget.FrameLayout) {
            ((android.widget.FrameLayout) rootGroup).addView(card, rootLp);
        } else {
            rootGroup.addView(card);
        }
    }

    private static LinearLayout buildCard(Context context) {
        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackgroundResource(com.mobileapp.R.drawable.overlay_mission_card);
        card.setPadding(dp(context, 20), dp(context, 20), dp(context, 20), dp(context, 20));
        card.setElevation(dp(context, 12));
        return card;
    }

    private static int dp(Context context, int value) {
        float density = context.getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }
}
