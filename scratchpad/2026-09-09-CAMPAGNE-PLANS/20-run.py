#!/usr/bin/env python3
"""
UNE GÉNÉRATION RÉELLE PAR EXÉCUTION — campagne du 2026-09-09.

  python3 20-run.py S1

Ce que ce script garantit, et pourquoi chaque garantie existe :

 · `intent: "draft"` — le corps composé passe TOUTES les gardes amont et n'écrit
   aucun plan : dix runs sans un seul `plan_overlaps_existing`.
 · le corps de requête est celui de `planDraft.ts::composeDraft`, champ pour
   champ. Un banc qui invente son corps mesure son corps.
 · EMPREINTE DU CODE avant/après : une autre session édite `supabase/functions/**`
   pendant la campagne ; le watcher recrée alors le conteneur (502 en vol) et deux
   runs séparés par une édition comparent deux codes, pas deux profils.
 · LE JOURNAL DE LA FONCTION, tranché à `--since` : sans lui `docker logs` rejoue
   tout l'historique et l'on mesure les compteurs du run d'avant.
 · LA LIGNE D'APERÇU (`student_meal_drafts`) : `generated_from` ne sort PAS dans
   la réponse d'un brouillon, mais il est écrit dans `write_payload`.
"""
import json, subprocess, sys, time, pathlib, urllib.request, urllib.error, hashlib, os
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).parent
REPO = HERE.parent.parent
ENV = {}
for line in (REPO / "supabase" / ".env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        ENV[k.strip()] = v.strip().strip('"')
API, ANON = ENV["SUPABASE_URL"], ENV["SUPABASE_ANON_KEY"]
DB, EDGE = "supabase_db_Sophia_2", "supabase_edge_runtime_Sophia_2"
CAS = json.loads((HERE / "cas.json").read_text())


def psql(sql):
    p = subprocess.run(["docker", "exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-tA"],
                       input=sql, capture_output=True, text=True)
    return p.stdout.strip()


def codeprint(fn):
    """L'empreinte des mtimes du code MESURÉ."""
    paths = [REPO / "supabase/functions/_shared/keel", REPO / "supabase/functions" / fn]
    h = hashlib.md5()
    for base in paths:
        for f in sorted(base.rglob("*.ts")):
            if f.name.endswith("_test.ts"):
                continue
            h.update(f"{f}:{f.stat().st_mtime_ns}\n".encode())
    return h.hexdigest()[:12]


def run(name):
    cas = CAS[name]
    lane = cas["lane"]
    fn = "generate-household-meal-v1" if lane == "household" else "generate-meal-v1"
    body_info = json.loads((HERE / f"body-{name}.json").read_text())
    uid = body_info["userId"]

    tok = json.load(urllib.request.urlopen(urllib.request.Request(
        f"{API}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": cas["email"], "password": "1234567"}).encode(),
        headers={"apikey": ANON, "content-type": "application/json"})))["access_token"]

    w = cas["window"]
    if lane == "household":
        payload = {"operation": "compose", "window": w, "intent": "draft", "replaces": None,
                   "context": None, "cooking_shape": cas.get("cooking_shape"),
                   "one_cooking_session": cas["one_cooking_session"], "preferences": None}
    else:
        payload = {"mode": "to_shop", "window": w, "intent": "draft", "replaces": None,
                   "meal_slot": None, "servings": 1, "context": None, "preferences": None,
                   "pantry": [], "one_cooking_session": cas["one_cooking_session"]}

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out = HERE / f"plan-{name}-{stamp}.json"
    cp0 = codeprint(fn)
    since = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    print(f"── {name} · {fn} · {cas['titre']}")
    print(f"   fenêtre {w} · une seule session={cas['one_cooking_session']} · empreinte {cp0}")
    t0 = time.time()
    code, raw, tries = 0, "", 0
    while True:
        tries += 1
        req = urllib.request.Request(f"{API}/functions/v1/{fn}", data=json.dumps(payload).encode(),
                                     headers={"apikey": ANON, "authorization": "Bearer " + tok,
                                              "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=900) as r:
                code, raw = r.status, r.read().decode()
        except urllib.error.HTTPError as e:
            code, raw = e.code, e.read().decode()
        except Exception as e:                       # noqa: BLE001
            code, raw = -1, json.dumps({"error": str(e)})
        if code != 502 or tries >= 3:
            break
        print(f"   ⚠️ 502 à l'essai {tries} — le runtime a été recréé sous le run ; on relance.")
        time.sleep(20)
    dt = round(time.time() - t0, 1)
    cp1 = codeprint(fn)
    out.write_text(raw)

    # ── LE JOURNAL DE CE RUN, ET DE CE COMPTE SEULEMENT ────────────────────
    logs = subprocess.run(["docker", "logs", EDGE, "--since", since],
                          capture_output=True, text=True)
    keep = []
    for line in (logs.stdout + logs.stderr).splitlines():
        i = line.find('{"tag":"keel.')
        if i < 0:
            i = line.find('{"tag": "keel.')
        if i < 0:
            continue
        try:
            row = json.loads(line[i:])
        except Exception:                            # noqa: BLE001
            continue
        if row.get("user_id") in (None, uid) or row.get("household_id"):
            keep.append(row)
    (HERE / f"log-{name}-{stamp}.json").write_text(json.dumps(keep, indent=1))

    # ── LA LIGNE D'APERÇU: `generated_from` n'est pas dans la réponse ───────
    draft = psql(f"""select coalesce(json_agg(t),'[]')::text from (
        select id, status, error_code, error, wall_ms, starts_on, duration_days, lead_days,
               write_payload->'generated_from' as generated_from,
               write_payload->'composition_unknowns' as composition_unknowns,
               write_payload->'composition_energy_sources' as composition_energy_sources
        from student_meal_drafts where user_id='{uid}' order by created_at desc limit 1) t""")
    (HERE / f"draft-{name}-{stamp}.json").write_text(draft or "[]")

    print(f"   http={code} · {dt}s · essais={tries} · empreinte après {cp1} "
          f"{'(inchangée)' if cp0 == cp1 else '⛔ LE CODE A CHANGÉ SOUS LA MESURE'}")
    print(f"   → {out.name} ({len(raw)} octets) · {len(keep)} lignes de journal")
    try:
        d = json.loads(raw)
        print(f"   plats={len(d.get('dishes', []))} préparations={len(d.get('preparations', []))} "
              f"sessions={len(d.get('cooking_sessions', []))} "
              f"courses={len(d.get('shopping_list', []) or [])}")
    except Exception:                                # noqa: BLE001
        print("   ⛔ réponse illisible: " + raw[:200])
    return code


if __name__ == "__main__":
    for n in sys.argv[1:]:
        run(n)
