#!/usr/bin/env python3
"""
PETIT BANC DE LATENCE — Fast, effort, budget. 2026-09-10.

    python3 00-banc.py            # les quatre cas, séquentiels
    python3 00-banc.py S1 F3      # un sous-ensemble

Quatre requêtes SÉQUENTIELLES, jamais en parallèle (§ 4 étape 2 du chantier):

    S1  solo simple            S5  solo sur plusieurs jours
    F1  foyer simple           F3  foyer partagé représentatif

⛔ CE QUE CE BANC NE FAIT PAS. Il ne provoque aucune réponse dangereuse: le
chemin des deux réparations se vérifie en SIMULÉ (tests déterministes). Ici on
mesure ce qu'un vrai plan coûte, pas ce qu'une garde attrape.

⛔ ET IL S'ARRÊTE AU PREMIER 546 OU AU PREMIER DÉPASSEMENT D'ÉCHÉANCE. Élargir
un banc après un shutdown mesure la chance, pas le profil.

Ce qu'il garantit, et pourquoi:
 · il RÉUTILISE le lanceur de la campagne du 2026-09-09 (`20-run.py`), donc le
   corps de requête est celui de l'écran, champ pour champ — un banc qui invente
   son corps mesure son corps;
 · il lit le palier RÉELLEMENT envoyé et RÉELLEMENT rendu dans
   `llm_usage_events.metadata`, jamais la configuration qu'on croit avoir posée:
   « un service dégradé ne doit pas être présenté comme un test Fast réussi »;
 · il compte les tentatives fournisseur (`attempt`, `chain_index`) — c'est la
   moitié que `maxRetries: 1` est censé borner;
 · il lit le motif de shutdown dans le journal du conteneur, jamais déduit.
"""
import json, os, pathlib, subprocess, sys, time
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).parent
REPO = HERE.parent.parent
CAMP = REPO / "scratchpad" / "2026-09-09-CAMPAGNE-PLANS"
DB, EDGE = "supabase_db_Sophia_2", "supabase_edge_runtime_Sophia_2"
CAS = ["S1", "S5", "F1", "F3"]


def psql(sql: str) -> str:
    p = subprocess.run(
        ["docker", "exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-tA"],
        input=sql, capture_output=True, text=True)
    return p.stdout.strip()


def calls_since(iso: str) -> list:
    rows = psql(f"""select coalesce(json_agg(t),'[]')::text from (
        select created_at, source, model, status, latency_ms,
               prompt_tokens, output_tokens, total_tokens, cost_usd,
               metadata->>'reasoning_effort'    as effort,
               metadata->>'service_tier_sent'   as tier_sent,
               metadata->>'service_tier_echoed' as tier_echoed,
               metadata->>'service_tier_source' as tier_source,
               metadata->>'max_retries'         as max_retries,
               metadata->>'timeout_ms'          as timeout_ms,
               metadata->>'attempt'             as attempt,
               metadata->>'chain_index'         as chain_index
        from llm_usage_events
        where created_at >= '{iso}'::timestamptz
        order by created_at) t""")
    try:
        return json.loads(rows or "[]")
    except Exception:  # noqa: BLE001
        return []


def shutdowns_since(iso: str) -> list:
    """Le motif EXACT d'un 546, lu dans le journal du conteneur."""
    logs = subprocess.run(["docker", "logs", EDGE, "--since", iso],
                          capture_output=True, text=True)
    out = []
    for line in (logs.stdout + logs.stderr).splitlines():
        low = line.lower()
        if any(w in low for w in ("shutdown", "wall clock", "cpu time", "memory limit",
                                  "546", "worker boot", "event loop completed")):
            out.append(line.strip()[:300])
    return out[-40:]


def refusals_since(iso: str) -> list:
    """`keel.plan.repair_refused` — qui a été refusé, et par quel motif."""
    logs = subprocess.run(["docker", "logs", EDGE, "--since", iso],
                          capture_output=True, text=True)
    out = []
    for line in (logs.stdout + logs.stderr).splitlines():
        i = line.find('{"tag":"keel.plan.repair_refused"')
        if i < 0:
            continue
        try:
            out.append(json.loads(line[i:]))
        except Exception:  # noqa: BLE001
            pass
    return out


def one(name: str) -> dict:
    since = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    t0 = time.time()
    p = subprocess.run([sys.executable, "20-run.py", name], cwd=CAMP,
                       capture_output=True, text=True)
    wall = round(time.time() - t0, 1)
    sys.stdout.write(p.stdout)
    if p.returncode != 0:
        sys.stdout.write(p.stderr[-2000:])
    calls = calls_since(since)
    http = None
    for line in p.stdout.splitlines():
        if "http=" in line:
            http = line.strip()
    row = {
        "cas": name,
        "wall_s": wall,
        "http_line": http,
        "appels": calls,
        "refus_budget": refusals_since(since),
        "shutdown": shutdowns_since(since),
        "since": since,
    }
    (HERE / f"mesure-{name}.json").write_text(json.dumps(row, indent=1, default=str))
    # ── LE RÉSUMÉ LISIBLE, TOUT DE SUITE ──────────────────────────────────
    print(f"   ⏱  mur total {wall}s · {len(calls)} appels modèle")
    for c in calls:
        print(f"      · {c.get('source')} — {c.get('model')} / {c.get('effort')} / "
              f"tier demandé={c.get('tier_sent')} (source {c.get('tier_source')}) "
              f"rendu={c.get('tier_echoed')} · {c.get('latency_ms')} ms · "
              f"essai {c.get('attempt')}/{c.get('max_retries')} chaîne {c.get('chain_index')} · "
              f"{c.get('total_tokens')} jetons · {c.get('status')}")
    for r in row["refus_budget"]:
        print(f"      ⚠️ rattrapage refusé: {r.get('label')} — {r.get('reason')}")
    if row["shutdown"]:
        print(f"      ⛔ {len(row['shutdown'])} lignes de shutdown dans le journal")
    return row


if __name__ == "__main__":
    wanted = sys.argv[1:] or CAS
    results = []
    for n in wanted:
        print(f"\n═══ {n} ═══")
        r = one(n)
        results.append(r)
        # ⛔ L'ARRÊT AU PREMIER 546 / DÉPASSEMENT — voir l'en-tête.
        if r["http_line"] and ("http=546" in r["http_line"] or "http=-1" in r["http_line"]):
            print("\n⛔ ARRÊT DU BANC: shutdown ou échec de transport. "
                  "On corrige la cause NOMMÉE, puis on rejoue ce cas.")
            break
    (HERE / "resultats.json").write_text(json.dumps(results, indent=1, default=str))
    print(f"\n→ {HERE / 'resultats.json'}")
