#!/usr/bin/env python3
"""FF-066 lot 3 — le banc de l'aide sur l'app, en vrais tours de conversation.

Chaque cas envoie UN message par `chat-inbound-v1`, avec le JWT d'un compte de
test nommé (mot de passe des fixtures locales), et un `x-request-id` à nous: la
ligne de log `keel/app_help` du tour porte ce même identifiant, ce qui relie
chaque question à ce que le dispatcher a émis et à ce que le runtime a injecté.

Mesures (fiche FF-066 §10):
  - la bonne fiche est-elle dans les identifiants émis ?
  - un message qui n'est PAS une question sur l'app déclenche-t-il l'aide ?
  - la réponse cite-t-elle un libellé entre guillemets qui n'existe dans aucune
    fiche ? (à relire à la main: ce peut être une citation du message)
  - combien de tokens le dispatcher et le composeur ont-ils lus ?

Prérequis: pile locale démarrée, `supabase functions serve` actif.
Usage: python3 scripts/2026-09-23-banc-aide-app.py [--out DIR]
⚠️ Écrit des messages (et parfois des faits de repas) dans des comptes de TEST.
"""
import argparse
import json
import re
import subprocess
import threading
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = "http://127.0.0.1:54321"
PASSWORD = "1234567"
CARDS_TS = ROOT / "supabase/functions/_shared/keel/app_help/cards.ts"

# (compte, langue, description) — objectifs relus en base le 2026-09-23.
ACCOUNTS = {
    "fr_perte_foyer": ("qa-fagenty-f1@keeltest.dev", "fr", "titulaire, foyer de 3, perte de poids"),
    "fr_maintien_solo": ("lotf.camp7.c4101@keeltest.dev", "fr", "seul, maintien"),
    "en_perte_foyer": ("qa3a.foyer@keeltest.dev", "en", "titulaire, foyer de 4, perte de poids"),
    "en_maintien_solo": ("qa2a.s2@keeltest.dev", "en", "sans foyer, maintien"),
    "fr_membre": ("lotf.perte.duo2.second@keeltest.dev", "fr", "membre ayant réclamé sa place (keel_role vide)"),
}

