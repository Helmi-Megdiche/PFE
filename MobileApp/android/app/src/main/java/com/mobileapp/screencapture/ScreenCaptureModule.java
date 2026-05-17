package com.mobileapp.screencapture;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.PowerManager;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.WindowManager;

import androidx.annotation.Nullable;
import androidx.core.content.FileProvider;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.mobileapp.MediaProjectionForegroundService;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Android MediaProjection screen capture (API 29+).
 * Saves JPEG frames to app-private storage and notifies JS with file paths.
 * Screenshots never leave the device — JS runs on-device OCR only.
 */
public class ScreenCaptureModule extends ReactContextBaseJavaModule
        implements ActivityEventListener, LifecycleEventListener {

    private static final String TAG = "ScreenCaptureModule";
    public static final String NAME = "ScreenCapture";
    public static final int REQUEST_MEDIA_PROJECTION = 10042;
    public static final String EVENT_SCREEN_CAPTURED = "onScreenCaptured";
    public static final String EVENT_CAPTURE_ERROR = "onScreenCaptureError";
    public static final String EVENT_DEBUG_LOG = "onScreenCaptureLog";

    private static final int MIN_BATTERY_PERCENT = 15;
    private static final String VIRTUAL_DISPLAY_NAME = "PFE_ScreenCapture";
    private static final String CAPTURES_DIR = "screen_captures";

    private final ReactApplicationContext reactContext;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private MediaProjectionManager projectionManager;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;

    private HandlerThread captureThread;
    private Handler captureHandler;

    private int intervalMs = 30_000;
    private int screenWidth;
    private int screenHeight;
    private int screenDensity;

    private final AtomicBoolean isRunning = new AtomicBoolean(false);
    private final AtomicBoolean isPaused = new AtomicBoolean(false);
    private final AtomicBoolean isProjectionReady = new AtomicBoolean(false);
    private final AtomicBoolean isFrameInProgress = new AtomicBoolean(false);
    private final AtomicBoolean isForegroundServiceRunning = new AtomicBoolean(false);

    private Runnable captureLoopRunnable;
    private Promise permissionPromise;

    /** Singleton for optional MainActivity forwarding. */
    private static volatile ScreenCaptureModule instance;

    public ScreenCaptureModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        instance = this;
        reactContext.addActivityEventListener(this);
        reactContext.addLifecycleEventListener(this);
        projectionManager = (MediaProjectionManager)
                reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        updateDisplayMetrics();
    }

    public static ScreenCaptureModule getInstance() {
        return instance;
    }

    @Override
    public String getName() {
        return NAME;
    }

  // ---------------------------------------------------------------------------
  // Permission — Activity forwards onActivityResult or ActivityEventListener
  // ---------------------------------------------------------------------------

    /**
     * Returns the request code so MainActivity can forward onActivityResult if needed.
     */
    @ReactMethod
    public void getPermissionRequestCode(Promise promise) {
        promise.resolve(REQUEST_MEDIA_PROJECTION);
    }

    /** Debug snapshot for Metro logs (call from JS). */
    @ReactMethod
    public void getDebugState(Promise promise) {
        WritableMap state = Arguments.createMap();
        state.putBoolean("hasMediaProjection", mediaProjection != null);
        state.putBoolean("isProjectionReady", isProjectionReady.get());
        state.putBoolean("isRunning", isRunning.get());
        state.putBoolean("isPaused", isPaused.get());
        state.putBoolean("hasVirtualDisplay", virtualDisplay != null);
        state.putBoolean("hasForegroundService", isForegroundServiceRunning.get());
        state.putBoolean("hasPermissionPromise", permissionPromise != null);
        state.putInt("intervalMs", intervalMs);
        promise.resolve(state);
    }

    private void logJs(String message) {
        Log.i(TAG, message);
        WritableMap map = Arguments.createMap();
        map.putString("message", message);
        sendEvent(EVENT_DEBUG_LOG, map);
    }

    /**
     * Starts the system MediaProjection consent dialog from the current Activity.
     */
    @ReactMethod
    public void requestPermission(Promise promise) {
        logJs("requestPermission() called");
        Activity activity = getCurrentActivity();
        if (activity == null) {
            logJs("requestPermission FAILED: no Activity");
            promise.reject("E_NO_ACTIVITY", "No foreground Activity to request MediaProjection");
            return;
        }
        if (mediaProjection != null && isProjectionReady.get()) {
            logJs("requestPermission: already granted");
            promise.resolve(true);
            return;
        }
        permissionPromise = promise;
        try {
            startMediaProjectionForegroundService();
            logJs("requestPermission: launching system consent dialog");
            activity.startActivityForResult(
                    projectionManager.createScreenCaptureIntent(),
                    REQUEST_MEDIA_PROJECTION
            );
        } catch (Exception e) {
            permissionPromise = null;
            logJs("requestPermission FAILED: " + e.getMessage());
            promise.reject("E_PERMISSION", "Failed to launch MediaProjection consent", e);
        }
    }

    @ReactMethod
    public void isPermissionGranted(Promise promise) {
        boolean granted = mediaProjection != null && isProjectionReady.get();
        logJs("isPermissionGranted() => " + granted
                + " (projection=" + (mediaProjection != null)
                + ", ready=" + isProjectionReady.get() + ")");
        promise.resolve(granted);
    }

    /**
     * Public entry for MainActivity.onActivityResult forwarding.
     */
    public void onActivityResultFromActivity(int requestCode, int resultCode, @Nullable Intent data) {
        onActivityResult(getCurrentActivity(), requestCode, resultCode, data);
    }

    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_MEDIA_PROJECTION) {
            return;
        }

        logJs("onActivityResult: requestCode=" + requestCode
                + " resultCode=" + resultCode
                + " hasData=" + (data != null));

        // Guard: MainActivity + ActivityEventListener must not both consume the same result.
        if (permissionPromise == null && mediaProjection != null && isProjectionReady.get()) {
            logJs("onActivityResult IGNORED (duplicate — projection already active)");
            return;
        }

        Promise pending = permissionPromise;
        permissionPromise = null;

        if (resultCode != Activity.RESULT_OK || data == null) {
            Log.w(TAG, "MediaProjection permission denied");
            logJs("onActivityResult: user DENIED or cancelled");
            stopMediaProjectionForegroundService();
            if (pending != null) {
                pending.resolve(false);
            }
            emitError("MediaProjection permission denied");
            return;
        }

        try {
            startMediaProjectionForegroundService();
            // Only tear down a previous projection instance, not the result we are about to use.
            if (mediaProjection != null) {
                logJs("onActivityResult: releasing previous projection before new grant");
                releaseProjectionSession();
            }
            logJs("onActivityResult: calling getMediaProjection()");
            mediaProjection = projectionManager.getMediaProjection(resultCode, data);
            if (mediaProjection == null) {
                throw new IllegalStateException("getMediaProjection returned null");
            }
            mediaProjection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    Log.i(TAG, "MediaProjection stopped by system");
                    mainHandler.post(() -> releaseProjectionSession());
                }
            }, mainHandler);

            isProjectionReady.set(true);
            logJs("onActivityResult SUCCESS — projection ready (VirtualDisplay deferred to startCapture)");
            if (pending != null) {
                pending.resolve(true);
            } else {
                logJs("onActivityResult WARNING: permissionPromise was null");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize MediaProjection", e);
            logJs("onActivityResult FAILED: " + e.getMessage());
            releaseProjectionSession();
            if (pending != null) {
                pending.reject("E_PROJECTION", e.getMessage(), e);
            }
            emitError(e.getMessage() != null ? e.getMessage() : "MediaProjection init failed");
        }
    }

  // ---------------------------------------------------------------------------
  // Capture control
  // ---------------------------------------------------------------------------

    /**
     * Starts periodic capture. Each frame is delivered to JS via {@link #EVENT_SCREEN_CAPTURED}.
     * React Native Callback is one-shot, so periodic delivery uses events (see NATIVE_SETUP.md).
     */
    @ReactMethod
    public void startCapture(int intervalMs, Promise promise) {
        logJs("startCapture(" + intervalMs + ") — projection="
                + (mediaProjection != null) + " ready=" + isProjectionReady.get());
        if (mediaProjection == null || !isProjectionReady.get()) {
            logJs("startCapture REJECTED: E_NO_PERMISSION");
            promise.reject("E_NO_PERMISSION", "MediaProjection not granted — call requestPermission first");
            return;
        }
        if (intervalMs < 5_000) {
            promise.reject("E_INTERVAL", "Minimum capture interval is 5000ms");
            return;
        }

        this.intervalMs = intervalMs;

        if (isRunning.get()) {
            promise.resolve(true);
            return;
        }

        try {
            startMediaProjectionForegroundService();
            ensureVirtualDisplay();
            ensureCaptureThread();
            isRunning.set(true);
            isPaused.set(false);
            scheduleCaptureLoop();
            promise.resolve(true);
            logJs("startCapture SUCCESS — loop scheduled");
        } catch (Exception e) {
            Log.e(TAG, "startCapture failed", e);
            logJs("startCapture FAILED: " + e.getMessage());
            promise.reject("E_CAPTURE", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void stopCapture(Promise promise) {
        logJs("stopCapture()");
        isRunning.set(false);
        isPaused.set(false);
        cancelCaptureLoop();
        releaseProjectionSession();
        stopMediaProjectionForegroundService();
        promise.resolve(true);
        Log.i(TAG, "stopCapture — resources released");
    }

    @ReactMethod
    public void pauseCapture(Promise promise) {
        isPaused.set(true);
        promise.resolve(true);
        Log.i(TAG, "pauseCapture");
    }

    @ReactMethod
    public void resumeCapture(Promise promise) {
        if (!isProjectionReady.get()) {
            promise.reject("E_NO_PERMISSION", "MediaProjection not granted");
            return;
        }
        isPaused.set(false);
        if (isRunning.get()) {
            scheduleCaptureLoop();
        }
        promise.resolve(true);
        Log.i(TAG, "resumeCapture");
    }

    @ReactMethod
    public void deleteFile(String filePath, Promise promise) {
        try {
            File file = new File(filePath);
            boolean deleted = !file.exists() || file.delete();
            promise.resolve(deleted);
        } catch (Exception e) {
            promise.reject("E_DELETE", e.getMessage(), e);
        }
    }

  // ---------------------------------------------------------------------------
  // Lifecycle — auto-pause in background
  // ---------------------------------------------------------------------------

    @Override
    public void onHostResume() {
        if (isRunning.get() && isPaused.get()) {
            isPaused.set(false);
            scheduleCaptureLoop();
        }
    }

    @Override
    public void onHostPause() {
        if (isRunning.get()) {
            isPaused.set(true);
            cancelCaptureLoop();
        }
    }

    @Override
    public void onHostDestroy() {
        isRunning.set(false);
        cancelCaptureLoop();
        releaseProjectionSession();
        stopMediaProjectionForegroundService();
        shutdownCaptureThread();
    }

    @Override
    public void onNewIntent(Intent intent) {
        // no-op
    }

  // ---------------------------------------------------------------------------
  // Capture loop
  // ---------------------------------------------------------------------------

    private void scheduleCaptureLoop() {
        cancelCaptureLoop();
        captureLoopRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isRunning.get() || isPaused.get()) {
                    return;
                }
                if (shouldSkipCapture()) {
                    captureHandler.postDelayed(this, intervalMs);
                    return;
                }
                captureSingleFrame();
                captureHandler.postDelayed(this, intervalMs);
            }
        };
        captureHandler.post(captureLoopRunnable);
    }

    private void cancelCaptureLoop() {
        if (captureHandler != null && captureLoopRunnable != null) {
            captureHandler.removeCallbacks(captureLoopRunnable);
        }
        captureLoopRunnable = null;
    }

  /** Battery, screen off, or no foreground Activity. */
    private boolean shouldSkipCapture() {
        if (getBatteryPercent() < MIN_BATTERY_PERCENT) {
            Log.d(TAG, "Skipping capture — battery below " + MIN_BATTERY_PERCENT + "%");
            return true;
        }
        Activity activity = getCurrentActivity();
        if (activity == null) {
            Log.d(TAG, "Skipping capture — no foreground Activity");
            return true;
        }
        PowerManager pm = (PowerManager) reactContext.getSystemService(Context.POWER_SERVICE);
        if (pm != null && !pm.isInteractive()) {
            Log.d(TAG, "Skipping capture — screen off");
            return true;
        }
        return false;
    }

    private void captureSingleFrame() {
        if (!isProjectionReady.get() || imageReader == null) {
            emitError("MediaProjection not ready");
            return;
        }
        if (!isFrameInProgress.compareAndSet(false, true)) {
            Log.d(TAG, "Skipping capture — previous frame in progress");
            return;
        }

        captureHandler.post(() -> {
            Image image = null;
            try {
                image = imageReader.acquireLatestImage();
                if (image == null) {
                    isFrameInProgress.set(false);
                    return;
                }
                String path = saveImageToJpeg(image);
                if (path != null) {
                    emitScreenCaptured(path);
                }
            } catch (Exception e) {
                Log.e(TAG, "captureSingleFrame failed", e);
                emitError(e.getMessage() != null ? e.getMessage() : "Capture failed");
            } finally {
                if (image != null) {
                    image.close();
                }
                isFrameInProgress.set(false);
            }
        });
    }

    @Nullable
    private String saveImageToJpeg(Image image) throws IOException {
        Image.Plane[] planes = image.getPlanes();
        if (planes.length == 0) {
            return null;
        }

        ByteBuffer buffer = planes[0].getBuffer();
        int pixelStride = planes[0].getPixelStride();
        int rowStride = planes[0].getRowStride();
        int rowPadding = rowStride - pixelStride * screenWidth;

        Bitmap bitmap = Bitmap.createBitmap(
                screenWidth + rowPadding / pixelStride,
                screenHeight,
                Bitmap.Config.ARGB_8888
        );
        bitmap.copyPixelsFromBuffer(buffer);
        Bitmap cropped = Bitmap.createBitmap(bitmap, 0, 0, screenWidth, screenHeight);
        if (bitmap != cropped) {
            bitmap.recycle();
        }

        File dir = new File(reactContext.getFilesDir(), CAPTURES_DIR);
        if (!dir.exists() && !dir.mkdirs()) {
            cropped.recycle();
            throw new IOException("Cannot create captures directory");
        }

        File outFile = new File(dir, "screen_" + System.currentTimeMillis() + ".jpg");
        FileOutputStream fos = null;
        try {
            fos = new FileOutputStream(outFile);
            cropped.compress(Bitmap.CompressFormat.JPEG, 85, fos);
            fos.flush();
            return outFile.getAbsolutePath();
        } finally {
            cropped.recycle();
            if (fos != null) {
                try {
                    fos.close();
                } catch (IOException ignored) {
                    // ignore
                }
            }
        }
    }

  // ---------------------------------------------------------------------------
  // MediaProjection / VirtualDisplay
  // ---------------------------------------------------------------------------

    /** Creates a single VirtualDisplay for this MediaProjection session. */
    private void ensureVirtualDisplay() {
        if (virtualDisplay != null && imageReader != null) {
            return;
        }
        tearDownVirtualDisplay();
        if (mediaProjection == null) {
            throw new IllegalStateException("MediaProjection is null");
        }
        imageReader = ImageReader.newInstance(screenWidth, screenHeight, PixelFormat.RGBA_8888, 2);
        virtualDisplay = mediaProjection.createVirtualDisplay(
                VIRTUAL_DISPLAY_NAME,
                screenWidth,
                screenHeight,
                screenDensity,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                null,
                mainHandler
        );
    }

    private void tearDownVirtualDisplay() {
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
    }

    /** Android 14+ requires FGS type mediaProjection while capturing. */
    private void startMediaProjectionForegroundService() {
        if (isForegroundServiceRunning.get()) {
            return;
        }
        try {
            Intent serviceIntent = new Intent(reactContext, MediaProjectionForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(serviceIntent);
            } else {
                reactContext.startService(serviceIntent);
            }
            isForegroundServiceRunning.set(true);
            Log.i(TAG, "MediaProjection foreground service started");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start foreground service", e);
            throw new IllegalStateException(
                    "Media projections require a foreground service of type mediaProjection", e);
        }
    }

    private void stopMediaProjectionForegroundService() {
        if (!isForegroundServiceRunning.get()) {
            return;
        }
        try {
            Intent serviceIntent = new Intent(reactContext, MediaProjectionForegroundService.class);
            reactContext.stopService(serviceIntent);
            isForegroundServiceRunning.set(false);
            Log.i(TAG, "MediaProjection foreground service stopped");
        } catch (Exception e) {
            Log.w(TAG, "Failed to stop foreground service", e);
        }
    }

  /** Stops capture loop, VirtualDisplay, and MediaProjection token. */
    private void releaseProjectionSession() {
        tearDownVirtualDisplay();
        if (mediaProjection != null) {
            try {
                mediaProjection.stop();
            } catch (Exception e) {
                Log.w(TAG, "Error stopping MediaProjection", e);
            }
            mediaProjection = null;
        }
        isProjectionReady.set(false);
    }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

    private void ensureCaptureThread() {
        if (captureThread == null) {
            captureThread = new HandlerThread("ScreenCaptureThread");
            captureThread.start();
            captureHandler = new Handler(captureThread.getLooper());
        }
    }

    private void shutdownCaptureThread() {
        cancelCaptureLoop();
        if (captureThread != null) {
            captureThread.quitSafely();
            captureThread = null;
            captureHandler = null;
        }
    }

    private void updateDisplayMetrics() {
        WindowManager wm = (WindowManager) reactContext.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics metrics = new DisplayMetrics();
        if (wm != null) {
            wm.getDefaultDisplay().getRealMetrics(metrics);
            screenWidth = metrics.widthPixels;
            screenHeight = metrics.heightPixels;
            screenDensity = metrics.densityDpi;
        } else {
            screenWidth = 1080;
            screenHeight = 1920;
            screenDensity = 420;
        }
    }

    private int getBatteryPercent() {
        IntentFilter filter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
        Intent batteryStatus = reactContext.registerReceiver(null, filter);
        if (batteryStatus == null) {
            return 100;
        }
        int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        if (level < 0 || scale <= 0) {
            return 100;
        }
        return Math.round((level / (float) scale) * 100f);
    }

    private String toOcrUri(File file) {
        try {
            return FileProvider.getUriForFile(
                    reactContext,
                    reactContext.getPackageName() + ".fileprovider",
                    file
            ).toString();
        } catch (Exception e) {
            Log.w(TAG, "FileProvider failed, using file:// URI", e);
            return "file://" + file.getAbsolutePath();
        }
    }

    private void emitScreenCaptured(final String absolutePath) {
        mainHandler.post(() -> {
            File file = new File(absolutePath);
            String imageUri = toOcrUri(file);
            WritableMap map = Arguments.createMap();
            map.putString("filePath", absolutePath);
            map.putString("imageUri", imageUri);
            map.putString("appPackage", "unknown");
            map.putDouble("timestamp", System.currentTimeMillis());
            logJs("emitScreenCaptured uri=" + imageUri);
            sendEvent(EVENT_SCREEN_CAPTURED, map);
        });
    }

    private void emitError(final String message) {
        mainHandler.post(() -> {
            WritableMap map = Arguments.createMap();
            map.putString("message", message);
            sendEvent(EVENT_CAPTURE_ERROR, map);
        });
    }

    private void sendEvent(String eventName, WritableMap params) {
        if (reactContext.hasActiveCatalystInstance()) {
            reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, params);
        }
    }

    /** Required for RN event emitter. */
    @ReactMethod
    public void addListener(String eventName) {
        // Keep: Required for RN NativeEventEmitter
    }

    @ReactMethod
    public void removeListeners(Integer count) {
        // Keep: Required for RN NativeEventEmitter
    }
}
