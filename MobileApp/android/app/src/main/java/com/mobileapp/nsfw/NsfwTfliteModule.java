package com.mobileapp.nsfw;

import android.content.res.AssetFileDescriptor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import org.tensorflow.lite.Interpreter;

import java.io.File;
import java.io.FileInputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Yahoo Open NSFW TFLite inference (same preprocessing as flutter_nude_checker).
 * Model: android/app/src/main/assets/models/nsfw.tflite
 */
public class NsfwTfliteModule extends ReactContextBaseJavaModule {

    private static final String TAG = "NsfwTflite";
    private static final String MODEL_ASSET = "models/nsfw.tflite";
    private static final int INPUT_WIDTH = 224;
    private static final int INPUT_HEIGHT = 224;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean initialized = new AtomicBoolean(false);
    private Interpreter interpreter;

    public NsfwTfliteModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "NsfwTflite";
    }

    @ReactMethod
    public void initModel(Promise promise) {
        executor.execute(() -> {
            try {
                ensureInterpreter();
                promise.resolve(true);
            } catch (Exception e) {
                Log.e(TAG, "initModel failed", e);
                promise.reject("INIT_FAILED", e.getMessage(), e);
            }
        });
    }

    @ReactMethod
    public void isModelLoaded(Promise promise) {
        promise.resolve(initialized.get());
    }

    @ReactMethod
    public void classifyImage(String imagePath, Promise promise) {
        executor.execute(() -> {
            try {
                ensureInterpreter();
                String path = normalizePath(imagePath);
                Bitmap bitmap = BitmapFactory.decodeFile(path);
                if (bitmap == null) {
                    promise.reject("DECODE_FAILED", "Could not decode image: " + path);
                    return;
                }
                WritableMap result = scanBitmap(bitmap);
                bitmap.recycle();
                promise.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "classifyImage failed", e);
                promise.reject("CLASSIFY_FAILED", e.getMessage(), e);
            }
        });
    }

    private synchronized void ensureInterpreter() throws Exception {
        if (initialized.get()) {
            return;
        }
        ReactApplicationContext ctx = getReactApplicationContext();
        AssetFileDescriptor afd = ctx.getAssets().openFd(MODEL_ASSET);
        FileInputStream fis = new FileInputStream(afd.getFileDescriptor());
        FileChannel channel = fis.getChannel();
        MappedByteBuffer buffer = channel.map(
                FileChannel.MapMode.READ_ONLY,
                afd.getStartOffset(),
                afd.getDeclaredLength());
        Interpreter.Options options = new Interpreter.Options();
        options.setNumThreads(4);
        interpreter = new Interpreter(buffer, options);
        initialized.set(true);
        Log.i(TAG, "Loaded " + MODEL_ASSET);
    }

    private static String normalizePath(String path) {
        if (path == null) {
            return "";
        }
        String p = path.trim();
        if (p.startsWith("file://")) {
            p = p.substring(7);
        }
        return p;
    }

    private WritableMap scanBitmap(Bitmap bitmap) {
        long startMs = SystemClock.uptimeMillis();
        Bitmap resized = Bitmap.createScaledBitmap(bitmap, 256, 256, true);
        ByteBuffer input = convertBitmapToByteBuffer(resized);
        if (resized != bitmap) {
            resized.recycle();
        }

        float[][] output = new float[1][2];
        synchronized (this) {
            interpreter.run(input, output);
        }

        float sfw = output[0][0];
        float nsfw = output[0][1];
        long elapsedMs = SystemClock.uptimeMillis() - startMs;

        WritableMap map = Arguments.createMap();
        map.putDouble("sfwScore", sfw);
        map.putDouble("nsfwScore", nsfw);
        map.putDouble("elapsedMs", elapsedMs);
        return map;
    }

    /** Center-crop 224×224, BGR float with Yahoo mean subtraction (104, 117, 123). */
    private static ByteBuffer convertBitmapToByteBuffer(Bitmap bitmap) {
        ByteBuffer imgData = ByteBuffer.allocateDirect(INPUT_WIDTH * INPUT_HEIGHT * 3 * 4);
        imgData.order(ByteOrder.nativeOrder());
        int[] intValues = new int[INPUT_WIDTH * INPUT_HEIGHT];
        int cropX = Math.max((bitmap.getWidth() - INPUT_WIDTH) / 2, 0);
        int cropY = Math.max((bitmap.getHeight() - INPUT_HEIGHT) / 2, 0);
        bitmap.getPixels(
                intValues,
                0,
                INPUT_WIDTH,
                cropX,
                cropY,
                INPUT_WIDTH,
                INPUT_HEIGHT);

        for (int color : intValues) {
            imgData.putFloat((Color.blue(color) - 104f));
            imgData.putFloat((Color.green(color) - 117f));
            imgData.putFloat((Color.red(color) - 123f));
        }
        imgData.rewind();
        return imgData;
    }

    @Override
    public void invalidate() {
        executor.shutdown();
        if (interpreter != null) {
            interpreter.close();
            interpreter = null;
        }
        initialized.set(false);
        super.invalidate();
    }
}