# (compte, message, fiches acceptées — [] = ce n'est PAS une question sur l'app)
CASES = [
    ("fr_perte_foyer", "comment je prends mon plat en photo ?", ["meal_photo_how"]),
    ("fr_perte_foyer", "la photo, c'est compté ?", ["meal_photo_counted"]),
    ("fr_perte_foyer", "où est ma liste de courses ?", ["shopping_list"]),
    ("fr_perte_foyer", "comment je résilie mon abonnement ?", ["subscription_cancel"]),
    ("fr_perte_foyer", "je peux changer un plat de mon plan ?", ["plan_change_dish"]),
    ("fr_perte_foyer", "comment j'ajoute mon mari au foyer ?", ["household_add_person", "household_invite"]),
    ("fr_perte_foyer", "ça prend combien de temps de faire un plan ?", ["plan_composing_time"]),
    ("fr_perte_foyer", "comment je valide mon plan ?", ["plan_adopt"]),
    ("fr_perte_foyer", "je peux faire un plan sur deux semaines ?", ["plan_window"]),
    ("fr_perte_foyer", "je ne serai pas là mardi soir, je fais comment dans l'app ?", ["plan_absence"]),
    ("fr_perte_foyer", "comment je change mon budget ?", ["plan_settings"]),
    ("fr_perte_foyer", "où sont les recettes ?", ["cooking_sessions"]),
    ("fr_perte_foyer", "est-ce que je dois cocher ce que j'ai mangé ?", ["meal_default_eaten"]),
    ("fr_perte_foyer", "comment j'entre mon poids ?", ["weight_entry"]),
    ("fr_perte_foyer", "comment je coupe les notifications ?", ["notifications_off"]),
    ("fr_perte_foyer", "où je vois ce que tu as retenu sur moi ?", ["sophia_memory"]),
    ("fr_perte_foyer", "combien ça coûte ?", ["price_trial"]),
    ("fr_perte_foyer", "comment je supprime mon compte ?", ["account_delete"]),
    ("fr_perte_foyer", "je peux scanner un code-barres ?", ["unknown_feature"]),
    ("fr_perte_foyer", "comment je cache les calories ?", ["plan_calories_display"]),
    ("fr_perte_foyer", "comment je change la langue de l'app ?", ["language_change"]),
    ("fr_perte_foyer", "comment on installe l'app sur iphone ?", ["install_app"]),
    ("fr_perte_foyer", "tu peux modifier mon plan pour moi ?", ["sophia_can_do", "plan_change_dish"]),
    ("fr_perte_foyer", "comment je donne un accès à ma femme ?", ["household_invite"]),
    ("fr_perte_foyer", "je peux remplacer le riz par des pâtes ce soir ?", []),
    ("fr_perte_foyer", "pourquoi il n'y a jamais de poulet ?", []),
    ("fr_perte_foyer", "les portions étaient énormes hier", []),
    ("fr_perte_foyer", "je n'aime pas trop le poisson", []),
    ("fr_perte_foyer", "je suis crevée aujourd'hui", []),
    ("fr_perte_foyer", "c'est quoi une bonne collation avant le sport ?", []),
    ("fr_maintien_solo", "comment j'envoie une photo de mon repas ?", ["meal_photo_how"]),
    ("fr_maintien_solo", "je vois pas de bouton + dans la conversation, c'est normal ?", ["meal_photo_how", "meal_describe", "meal_not_eaten"]),
    ("fr_maintien_solo", "d'où vient mon chiffre de calories ?", ["energy_number_origin"]),
    ("fr_maintien_solo", "où je vois mes progrès ?", ["progress_page"]),
    ("fr_maintien_solo", "pourquoi tu m'écris le soir ?", ["sophia_evening_messages"]),
    ("fr_maintien_solo", "j'ai faim ce soir, une idée ?", []),
    ("en_perte_foyer", "how do I send a photo of my meal?", ["meal_photo_how"]),
    ("en_perte_foyer", "does the photo count?", ["meal_photo_counted"]),
    ("en_perte_foyer", "where is my shopping list?", ["shopping_list"]),
    ("en_perte_foyer", "how do I cancel my subscription?", ["subscription_cancel"]),
    ("en_perte_foyer", "can I swap a dish in my plan?", ["plan_change_dish"]),
    ("en_perte_foyer", "how do I add my wife to the household?", ["household_add_person", "household_invite"]),
    ("en_perte_foyer", "can I scan a barcode?", ["unknown_feature"]),
    ("en_perte_foyer", "how do I turn off notifications?", ["notifications_off"]),
    ("en_perte_foyer", "how do I change my password?", ["password_change"]),
    ("en_perte_foyer", "why is there never any chicken?", []),
    ("en_perte_foyer", "the portions were way too big yesterday", []),
    ("en_maintien_solo", "how do I export my data?", ["data_export"]),
    ("en_maintien_solo", "how do I log a meal I ate out?", ["meal_not_eaten", "meal_describe"]),
    ("en_maintien_solo", "where do I see my weight curve?", ["progress_page", "weight_entry"]),
    ("en_maintien_solo", "I had a lovely dinner", []),
    ("fr_membre", "comment je prends mon plat en photo ?", ["meal_photo_how"]),
    # ⟳ 2026-09-24 — la question réelle qui a montré le trou du catalogue
    # (aucune fiche « moments de repas »; `plan_settings` servi à la place).
    ("fr_perte_foyer", "comment je fais pour modifier les créneaux des repas que j'ai ? Parce que là ça m'affiche après midi quand je veux générer un plan mais moi je veux pas", ["meal_slots"]),
    ("fr_perte_foyer", "comment je change mon objectif ?", ["goal_change"]),
    ("fr_perte_foyer", "je suis devenue végétarienne, je le mets où dans l'app ?", ["food_preferences_self"]),
    ("fr_perte_foyer", "où je change mon poids et ma taille pour les portions ?", ["body_details"]),
    ("fr_maintien_solo", "je veux plus de goûter dans mes plans, je fais comment ?", ["meal_slots"]),
    ("fr_maintien_solo", "je ne prends jamais de petit-déjeuner", []),
    ("en_perte_foyer", "how do I remove the afternoon snack from my plans?", ["meal_slots"]),
    ("en_perte_foyer", "how do I change my goal?", ["goal_change"]),
]


def anon_key() -> str:
    for line in (ROOT / "supabase/.env").read_text().splitlines():
        if line.startswith(("ANON_KEY=", "SUPABASE_ANON_KEY=")):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("clé anon introuvable dans supabase/.env")


