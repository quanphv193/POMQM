#!/bin/zsh
# Installs OM/QM Lite so it runs on its own: app files, a private copy of Node, a local HTTPS
# certificate, a login item that serves the add-in in the background, and the Excel manifest.
#
#   ./install.sh            install / update (text mode)
#   ./install.sh --gui      same, but with macOS dialogs and a password prompt for the certificate
#                           (used by "Cai-dat-OMQM-Lite.command", so no Terminal knowledge is needed)
#   ./install.sh --new-cert make a new certificate
#
# Test overrides: OMQM_HOME, OMQM_PORT, OMQM_LABEL, OMQM_WEF.
set -euo pipefail

SRC="${0:A:h}"
GUI=0; NEWCERT=0
for a in "$@"; do case "$a" in --gui) GUI=1 ;; --new-cert) NEWCERT=1 ;; esac; done

APP="${OMQM_HOME:-$HOME/Library/Application Support/OMQM-Lite}"
PORT="${OMQM_PORT:-47310}"
LABEL="${OMQM_LABEL:-com.omqmlite.server}"
AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"
WEF="${OMQM_WEF:-$HOME/Library/Containers/com.microsoft.Excel/Data/Documents/wef}"
LOG="$HOME/Library/Logs/omqm-lite-install.log"
mkdir -p "$HOME/Library/Logs"
: > "$LOG"

say() { print -r -- "$*" | tee -a "$LOG"; }
dialog() { # dialog "message" [icon: note|caution|stop]
	[[ $GUI == 1 ]] || return 0
	osascript -e "display dialog \"$1\" with title \"OM/QM Lite\" buttons {\"OK\"} default button 1 with icon ${2:-note}" >/dev/null 2>&1 || true
}
fail() { say "✗ $1"; dialog "Cài đặt chưa hoàn tất:\n\n$1\n\nChi tiết: $LOG" stop; exit 1; }
trap 'fail "Có lỗi ở bước đang chạy (xem $LOG)."' ERR

say "→ Cài vào: $APP"
for f in taskpane.html taskpane.css server.mjs manifest.xml lib src assets; do [[ -e "$SRC/$f" ]] || fail "Thiếu “$f” trong thư mục cài đặt. Hãy giải nén đầy đủ file zip rồi chạy lại."; done
mkdir -p "$APP/runtime" "$APP/certs" "$WEF"

# 1) App files (no tests, no dev flags)
rsync -a --delete --exclude '.selftest' --exclude 'selftest.log' \
	"$SRC/taskpane.html" "$SRC/taskpane.css" "$SRC/server.mjs" "$SRC/assets" "$SRC/lib" "$SRC/src" "$APP/app/"

# 2) Private Node runtime: bundled with the installer if present, else this Mac's Node.
#    Keeping our own copy means updating or removing nvm / Homebrew Node never breaks the add-in.
if [[ ! -x "$APP/runtime/node" ]]; then
	NODE_SRC=""
	if [[ -x "$SRC/runtime/node" ]]; then NODE_SRC="$SRC/runtime/node"; else NODE_SRC="$(command -v node || true)"; fi
	[[ -n "$NODE_SRC" ]] || fail "Không tìm thấy Node.js. Hãy dùng gói cài đặt đầy đủ (có thư mục runtime)."
	cp "$NODE_SRC" "$APP/runtime/node"
	chmod 755 "$APP/runtime/node"
fi
# files that came from a download carry a quarantine flag that would make macOS block the runtime
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
"$APP/runtime/node" --version >/dev/null 2>&1 || fail "Không chạy được Node.js đi kèm (có thể gói cài đặt dành cho loại chip khác)."

# 3) Certificate. Keep the one already trusted on this Mac if present (no password needed);
#    otherwise create a self-signed certificate (10 years) that is trusted below.
NEW=0
if [[ $NEWCERT == 1 ]]; then rm -f "$APP/certs/localhost.crt" "$APP/certs/localhost.key"; fi
if [[ ! -f "$APP/certs/localhost.crt" ]]; then
	if [[ $NEWCERT == 0 && -f "$SRC/certs/localhost.crt" ]] && security verify-cert -c "$SRC/certs/localhost.crt" >/dev/null 2>&1; then
		cp "$SRC/certs/localhost.crt" "$SRC/certs/localhost.key" "$APP/certs/"
		say "→ Dùng lại chứng chỉ đã được tin cậy sẵn trên máy"
	else
		openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
			-keyout "$APP/certs/localhost.key" -out "$APP/certs/localhost.crt" \
			-subj "/CN=OM-QM Lite localhost" \
			-addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
			-addext "basicConstraints=critical,CA:TRUE" \
			-addext "keyUsage=critical,digitalSignature,keyCertSign" \
			-addext "extendedKeyUsage=serverAuth" >/dev/null 2>&1
		NEW=1
	fi
	chmod 600 "$APP/certs/localhost.key"
