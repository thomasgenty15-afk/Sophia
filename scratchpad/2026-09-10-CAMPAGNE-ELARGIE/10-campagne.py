#!/usr/bin/env python3
"""
CAMPAGNE ÉLARGIE — étape 3 du chantier densité/portions/Fast. 2026-09-10.

    python3 10-campagne.py              # les dix cas, DEUX générations chacun
    python3 10-campagne.py S1 F3        # un sous-ensemble

⛔ UNE REQUÊTE DE PLAN À LA FOIS. C'est la concurrence par défaut du chantier:
deux générations en parallèle partagent le CPU d'un worker edge dont la limite
est déjà ce qui fait tomber les tirs (voir `RAPPORT.md` du petit banc).

⛔ DEUX GÉNÉRATIONS PAR CAS, ET C'EST LE POINT. Un tir unique ne distingue pas
« le moteur calcule juste » de « le modèle a eu un bon jour ». Le rapport lit les
deux, jamais leur moyenne seule.

⚠️ UN SEUL RÉESSAI PAR GÉNÉRATION, et il est COMPTÉ. Le `546 WORKER_LIMIT` local
est une limite CPU intermittente et antérieure au chantier; le masquer par une
boucle rendrait un banc vert qui ne dit plus rien. Les deux tentatives sont
gardées dans `runs.json`.

⛔ RIEN N'EST ÉCRIT CHEZ UN UTILISATEUR RÉEL: `20-run.py` passe `intent: "draft"`,
et les comptes sont les fixtures `camp0909.*@keeltest.dev`.
"""
import json, pathlib, re, subprocess, sys, time
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).parent
REPO = HERE.parent.parent
CAMP = REPO / "scratchpad" / "2026-09-09-CAMPAGNE-PLANS"
DB, EDGE = "supabase_db_Sophia_2", "supabase_edge_runtime_Sophia_2"
CAS = json.loads((CAMP / "cas.json").read_text())
ORDRE = ["S1", "S2", "S3", "S4", "S5", "F1", "F2", "F3", "F4", "F5"]
GENERATIONS = 2


def psql(sql: str) -> str:
    p = subprocess.run(
        ["docker", "exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-tA"],
        input=sql, capture_output=True, text=True)
    return p.stdout.strip()


def calls_since(iso: str) -> list:
    rows = psql(f"""select coalesce(json_agg(t),'[]')::text from (
        select source, model, status, latency_ms, total_tokens,
               metadata->>'service_tier_sent'   as tier_sent,
               metadata->>'service_tier_source' as tier_source,
               metadata->>'service_tier_echoed' as tier_echoed
        from llm_usage_events where created_at >= '{iso}'::timestamptz
        order by created_at) t""")
    try:
        return json.loads(rows or "[]")
    except Exception:  # noqa: BLE001
        return []


def shutdown_reasons(iso: str) -> list:
    logs = subprocess.run(["docker", "logs", EDGE, "--since", iso],
                          capture_output=True, text=True)
    out = []
    for line in (logs.stdout + logs.stderr).splitlines():
        low = line.lower()
        if "cpu time" in low or "memory limit" in low or "wall clock" in low:
            out.append(line.strip()[:160])
    return sorted(set(out))


def budget_refusals(iso: str) -> list:
    logs = subprocess.run(["docker", "logs", EDGE, "--since", iso],
                          capture_output=True, text=True)
    out = []
    for line in (logs.stdout + logs.stderr).splitlines():
        i = line.find('{"tag":"keel.plan.repair_refused"')
        if i >= 0:
            try:
                out.append(json.loads(line[i:]))
            except Exception:  # noqa: BLE001
                pass
    return out


def one_attempt(name: str) -> dict:
    since = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    t0 = time.time()
    p = subprocess.run([sys.executable, "20-run.py", name], cwd=CAMP,
                       capture_output=True, text=True)
    wall = round(time.time() - t0, 1)
    out = p.stdout
    http = None
    m = re.search(r"http=(-?\d+)", out)
    if m:
        http = int(m.group(1))
    plan = None
    m = re.search(r"→ (plan-[\w.-]+\.json)", out)
    if m:
        plan = str(CAMP / m.group(1))
    stamp = None
    if plan:
        m = re.search(r"plan-\w+-(\d{8}-\d{6})\.json", plan)
        stamp = m.group(1) if m else None
    code_changed = "LE CODE A CHANGÉ" in out
    dishes = preps = sessions = shopping = None
    m = re.search(r"plats=(\d+) préparations=(\d+) sessions=(\d+) courses=(\d+)", out)
    if m:
        dishes, preps, sessions, shopping = (int(x) for x in m.groups())
    return {
        "since": since,
        "http": http,
        "wall_s": wall,
        "plan": plan,
        "stamp": stamp,
        "log": str(CAMP / f"log-{name}-{stamp}.json") if stamp else None,
        "draft": str(CAMP / f"draft-{name}-{stamp}.json") if stamp else None,
        "code_changed_under_run": code_changed,
        "dishes": dishes, "preparations": preps,
        "sessions": sessions, "shopping": shopping,
        "appels": calls_since(since),
        "refus_budget": budget_refusals(since),
        "shutdown": shutdown_reasons(since),
        "stdout_tail": out[-1200:],
    }


def generation(name: str, n: int) -> dict:
    print(f"\n── {name} · génération {n}/{GENERATIONS} · {CAS[name]['titre'][:60]}")
    a = one_attempt(name)
    tries = [a]
    # ⚠️ UN SEUL RÉESSAI, ET SEULEMENT SUR UNE PANNE DE PLATEFORME (546 CPU,
    # 502 worker recréé, -1 transport). Un 4xx/5xx applicatif se garde tel quel:
    # c'est une mesure, pas un incident.
    if a["http"] in (546, 502, -1, None):
        print(f"   ⚠️ http={a['http']} — un seul réessai, et il est compté.")
        time.sleep(15)
        tries.append(one_attempt(name))
    last = tries[-1]
    print(f"   http={last['http']} · mur {last['wall_s']}s · tentatives={len(tries)} · "
          f"{len(last['appels'])} appels modèle · plats={last['dishes']}")
    for c in last["appels"]:
        print(f"      · {c.get('source')} — {c.get('model')} — tier {c.get('tier_sent')}"
              f"/{c.get('tier_source')} → {c.get('tier_echoed')} — {c.get('latency_ms')} ms")
    for r in last["refus_budget"]:
        print(f"      ⚠️ rattrapage refusé: {r.get('label')} — {r.get('reason')}")
    if last["shutdown"]:
        print(f"      ⛔ shutdown: {last['shutdown'][0][:110]}")
    return {"cas": name, "gen": n, "tentatives": tries, "retenu": last}


if __name__ == "__main__":
    wanted = [x for x in (sys.argv[1:] or ORDRE)]
    runs = []
    t0 = time.time()
    for name in wanted:
        for n in range(1, GENERATIONS + 1):
            runs.append(generation(name, n))
            (HERE / "runs.json").write_text(json.dumps(runs, indent=1, default=str))
    ok = sum(1 for r in runs if r["retenu"]["http"] == 200)
    print(f"\n═══ {ok}/{len(runs)} générations abouties · {round(time.time() - t0)} s ═══")
    print(f"→ {HERE / 'runs.json'}")
