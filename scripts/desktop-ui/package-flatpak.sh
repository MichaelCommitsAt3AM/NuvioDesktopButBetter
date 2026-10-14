#!/usr/bin/env bash
set -euo pipefail
version="$(sed -n 's/^VERSION_NAME=//p' composeApp/Configuration/DesktopVersion.properties | tr -d '\r')"
deb="$(find desktop-ui/src-tauri/target/release/bundle/deb -maxdepth 1 -name '*.deb' -print -quit)"
test -n "$deb"
mkdir -p flatpak/app-root/bin flatpak/app-root/lib
dpkg-deb -x "$deb" flatpak/extracted
cp -a flatpak/extracted/usr/bin/. flatpak/app-root/bin/
cp -a flatpak/extracted/usr/lib/. flatpak/app-root/lib/
cp desktop-ui/src-tauri/icons/icon.png flatpak/app-root/lib/Nuvio.png
cp scripts/linux/nuvio-launcher.sh scripts/linux/linux-shortcut-definition.sh scripts/linux/com.nuvio.media.desktop.metainfo.xml flatpak/
sed "s|\${app_root}|$(pwd)/flatpak/app-root|g" scripts/linux/nuvio-flatpak.yml > flatpak/nuvio-flatpak.yml
sed -i "s/version=\"0.0.0\"/version=\"${version}\"/; s/date=\"1970-01-01\"/date=\"$(date -u +%F)\"/" flatpak/com.nuvio.media.desktop.metainfo.xml
flatpak-builder --repo=flatpak-repo --force-clean flatpak-build flatpak/nuvio-flatpak.yml
flatpak build-bundle flatpak-repo "Nuvio-Linux-x86_64-${version}.flatpak" com.nuvio.media.desktop
flatpak build flatpak-build sh -c 'ldd /app/opt/Nuvio/bin/Nuvio > /tmp/nuvio-ldd; cat /tmp/nuvio-ldd; ! grep -q "not found" /tmp/nuvio-ldd'
