#!/usr/bin/env python3
"""Crée les foyers du banc par les portes de l'app. Écrit UNIQUEMENT sur des comptes banc0925.*@keeltest.dev.

  python3 fixtures.py A B C
"""
import json, subprocess, sys, pathlib, urllib.request, urllib.error
from cas import CAS

HERE = pathlib.Path(__file__).parent
REPO = pathlib.Path("/Users/ahmedamara/Dev/Sophia 2")
ENV = {}
for line in (REPO / "supabase" / ".env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        ENV[k.strip()] = v.strip().strip('"')
API, ANON = ENV["SUPABASE_URL"], ENV["SUPABASE_ANON_KEY"]
PW = "1234567"
DB = "supabase_db_Sophia_2"


def psql(sql):
    p = subprocess.run(["docker", "exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres",
                        "-v", "ON_ERROR_STOP=1", "-tA"], input=sql, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip())
    return p.stdout.strip()


def http(url, body=None, token=None, method="POST"):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", ANON)
    req.add_header("content-type", "application/json")
    req.add_header("authorization", "Bearer " + (token or ANON))
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        return {"__http_error__": e.code, "detail": e.read().decode()[:400]}


def login(email):
    out = http(f"{API}/auth/v1/token?grant_type=password", {"email": email, "password": PW})
    return (out or {}).get("access_token", "")


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def ensure_user(cas):
    assert cas["email"].startswith("banc0925.") and cas["email"].endswith("@keeltest.dev")
    tok = login(cas["email"])
    if not tok:
        out = http(f"{API}/auth/v1/signup", {
            "email": cas["email"], "password": PW,
            "data": {"full_name": cas["nom"], "locale": "fr-FR", "timezone": "Europe/Paris",
                     "tz_follow_device": True, "keel_signup_intent": "student_free", "country": "FR"}})
        if isinstance(out, dict) and out.get("__http_error__"):
            raise RuntimeError(f"signup: {out}")
        tok = login(cas["email"])
    if not tok:
        raise RuntimeError(f"pas de jeton pour {cas['email']}")
    return psql(f"select id from auth.users where email='{cas['email']}'"), tok


def check(label, out):
    if not isinstance(out, dict) or out.get("ok") is not True:
        raise RuntimeError(f"{label}: {out}")
    return out


def provision(name):
    cas = CAS[name]
    uid, tok = ensure_user(cas)
    p = cas["profile"]
    pc = json.dumps(cas["pc"], ensure_ascii=False).replace("'", "''")
    psql(f"""
update profiles set full_name={q(cas['nom'])}, birth_date={q(p['birth_date'])}, gender={q(p['gender'])},
  height_cm={p['height_cm']}, locale='fr-FR', country='FR', timezone='Europe/Paris' where id='{uid}';
delete from student_body_measures where user_id='{uid}';
insert into student_body_measures(user_id, measured_at, local_date, kind, value_si, source, content_locale)
values ('{uid}', now(), current_date, 'weight', {cas['weight_kg']}, 'setup', 'fr-FR');
insert into student_goals(user_id, goal, content_locale, practical_constraints, target_pace_kg_per_week, target_weight_kg)
values ('{uid}', {q(cas['goal'])}, 'fr-FR', '{pc}'::jsonb, {cas['pace'] or 'null'}, {cas['target'] or 'null'})
on conflict (user_id) do update set goal=excluded.goal, content_locale=excluded.content_locale,
  practical_constraints=excluded.practical_constraints, target_pace_kg_per_week=excluded.target_pace_kg_per_week,
  target_weight_kg=excluded.target_weight_kg, updated_at=now();
delete from student_safety_constraints where user_id='{uid}';
""")
    if cas.get("diet"):
        psql(f"""insert into student_safety_constraints(user_id, kind, severity, diet_ref, declared_by, content_locale, status)
                 values ('{uid}','diet','strict',{q(cas['diet'])},'student','fr-FR','active')""")

    rpc = lambda fn, payload: http(f"{API}/rest/v1/rpc/{fn}", payload, token=tok)
    roster = rpc("keel_household_roster", {})
    if not isinstance(roster, list):
        raise RuntimeError(f"roster: {roster}")
    if len(roster) == 0:
        check("create", rpc("keel_household_create", {"p_name": cas["nom"]}))
        roster = rpc("keel_household_roster", {})
    hh = psql(f"select public.keel_household_of('{uid}')")
    # Idempotence: on repart d'un foyer à la seule bouche du titulaire.
    psql(f"delete from household_members where household_id='{hh}' and user_id is null")
    psql(f"delete from household_member_allergies where household_id='{hh}'")
    psql(f"delete from household_food_restrictions where household_id='{hh}'")
    owner_mid = psql(f"select member_id from household_members where household_id='{hh}' and user_id='{uid}'")

    for m in cas["membres"]:
        if m.get("owner"):
            mid = owner_mid
            check("name", rpc("keel_household_set_member_name", {"p_member": mid, "p_first_name": m["prenom"]}))
        else:
            out = check("add", rpc("keel_household_add_member", {"p_first_name": m["prenom"],
                        "p_birth_date": m["birth_date"], "p_goal": m.get("goal")}))
            mid = out["member_id"]
            if m.get("pace"):
                check("target", rpc("keel_household_set_member_target", {"p_member": mid,
                      "p_target_weight_kg": m["target"], "p_pace_kg_per_week": m["pace"]}))
            if m.get("diet"):
                check("diet", rpc("keel_household_set_member_diet", {"p_member": mid, "p_diet": m["diet"]}))
            if m.get("rhythm"):
                check("rhythm", rpc("keel_household_set_member_rhythm", {"p_member": mid,
                      "p_rhythm": [{"slot": s, "at": None, "size": z} for s, z in m["rhythm"]]}))
            if m.get("away"):
                check("away", rpc("keel_household_set_member_away", {"p_member": mid, "p_away": m["away"]}))
        m["_mid"] = mid
        h, w, g, day, sport, app = m["body"]
        check("body", rpc("keel_household_set_member_body", {
            "p_member": mid, "p_height_cm": h, "p_weight_kg": w, "p_gender": g, "p_activity_level": None,
            "p_day_activity": day, "p_sport_frequency": sport, "p_activity_axes_asked": True,
            "p_appetite": app, "p_appetite_asked": True}))
        for label in m.get("allergies", []):
            check("allergy", rpc("keel_household_add_allergy", {"p_member": mid, "p_label": label}))
        for label in m.get("restrictions", []):
            check("restriction", rpc("keel_household_add_restriction", {"p_member": mid, "p_label": label}))
        check("habits", rpc("keel_household_set_member_habits", {"p_member": mid,
              "p_slots": m.get("habits", []), "p_note": None}))

    # Les exclusions d'un adulte: le canal de l'app est la note de plan, rangée
    # dans `practical_constraints.retained_items` du titulaire (forme relevée sur
    # un compte créé par l'écran).
    items = []
    for m in cas["membres"]:
        for text, ref, quote in m.get("exclusions", []):
            items.append({"at": "2026-09-25", "ref": ref, "item": "", "kind": "food.exclude", "text": text,
                          "force": "never", "quote": quote, "scope": "durable", "value": None,
                          "source": "draft_note", "occasion": None, "confidence": None,
                          "subject": "household" if m.get("owner") else f"member:{m['_mid']}"})
    if items:
        js = json.dumps(items, ensure_ascii=False).replace("'", "''")
        psql(f"update student_goals set practical_constraints = practical_constraints || jsonb_build_object('retained_items', '{js}'::jsonb) where user_id='{uid}'")
    if psql(f"select public.keel_household_is_covered('{hh}')") != "t":
        psql(f"update households set free_until=current_date+30 where id='{hh}'")
    s = cas["window"]["starts_on"]
    week = psql(f"select (date '{s}' - ((extract(isodow from date '{s}')::int - 1)))::text")
    check("envy", rpc("keel_household_submit_envy", {"p_week_start": week, "p_body": cas["envie"]}))

    roster = rpc("keel_household_roster", {})
    print(f"{name} {cas['email']} uid={uid} foyer={hh} couvert={psql(f'select public.keel_household_is_covered({q(hh)})')}")
    for r in roster:
        print("   ", json.dumps({k: r.get(k) for k in ("first_name", "goal", "diet", "age_years", "eating_slots")}, ensure_ascii=False))
    (HERE / f"ids-{name}.json").write_text(json.dumps({"uid": uid, "household": hh}))


if __name__ == "__main__":
    for n in sys.argv[1:] or ["A", "B", "C"]:
        provision(n)
