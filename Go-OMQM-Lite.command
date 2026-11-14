#!/bin/zsh
# Bấm đúp file này để gỡ OM/QM Lite khỏi máy.
cd "$(dirname "$0")" || exit 1
./uninstall.sh --gui
echo
read -k 1 "?Nhấn phím bất kỳ để đóng cửa sổ này… "