def post(path: str, body: dict, headers: dict, timeout: int = 180):
    req = urllib.request.Request(
        URL + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as err:
        return err.code, {"error": err.read().decode(errors="replace")[:300]}
    except Exception as err:  # noqa: BLE001 — le banc note, il ne tombe pas
        return 0, {"error": str(err)[:300]}


def psql(sql: str) -> str:
    return subprocess.run(
        ["docker", "exec", "supabase_db_Sophia_2", "psql", "-U", "postgres", "-d", "postgres", "-tAc", sql],
        capture_output=True, text=True, check=False,
    ).stdout.strip()


def labels_by_locale():
    text = CARDS_TS.read_text(encoding="utf-8")
    fr = set(re.findall(r'fr: "((?:[^"\\]|\\.)*)", en:', text))
    en = set(re.findall(r'en: "((?:[^"\\]|\\.)*)" \}', text))
    return {"fr": {json.loads(f'"{v}"') for v in fr}, "en": {json.loads(f'"{v}"') for v in en}}


def quoted(reply: str):
    return [m.strip() for m in re.findall(r"«\s*([^»]+?)\s*»|“([^”]+)”|\"([^\"]+)\"", reply) for m in m if m]


def app_help_line(request_id: str, since: str):
    logs = subprocess.run(
        ["docker", "logs", "--since", since, "supabase_edge_runtime_Sophia_2"],
        capture_output=True, text=True, check=False,
    )
    for line in (logs.stdout + logs.stderr).splitlines():
        if '"keel/app_help"' in line and request_id in line:
            start = line.find("{")
            try:
                return json.loads(line[start:])
            except json.JSONDecodeError:
                return {"raw": line[start:][:400]}
    return None


def run_account(name, cases, anon, results, lock):
    email, locale, _ = ACCOUNTS[name]
    status, token = post("/auth/v1/token?grant_type=password", {"email": email, "password": PASSWORD}, {"apikey": anon})
    if "access_token" not in token:
        with lock:
            results.append({"account": name, "error": f"connexion refusée: {token}"})
        return
    jwt = token["access_token"]
    user_id = psql(f"select id from auth.users where email='{email}';")
    for _, text, expected in cases:
        request_id = f"banc-aide-{uuid.uuid4()}"
        since = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        t0 = time.time()
        status, body = post(
            "/functions/v1/chat-inbound-v1",
            {"client_message_id": str(uuid.uuid4()), "kind": "text", "text": text},
            {"apikey": anon, "Authorization": f"Bearer {jwt}", "x-request-id": request_id},
        )
        elapsed = round(time.time() - t0, 1)
        time.sleep(1.5)
        line = app_help_line(request_id, since)
        reply = psql(
            "select content from chat_messages where user_id='" + user_id + "' and role='assistant' "
            f"and created_at >= to_timestamp({t0 - 1}) order by created_at desc limit 1;"
        )
        topics = (line or {}).get("topics") or []
        row = {
            "account": name,
            "locale": locale,
            "message": text,
            "expected": expected,
            "http": status,
            "elapsed_s": elapsed,
            "logged": line is not None,
            "detected": bool((line or {}).get("detected")),
            "topics": topics,
            "dropped_topics": (line or {}).get("dropped_topics"),
            "injected": bool((line or {}).get("injected")),
            "viewer": [(line or {}).get("viewer_role"), (line or {}).get("viewer_goal")],
            "reply": reply,
            "request_id": request_id,
            "error": body.get("error") if isinstance(body, dict) else None,
        }
        with lock:
            results.append(row)
            print(f"[{name}] {elapsed:>5}s det={row['detected']!s:5} topics={topics} ← {text}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="/tmp/banc-aide-app")
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    anon = anon_key()
    started = datetime.now(timezone.utc)
    results, lock = [], threading.Lock()
    threads = []
    for name in ACCOUNTS:
        cases = [c for c in CASES if c[0] == name]
        thread = threading.Thread(target=run_account, args=(name, cases, anon, results, lock))
        thread.start()
        threads.append(thread)
    for thread in threads:
        thread.join()

    (out / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    labels = labels_by_locale()
    results = [r for r in results if "expected" in r] + [r for r in results if "expected" not in r]
    positives = [r for r in results if r.get("expected")]
    negatives = [r for r in results if "expected" in r and not r["expected"]]
    students = [r for r in positives if r["account"] != "fr_membre"]
    hit = [r for r in students if set(r["expected"]) & set(r["topics"])]
    false_pos = [r for r in negatives if r["detected"]]
    for r in results:
        if "reply" in r:
            r["unknown_quotes"] = [q for q in quoted(r["reply"] or "") if q not in labels[r["locale"]]]

    emails = ", ".join(f"'{e}'" for e, _, _ in ACCOUNTS.values())
    usage = psql(
        "select source, count(*), round(avg(prompt_tokens)), round(avg(cached_prompt_tokens)) "
        "from llm_usage_events where user_id in (select id from auth.users where email in (" + emails + ")) "
        f"and created_at >= '{started.isoformat()}' and source in ('dispatcher-v2-llm','sophia-brain:companion') group by source;"
    )
    summary = {
        "started_at": started.isoformat(),
        "student_questions": len(students),
        "right_card_in_topics": len(hit),
        "right_card_rate": round(len(hit) / max(1, len(students)), 3),
        "negatives": len(negatives),
        "false_positives": len(false_pos),
        "false_positive_rate": round(len(false_pos) / max(1, len(negatives)), 3),
        "member_logged": [r.get("logged", r.get("error")) for r in results if r.get("account") == "fr_membre"],
        "llm_usage": usage,
    }
    (out / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
