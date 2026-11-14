#!/bin/zsh
# Removes OM/QM Lite (background service, Excel manifest, installed copy). The source folder is left alone.
set -uo pipefail
GUI=0; [[ "${1:-}" == "--gui" ]] && GUI=1
APP="${OMQM_HOME:-$HOME/Library/Application Support/OMQM-Lite}"
LABEL="${OMQM_LABEL:-com.omqmlite.server}"
WEF="${OMQM_WEF:-$HOME/Library/Containers/com.microsoft.Excel/Data/Documents/wef}"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist" "$WEF/omqm-lite.manifest.xml"
case "$APP" in */OMQM-Lite|*/omqm-test-home*) [[ -d "$APP" ]] && rm -rf -- "$APP" ;; esac
MSG="Đã gỡ OM/QM Lite. Thoát và mở lại Excel để nút biến mất. Chứng chỉ “OM-QM Lite localhost” trong Keychain có thể xoá bằng Keychain Access."
print -r -- "$MSG"
[[ $GUI == 1 ]] && osascript -e "display dialog \"$MSG\" with title \"OM/QM Lite\" buttons {\"OK\"} default button 1" >/dev/null 2>&1
exit 0
