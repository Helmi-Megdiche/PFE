# Configuration native Android — ScreenCapture (Java)

Package par défaut : `com.parentalcontrol` — adaptez à votre `applicationId` si différent.

## 1. Dépendances npm

```bash
cd mobile
npm install @react-native-ml-kit/text-recognition
```

`react-native-fs` est **optionnel** : les chemins absolus retournés par le module natif suffisent pour ML Kit.

## 2. AndroidManifest.xml

Dans `android/app/src/main/AndroidManifest.xml` :

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />

<application ...>
  <!-- Service foreground recommandé Sprint 5 pour captures longues -->
</application>
```

## 3. build.gradle (app)

`android/app/build.gradle` :

```gradle
android {
    defaultConfig {
        minSdkVersion 29   // MediaProjection stable API 29+
    }
}

dependencies {
    // ML Kit Text Recognition (si non résolu par autolinking)
    implementation 'com.google.mlkit:text-recognition:16.0.1'
}
```

`android/build.gradle` — vérifiez `compileSdkVersion 34` ou supérieur.

## 4. MainApplication.java

```java
import com.parentalcontrol.ScreenCapturePackage;

@Override
protected List<ReactPackage> getPackages() {
  List<ReactPackage> packages = new PackageList(this).getPackages();
  packages.add(new ScreenCapturePackage());
  return packages;
}
```

## 5. MainActivity.java

Le module implémente déjà `ActivityEventListener`. Pour une redirection explicite :

```java
import android.content.Intent;
import com.parentalcontrol.ScreenCaptureModule;

public class MainActivity extends ReactActivity {

  @Override
  public void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    ScreenCaptureModule module = ScreenCaptureModule.getInstance();
    if (module != null) {
      module.onActivityResultFromActivity(requestCode, resultCode, data);
    }
  }
}
```

## 6. Rebuild

```bash
cd android && ./gradlew clean && cd ..
npx react-native run-android
```

## 7. Tests manuels

| Test | Attendu |
|------|---------|
| Permission MediaProjection | Popup système → `isPermissionGranted` = true |
| Toggle monitoring | Logs `startCapture`, événements `onScreenCaptured` |
| OCR + API | Lignes dans `screen_events` avec `extracted_text_preview`, **sans** image |
| Batterie &lt; 15 % | Captures ignorées côté natif |
| App en arrière-plan | `pauseCapture` automatique via lifecycle |
| Wi‑Fi coupé | `apiClient` retente 3 fois |

## Note technique — Callback vs événements

React Native n'autorise qu'**un seul** appel par `Callback`. Les captures périodiques utilisent donc l'événement `onScreenCaptured` (équivalent fonctionnel du callback demandé à chaque frame).
