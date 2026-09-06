#!/usr/bin/env bash
B="/private/tmp/claude-502/-Users-ahmedamara-Dev-Sophia-2/f112d7c6-5b04-419f-95a4-51a5b6f6c7f9/scratchpad/FB/banc-retours.sh"
run(){ "$B" "$@" > "/private/tmp/claude-502/-Users-ahmedamara-Dev-Sophia-2/f112d7c6-5b04-419f-95a4-51a5b6f6c7f9/scratchpad/FB/$1.txt" 2>&1; grep -E "^FIN|^═══" "/private/tmp/claude-502/-Users-ahmedamara-Dev-Sophia-2/f112d7c6-5b04-419f-95a4-51a5b6f6c7f9/scratchpad/FB/$1.txt" | tail -1; }
run FB0c ''
run FB1r '[{"at":"2026-09-06","item":"","kind":"food.exclude","text":"saumon","quote":null,"scope":"durable","value":null,"source":"written","subject":"household","confidence":null}]'
run FB4r '[{"at":"2026-09-06","item":"","kind":"food.exclude","text":"poulet","quote":null,"scope":"durable","value":null,"source":"written","subject":"household","confidence":null},{"at":"2026-09-06","item":"","kind":"food.exclude","text":"saumon","quote":null,"scope":"durable","value":null,"source":"written","subject":"household","confidence":null},{"at":"2026-09-06","item":"","kind":"food.exclude","text":"thon","quote":null,"scope":"durable","value":null,"source":"written","subject":"household","confidence":null}]'
run FB2r '[{"at":"2026-09-06","item":"","kind":"food.exclude","text":"poulet","quote":null,"scope":"durable","value":null,"source":"written","subject":"member:b60378e6-1956-4dbd-b8dc-7480578a8282","confidence":null}]'
run FB0d ''
echo "SERIE2 FINIE $(date +%H:%M:%S)"
