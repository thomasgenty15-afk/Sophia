#!/usr/bin/env bash
# ============================================================================
# REMETTRE AUTH EN HS256 EN LOCAL — à rejouer après tout `supabase stop/start`
#
# LE SYMPTÔME
#   Toute fonction edge en `verify_jwt = true` rend 401 `{"msg":"Invalid JWT"}`:
#   /coach/doctrine, la génération de semaine, le chat. Les fonctions déclarées
#   `verify_jwt = false` continuent de marcher, et les lectures PostgREST aussi
#   — donc « le reste de l'app fonctionne » et on cherche le défaut dans l'écran
#   qui échoue. Il n'y est pas.
#
# LA CAUSE
#   Le CLI (v2.75.3) injecte dans GoTrue une clé de signature EC
#   (`GOTRUE_JWT_KEYS`), donc auth émet des jetons **ES256**. Le gateway du
#   runtime edge, lui, ne reçoit que le secret symétrique
#   (`SUPABASE_INTERNAL_JWT_SECRET`) et jose refuse:
#
#     TypeError: Key for the ES256 algorithm must be of type CryptoKey.
#                Received an instance of Uint8Array
#
#   Les deux moitiés de la pile locale ne parlent pas le même algorithme.
#   `signing_keys_path` dans config.toml ne suffit pas: le CLI garde sa clé EC.
#
# CE QUE FAIT CE SCRIPT
#   Il recrée le SEUL conteneur auth, à l'identique, moins `GOTRUE_JWT_KEYS`.
#   GoTrue retombe alors sur `GOTRUE_JWT_SECRET` et signe en HS256, que le
#   gateway sait vérifier. Aucun autre conteneur n'est touché, la base n'est ni
#   arrêtée ni migrée.
#
# ── APRÈS L'AVOIR LANCÉ: DÉCONNECTEZ-VOUS ET RECONNECTEZ-VOUS ──────────────
#   Un rechargement de page NE SUFFIT PAS. Les sessions ouvertes portent un
#   access token ES256 dans le localStorage, et supabase-js le réutilise tel
#   quel jusqu'à son expiration (`jwt_expiry = 3600`, soit une heure). Tant
#   qu'il n'est pas renouvelé, le gateway continue de le refuser. Se
#   déconnecter force l'émission d'un jeton neuf.
#
# LA VRAIE CURE, quand quelqu'un aura le temps: monter le CLI (une version
# récente sert un runtime edge qui vérifie l'ES256), et supprimer ce script.
# ============================================================================
set -euo pipefail

PROJECT="${SUPABASE_PROJECT_ID:-Sophia_2}"
CONTAINER="supabase_auth_${PROJECT}"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "✗ $CONTAINER est introuvable. Lancez d'abord: npx supabase start" >&2
  exit 1
fi

if ! docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' \
     | grep -q '^GOTRUE_JWT_KEYS='; then
  echo "✓ $CONTAINER n'a déjà pas de GOTRUE_JWT_KEYS — rien à faire."
  exit 0
fi

SPEC="$(mktemp -t auth_spec)"
trap 'rm -f "$SPEC"' EXIT
docker inspect "$CONTAINER" > "$SPEC"

RUN_CMD="$(CONTAINER="$CONTAINER" PROJECT="$PROJECT" SPEC="$SPEC" python3 <<'PY'
import json, os, shlex

d = json.load(open(os.environ["SPEC"]))[0]
env = [e for e in d["Config"]["Env"] if not e.startswith("GOTRUE_JWT_KEYS=")]

args = ["docker", "run", "-d",
        "--name", os.environ["CONTAINER"],
        "--network", f"supabase_network_{os.environ['PROJECT']}",
        "--network-alias", "auth",
        "--restart", "unless-stopped"]
for k, v in (d["Config"].get("Labels") or {}).items():
    args += ["--label", f"{k}={v}"]
health = (d["Config"].get("Healthcheck") or {}).get("Test") or []
if health and health[0] == "CMD":
    args += ["--health-cmd", " ".join(health[1:])]
for entry in env:
    args += ["-e", entry]
args += [d["Config"]["Image"]] + (d["Config"]["Cmd"] or [])
print(" ".join(shlex.quote(a) for a in args))
PY
)"

echo "→ recréation de $CONTAINER sans GOTRUE_JWT_KEYS…"
docker rm -f "$CONTAINER" >/dev/null
eval "$RUN_CMD" >/dev/null

for _ in $(seq 1 30); do
  if curl -sf -o /dev/null "http://127.0.0.1:54321/auth/v1/health"; then break; fi
  sleep 1
done

echo "✓ auth redémarré. Vérifiez l'algorithme des jetons émis:"
echo "    les nouveaux jetons doivent porter alg=HS256, plus ES256."
echo
echo "⚠  Déconnectez-vous et reconnectez-vous dans l'app: un rechargement de"
echo "   page ne renouvelle PAS le jeton déjà en localStorage."
