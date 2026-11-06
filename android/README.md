# YouTube Recall — Native Android Application

A production-ready Android application for **YouTube Recall**, designed for micro-learning, automated video distillation, and seamless Android system integration.

---

## Key Features

1. **YouTube App Share Sheet Target**:
   - When watching any video in the official Android YouTube app, tap **Share** → tap **YouTube Recall**.
   - The app instantly captures the video, extracts the audio/captions, runs AI distillation, and opens the smart transcript.
2. **Native Ergonomics & Edge-to-Edge UI**:
   - Warm Obsidian & Honey Amber dark theme matching the web application.
   - Android Swipe-to-Refresh (`SwipeRefreshLayout`).
   - Hardware back button handling (`onBackPressedDispatcher`).
   - Status bar and navigation bar edge-to-edge styling.
3. **One-Tap Note Exports**:
   - Intercepts Markdown (`.md`) and Anki deck (`.tsv`) export requests and delegates to the native Android `DownloadManager`, saving files straight to your device's `Downloads/` directory with system progress notifications.
4. **Smart Local Network & Emulator Connectivity**:
   - Works on Android Emulator (`http://10.0.2.2:8000`) and physical devices on local Wi-Fi (`http://192.168.1.4:8000` or custom server URL).
   - Easily change server address anytime via the gear icon or Settings dialog.

---

## Quick Install (Pre-Built APK)

The debug APK is already built and ready to install:

- **Location**: `android/youtube-recall.apk` (or `android/app/build/outputs/apk/debug/app-debug.apk`)
- **Web Download**: From your phone, open `http://192.168.1.4:8000` and tap **Download APK** in Settings.
- **Via ADB** (phone connected with USB debugging):
  ```bash
  adb install android\youtube-recall.apk
  ```

---

## Opening in Android Studio

1. Launch **Android Studio**.
2. Select **Open** and choose the `android` folder (`c:\youtube recall solution\android`).
3. Allow Gradle to sync.
4. Connect your Android phone or start an Android Virtual Device (AVD).
5. Click **Run (Shift + F10)**.

---

## Building from Command Line

Using the included Gradle wrapper:

```bash
cd android
.\gradlew assembleDebug
```

The APK will be compiled to `android/app/build/outputs/apk/debug/app-debug.apk`.
