#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# LES TIRS. L'attendu est dans JOURNAL.md, écrit AVANT.
#
# ⚠️ L'HORLOGE EST PINNÉE À CHAQUE TIR. C1 se décide sur l'heure LOCALE de la
# personne; laisser l'horloge du poste décider mesurerait une chose différente
# à chaque heure, et « ça ne part pas » deviendrait indiscernable de « c'est
# trop tôt ». Les fixtures sont à Europe/Paris — CEST, donc UTC+2 en septembre.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
source "$(dirname "$0")/00-env.sh"

CASE="${1:-}"; [[ -n "$CASE" ]] || { echo "usage: $0 <cas>" >&2; exit 1; }
STAMP="$(date +%Y%m%d-%H%M%S)"
PRINT_BEFORE="$(codeprint)"

UP="$(uid_of "$PERTE_EMAIL")"; UM="$(uid_of "$MAINTIEN_EMAIL")"; US="$(uid_of "$SOLO_EMAIL")"

# `now` en UTC pour une heure locale de Paris voulue (CEST = UTC+2).
paris() { python3 -c "
import datetime,sys
h=int(sys.argv[1]); m=int(sys.argv[2]) if len(sys.argv)>2 else 0
d=datetime.date.today()
print(datetime.datetime(d.year,d.month,d.day,h-2,m,tzinfo=datetime.timezone.utc).isoformat().replace('+00:00','Z'))
" "$@"; }

# Ce qui est parti à ces trois comptes DEPUIS un instant donné.
bulles() { psqlf -c "
select u.email, m.metadata->>'purpose', left(coalesce(m.content_preview,''), 70),
       coalesce(jsonb_array_length(m.metadata->'buttons'),0)
  from public.outbound_messages m join auth.users u on u.id = m.user_id
 where u.id in ('$UP','$UM','$US') and m.created_at >= timestamptz '$1'
 order by m.created_at;"; }

run_cron() { # $1=heure_locale_paris  $2=libellé
  local now t0
  now="$(paris "$1")"
  t0="$(psqlq -c 'select now()')"
  echo "── cron à ${1}:00 Paris (now=$now) — $2"
  cron keel-proactive-v1 "{\"now\":\"$now\",\"only\":\"slot_meal\",\"limit\":900}" \
    | tail -1 | python3 -c '
import sys,json
d=json.load(sys.stdin)
s=d.get("slot_meal",{})
print("   examinés=%s envoyés=%s" % (s.get("examined"), s.get("sent")))
print("   motifs :", json.dumps(s.get("skipped",{}), ensure_ascii=False))
'
  echo "   bulles reçues par les trois fixtures :"
  bulles "$t0" | sed 's/^/     /' || true
}

case "$CASE" in
  C1) run_cron 13 "déjeuner écoulé, aucun plan → question « rien n'était prévu »" ;;
  C3) run_cron 13 "REJOUÉ — l'idempotence doit mordre" ;;
  C4) run_cron 10 "avant le déjeuner → not_elapsed" ;;
  C5) run_cron 16 "plus de 2 h après → too_late" ;;
  *) echo "cas inconnu: $CASE" >&2; exit 1 ;;
esac

PRINT_AFTER="$(codeprint)"
if [[ "$PRINT_BEFORE" != "$PRINT_AFTER" ]]; then
  echo "⛔ LE CODE A CHANGÉ SOUS LA MESURE ($PRINT_BEFORE → $PRINT_AFTER) — RUN JETÉ"
  exit 2
fi
echo "   empreinte code stable: $PRINT_BEFORE   [$STAMP]"
