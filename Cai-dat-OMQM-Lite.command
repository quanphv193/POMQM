#!/bin/zsh
# Bấm đúp file này để cài OM/QM Lite vào Excel. Không cần mở Terminal hay chạy lệnh nào.
cd "$(dirname "$0")" || exit 1
xattr -dr com.apple.quarantine . 2>/dev/null
./install.sh --gui
echo
read -k 1 "?Nhấn phím bất kỳ để đóng cửa sổ này… "