fi
ln -sfn "$APP/certs" "$APP/app/certs"

# 4) Excel manifest pointing at the install port
sed "s#https://localhost:[0-9]*#https://localhost:$PORT#g" "$SRC/manifest.xml" > "$APP/manifest.xml"
cp "$APP/manifest.xml" "$WEF/omqm-lite.manifest.xml"

# 5) Login item that keeps the server running in the background (starts at every login)
cat > "$AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$APP/runtime/node</string><string>$APP/app/server.mjs</string></array>
  <key>WorkingDirectory</key><string>$APP/app</string>
  <key>EnvironmentVariables</key><dict><key>OMQM_PORT</key><string>$PORT</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/omqm-lite.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/omqm-lite.log</string>
</dict></plist>
PLIST
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
# bootout is asynchronous: wait until the old instance is gone, then retry bootstrap if macOS is still busy
for _ in 1 2 3 4 5 6; do launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || break; sleep 1; done
for _ in 1 2 3 4 5; do launchctl bootstrap "gui/$(id -u)" "$AGENT" 2>/dev/null && break; sleep 1; done
for _ in 1 2 3 4 5 6 7 8; do
	curl -sk -o /dev/null -w '%{http_code}' "https://localhost:$PORT/taskpane.html" 2>/dev/null | grep -q 200 && break; sleep 1
done
curl -sk -o /dev/null -w '%{http_code}' "https://localhost:$PORT/taskpane.html" 2>/dev/null | grep -q 200 || fail "Máy chủ nền chưa khởi động được trên cổng $PORT (có thể cổng đang bị chiếm). Xem ~/Library/Logs/omqm-lite.log"
say "✓ Dịch vụ nền đang chạy (https://localhost:$PORT), sẽ tự chạy mỗi khi bạn đăng nhập máy"

# 6) Trust the certificate once (needs the Mac password; in --gui mode macOS shows its own password dialog)
TRUST_CMD="security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain \"$APP/certs/localhost.crt\""
if ! security verify-cert -c "$APP/certs/localhost.crt" >/dev/null 2>&1; then
	if [[ $GUI == 1 ]]; then
		say "→ Cần quyền quản trị để tin cậy chứng chỉ (một lần duy nhất)"
		if ! osascript -e "do shell script \"${TRUST_CMD//\"/\\\"}\" with administrator privileges with prompt \"OM/QM Lite cần tin cậy chứng chỉ cục bộ để Excel mở được add-in.\"" >>"$LOG" 2>&1; then
			fail "Chưa tin cậy được chứng chỉ (bạn đã huỷ hoặc nhập sai mật khẩu). Chạy lại bộ cài và nhập mật khẩu máy khi được hỏi."
		fi
	else
		say ""; say "Bước cuối (một lần duy nhất): tin cậy chứng chỉ. Chạy lệnh sau rồi nhập mật khẩu máy:"; say "  sudo $TRUST_CMD"
	fi
fi
security verify-cert -c "$APP/certs/localhost.crt" >/dev/null 2>&1 && say "✓ Chứng chỉ đã được tin cậy"

END=$(openssl x509 -enddate -noout -in "$APP/certs/localhost.crt" | cut -d= -f2)
say "Chứng chỉ hết hạn: $END (khi đó chạy lại bộ cài với --new-cert)"
trap - ERR

EXCEL_OPEN=0; pgrep -x "Microsoft Excel" >/dev/null 2>&1 && EXCEL_OPEN=1
if [[ $EXCEL_OPEN == 1 ]]; then
	say "! Excel đang mở: hãy lưu công việc, thoát hẳn Excel (Cmd+Q) rồi mở lại"
	dialog "Đã cài xong OM/QM Lite.\n\nExcel đang mở. Hãy lưu công việc, thoát hẳn Excel (Cmd+Q) rồi mở lại.\n\nSau đó: Home → Add-ins → Developer Add-ins → OM/QM Lite."
else
	dialog "Đã cài xong OM/QM Lite.\n\nMở Excel, vào Home → Add-ins → Developer Add-ins → OM/QM Lite. Sau đó nút OM/QM Lite hiện ngay trên tab Home."
fi
say "Xong. Trong Excel: Home → Add-ins → Developer Add-ins → OM/QM Lite."
exit 0
