package com.parentalcontrol;

import android.content.Intent;
import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;

/**
 * Exemple — fusionnez avec votre MainActivity existante.
 */
public class MainActivity extends ReactActivity {

  @Override
  protected String getMainComponentName() {
    return "YourAppName";
  }

  @Override
  protected ReactActivityDelegate createReactActivityDelegate() {
    return new DefaultReactActivityDelegate(
        this,
        getMainComponentName(),
        DefaultNewArchitectureEntryPoint.getFabricEnabled()
    );
  }

  @Override
  public void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    ScreenCaptureModule module = ScreenCaptureModule.getInstance();
    if (module != null) {
      module.onActivityResultFromActivity(requestCode, resultCode, data);
    }
  }
}
