#!/bin/zsh
# Builds the Windows installer zip (default ~/Desktop/OMQM-Lite-Windows[.zip]). The add-in is served from GitHub Pages.
set -euo pipefail
SRC="${0:A:h}"; OUT="${1:-$HOME/Desktop/OMQM-Lite-Windows}"
rm -rf -- "$OUT" "$OUT.zip"; mkdir -p "$OUT"
cp "$SRC"/windows/* "$OUT/"
[[ -f "$SRC/HUONG-DAN-OMQM-Lite.docx" ]] && cp "$SRC/HUONG-DAN-OMQM-Lite.docx" "$OUT/"
(cd "$OUT/.." && ditto -c -k --keepParent "$OUT" "$OUT.zip")
echo "Đã tạo: $OUT.zip"
