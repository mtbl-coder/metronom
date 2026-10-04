#!/usr/bin/env bash
# Dostosowuje wygenerowany projekt android/ (po `npx cap add android`):
# uprawnienia mikrofonu, ikony, ekran startowy i numer wersji.
set -euo pipefail
VERSION_CODE="${1:-1}"
VERSION_NAME="${2:-1.0.$VERSION_CODE}"
RES=android/app/src/main/res
MANIFEST=android/app/src/main/AndroidManifest.xml

# mikrofon (stroik) i wibracje (metronom)
for perm in RECORD_AUDIO MODIFY_AUDIO_SETTINGS VIBRATE WAKE_LOCK; do
  grep -q "android.permission.$perm\"" "$MANIFEST" ||
    sed -i "s|</manifest>|    <uses-permission android:name=\"android.permission.$perm\" />\n</manifest>|" "$MANIFEST"
done
# tylko pionowo
sed -i 's|android:name=".MainActivity"|android:name=".MainActivity"\n            android:screenOrientation="portrait"|' "$MANIFEST"

# ikony aplikacji
rm -rf "$RES/mipmap-anydpi-v26"
cp -r icons/android/. "$RES/"
# ekran startowy: czarne tło zamiast domyślnego logo Capacitora
sed -i 's|@drawable/splash|#000000|' "$RES/values/styles.xml"

# wersja
sed -i "s|versionCode 1$|versionCode $VERSION_CODE|; s|versionName \"1.0\"|versionName \"$VERSION_NAME\"|" android/app/build.gradle
echo "android/ skonfigurowany (versionCode $VERSION_CODE, $VERSION_NAME)"
