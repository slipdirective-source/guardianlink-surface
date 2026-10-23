#!/bin/sh
# Install the GuardianLink dash shortcut for Termux:Widget.
#
# Copies gl-launch.sh into ~/.shortcuts/ (the folder Termux:Widget
# reads) as GuardianLink.sh, with this package's absolute path baked
# in so the shortcut finds the package from anywhere.
set -e
PKG="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.shortcuts"
mkdir -p "$DEST"
sed "s|__GL_PACKAGE_DIR__|$PKG|g" "$PKG/gl-launch.sh" > "$DEST/GuardianLink.sh"
chmod +x "$DEST/GuardianLink.sh"
echo "Installed: $DEST/GuardianLink.sh"
echo ""
echo "TWO REMAINING MANUAL STEPS (Termux:Widget route):"
echo "  1. Long-press your home screen, choose Widgets, add the"
echo "     Termux:Widget widget, and pick \"GuardianLink\" from the list."
echo "  2. Tap it. The server starts if needed and the surface opens."
echo ""
echo "CHROME ALTERNATIVE (no widget app needed):"
echo "  Run:  sh gl-launch.sh"
echo "  Then in Chrome, open the menu (three dots) and choose"
echo "  \"Install app\" or \"Add to Home screen\". The surface is a"
echo "  PWA: the icon lands on your dash and opens full-screen."
