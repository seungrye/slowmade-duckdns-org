#!/usr/bin/env bash
set -e
APPDIR="$HOME/site/eternia-app"
LOG="$APPDIR/build-setup.log"
mkdir -p "$APPDIR"
exec > >(tee "$LOG") 2>&1
echo "[setup] start $(date)"

# ── 1) JDK 17 ──
JAVA_HOME=""
if command -v java >/dev/null 2>&1 && java -version 2>&1 | grep -q '"17'; then
  echo "[jdk] system java 17 present"
  JAVA_HOME=$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")
elif sudo -n true 2>/dev/null; then
  echo "[jdk] apt install openjdk-17-jdk"
  sudo -n apt-get update -y >/dev/null 2>&1 || true
  sudo -n apt-get install -y openjdk-17-jdk unzip >/dev/null 2>&1 || true
  command -v java >/dev/null 2>&1 && JAVA_HOME=$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")
fi
if [ -z "$JAVA_HOME" ] || [ ! -x "$JAVA_HOME/bin/javac" ]; then
  echo "[jdk] fetch Temurin 17 tarball (no-sudo)"
  curl -fL -o /tmp/jdk17.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  rm -rf "$HOME/.local/jdk17"; mkdir -p "$HOME/.local/jdk17"
  tar -xzf /tmp/jdk17.tar.gz -C "$HOME/.local/jdk17" --strip-components=1
  JAVA_HOME="$HOME/.local/jdk17"
fi
echo "[jdk] JAVA_HOME=$JAVA_HOME"; "$JAVA_HOME/bin/java" -version

# ── 2) Android SDK ──
export ANDROID_HOME="$HOME/Android/Sdk"
mkdir -p "$ANDROID_HOME/cmdline-tools"
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "[sdk] download cmdline-tools"
  command -v unzip >/dev/null 2>&1 || { sudo -n apt-get install -y unzip >/dev/null 2>&1 || true; }
  curl -fL -o /tmp/cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  rm -rf /tmp/cmdtools; unzip -q /tmp/cmdtools.zip -d /tmp/cmdtools
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"; mv /tmp/cmdtools/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
fi
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
echo "[sdk] accept licenses + install packages (android-34)"
yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses >/dev/null 2>&1 || true
sdkmanager --sdk_root="$ANDROID_HOME" "platform-tools" "platforms;android-34" "build-tools;34.0.0"

# ── 3) persist env for build steps ──
cat > "$APPDIR/.env.build" <<EOF
export JAVA_HOME="$JAVA_HOME"
export ANDROID_HOME="$ANDROID_HOME"
export PATH="\$JAVA_HOME/bin:\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$PATH"
EOF
echo "[setup] DONE $(date)"
