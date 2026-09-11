#!/usr/bin/env python3
"""
LES DIX FIXTURES DE LA CAMPAGNE — 2026-09-09.

⛔ AUCUNE ÉCRITURE DE PRODUIT. Uniquement des comptes `camp0909.*@keeltest.dev`
et leurs lignes de profil / corps / objectif / foyer.

Chaque écriture passe par LA PORTE QUE L'ÉCRAN APPELLE dès qu'il y en a une
(les RPC `keel_household_*` de `SetupPage`), et par SQL seulement là où l'écran
écrit lui-même en PostgREST (profil, pesée, objectif).

  python3 10-fixtures.py            # les dix
  python3 10-fixtures.py S1 F3      # au choix
"""
import json, subprocess, sys, urllib.request, urllib.error, pathlib

HERE = pathlib.Path(__file__).parent
REPO = HERE.parent.parent
ENV = {}
for line in (REPO / "supabase" / ".env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        ENV[k.strip()] = v.strip().strip('"')
API = ENV["SUPABASE_URL"]
ANON = ENV["SUPABASE_ANON_KEY"]
SRK = ENV["SUPABASE_SERVICE_ROLE_KEY"]
PW = "1234567"
DB = "supabase_db_Sophia_2"
CAS = json.loads((HERE / "cas.json").read_text())


def psql(sql: str) -> str:
    p = subprocess.run(["docker", "exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres",
                        "-v", "ON_ERROR_STOP=1", "-tA"], input=sql, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip())
    return p.stdout.strip()


def http(url, body=None, token=None, method="POST", apikey=ANON):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", apikey)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        return {"__http_error__": e.code, "detail": e.read().decode()[:400]}


def login(email):
    out = http(f"{API}/auth/v1/token?grant_type=password", {"email": email, "password": PW})
    return (out or {}).get("access_token", "")


def ensure_user(email, full_name):
    tok = login(email)
    if not tok:
        http(f"{API}/auth/v1/admin/users",
             {"email": email, "password": PW, "email_confirm": True,
              "user_metadata": {"fixture": "CAMP-0909", "full_name": full_name}},
             token=SRK, apikey=SRK)
        tok = login(email)
    if not tok:
        raise RuntimeError(f"pas de jeton pour {email}")
    uid = psql(f"select id from auth.users where email='{email}'")
    return uid, tok


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def base_rows(uid, cas):
    p = cas["profile"]
    pc = json.dumps(cas["pc"]).replace("'", "''")
    pace = cas.get("pace")
    # ⚠️ LE BUT DU TITULAIRE VIT DANS `student_goals`, PAS SUR SA LIGNE DE BOUCHE.
    # `keel_household_roster_for` tranche `case when hm.user_id is null then hm.goal
    # else sg.goal end`: un `keel_household_set_member_goal` sur le titulaire
    # écrit une colonne que PERSONNE ne relit. Mesuré ici le 2026-09-09 — le
    # foyer des extrêmes rendait son titulaire en « entretien ».
    goal = cas["goal"] if cas["lane"] == "solo" else next(
        (m["goal"] for m in cas.get("membres", []) if m.get("owner")), "maintenance")
    psql(f"""
update profiles set full_name={q(cas['nom'])}, birth_date={q(p['birth_date'])},
  gender={q(p['gender'])}, height_cm={p['height_cm']}, activity_level={q(p['activity_level'])},
  locale={q(p['locale'])}, country={q(p['country'])}, timezone='Europe/London',
  onboarding_completed=true, access_tier='student',
  trial_start=now(), trial_end=now()+interval '30 days' where id='{uid}';

delete from student_body_measures where user_id='{uid}';
insert into student_body_measures(user_id, measured_at, local_date, kind, value_si, source, content_locale)
values ('{uid}', now(), current_date, 'weight', {cas['weight_kg']}, 'setup', 'en-GB');

insert into student_goals(user_id, goal, content_locale, practical_constraints, target_pace_kg_per_week)
values ('{uid}', {q(goal)}, 'en-GB', '{pc}'::jsonb,
        {pace if pace is not None else 'null'})
on conflict (user_id) do update set goal=excluded.goal, content_locale=excluded.content_locale,
  practical_constraints=excluded.practical_constraints,
  target_pace_kg_per_week=excluded.target_pace_kg_per_week, updated_at=now();

insert into coach_clients(coach_id, student_user_id, invited_email, status, consent_granted_at, seat_state, started_at)
select '00000000-0000-4000-8000-00000000d15c', '{uid}', {q(cas['email'])}, 'active', now(), 'trial', now()
where not exists (select 1 from coach_clients where student_user_id='{uid}');
""")


def solo(name, cas):
    uid, tok = ensure_user(cas["email"], cas["nom"])
    base_rows(uid, cas)
    # ── le régime et les allergies: la table de sécurité, en rétractation seule.
    psql(f"delete from student_safety_constraints where user_id='{uid}'")
    if cas.get("diet"):
        psql(f"""insert into student_safety_constraints(user_id, kind, severity, diet_ref, declared_by,
                 content_locale, status) values ('{uid}','diet','strict',{q(cas['diet'])},'student','en-GB','active')""")
    for ref, sev in cas.get("allergies", []):
        psql(f"""insert into student_safety_constraints(user_id, kind, severity, allergen_ref, declared_by,
                 content_locale, status) values ('{uid}','allergy',{q(sev)},{q(ref)},'student','en-GB','active')""")
    n = psql(f"select count(*) from student_safety_constraints where user_id='{uid}' and status='active'")
    print(f"  {name}  {uid}  contraintes={n}")
    return uid


def household(name, cas):
    uid, tok = ensure_user(cas["email"], cas["nom"])
    base_rows(uid, cas)
    owner = next((m for m in cas["membres"] if m.get("owner")), None)
    psql(f"delete from student_safety_constraints where user_id='{uid}'")
    if owner and owner.get("diet"):
        psql(f"""insert into student_safety_constraints(user_id, kind, severity, diet_ref, declared_by,
                 content_locale, status) values ('{uid}','diet','strict',{q(owner['diet'])},'student','en-GB','active')""")

    def rpc(fn, payload):
        return http(f"{API}/rest/v1/rpc/{fn}", payload, token=tok)

    roster = rpc("keel_household_roster", {})
    if isinstance(roster, dict) or roster is None:
        raise RuntimeError(f"roster illisible: {roster}")
    if len(roster) == 0:
        rpc("keel_household_create", {"p_name": cas["maison"]})
        roster = rpc("keel_household_roster", {})
    by_name = {r["first_name"]: r["member_id"] for r in roster}

    for m in cas["membres"]:
        mid = by_name.get(m["prenom"])
        if mid is None:
            if m.get("owner"):
                # le membre du titulaire existe déjà, sous le nom du profil
                mid = roster[0]["member_id"]
                rpc("keel_household_set_member_name", {"p_member": mid, "p_name": m["prenom"]})
            else:
                out = rpc("keel_household_add_member",
                          {"p_first_name": m["prenom"], "p_birth_date": m["birth_date"],
                           "p_goal": m["goal"]})
                mid = out["member_id"]
            by_name[m["prenom"]] = mid
        rpc("keel_household_set_member_birth_date", {"p_member": mid, "p_birth_date": m["birth_date"]})
        if m["goal"]:
            rpc("keel_household_set_member_goal", {"p_member": mid, "p_goal": m["goal"]})
        h, w, g, act, day, sport, app = m["body"]
        rpc("keel_household_set_member_body", {
            "p_member": mid, "p_height_cm": h, "p_weight_kg": w, "p_gender": g,
            "p_activity_level": act, "p_day_activity": day, "p_sport_frequency": sport,
            "p_activity_axes_asked": True, "p_takes_dessert": None, "p_takes_cheese": None,
            "p_takes_bread": None, "p_meal_structure_asked": False, "p_appetite": app,
            "p_appetite_asked": True})
        if m.get("diet"):
            rpc("keel_household_set_member_diet", {"p_member": mid, "p_diet": m["diet"]})
        for label in m.get("allergies", []):
            rpc("keel_household_add_allergy", {"p_member": mid, "p_label": label})

    hh = psql(f"select public.keel_household_of('{uid}')")
    psql(f"update households set free_until=current_date+30 where id='{hh}'")
    roster = rpc("keel_household_roster", {})
    print(f"  {name}  {uid}  foyer {hh}  bouches={len(roster)}  "
          + ", ".join(f"{r['first_name']}:{r['goal'] or '-'}{'/' + r['diet'] if r.get('diet') else ''}"
                      for r in roster))
    (HERE / f"roster-{name}.json").write_text(json.dumps(
        json.loads(psql(f"""select coalesce(json_agg(t),'[]')::text from (
            select m.member_id, m.first_name,
                   case when m.user_id is null then m.goal else sg.goal end as goal,
                   case when m.user_id is null then m.diet else (
                     select sc.diet_ref from student_safety_constraints sc
                      where sc.user_id=m.user_id and sc.kind='diet' and sc.status='active'
                      order by sc.created_at desc, sc.id desc limit 1) end as diet,
                   m.away_days,
                   b.height_cm::float as height_cm, b.weight_kg::float as weight_kg, b.gender,
                   b.activity_level, b.day_activity, b.sport_frequency, b.appetite,
                   extract(year from age(m.birth_date))::int as age_years
            from household_members m
                 left join household_member_bodies b on b.member_id=m.member_id
                 left join student_goals sg on sg.user_id=m.user_id
            where m.household_id='{hh}' order by m.joined_at) t""")), indent=1))
    return uid


def body_file(name, cas, uid):
    """Le corps tel que l'analyseur le relira — le MÊME que la base."""
    p = cas["profile"]
    age = int(psql(f"select extract(year from age(date '{p['birth_date']}'))::int"))
    band = "18_29" if age < 30 else "30_44" if age < 45 else "45_59" if age < 60 else "60_plus"
    (HERE / f"body-{name}.json").write_text(json.dumps({
        "case": name, "goal": cas["goal"] if cas["lane"] == "solo" else "maintenance",
        "weightKg": cas["weight_kg"], "heightCm": p["height_cm"], "gender": p["gender"],
        "ageBand": band, "ageYears": age, "activityLevel": p["activity_level"],
        "servings": 1, "regime": cas.get("diet"), "pace": cas.get("pace"),
        "userId": uid, "email": cas["email"]}, indent=1))


names = sys.argv[1:] or list(CAS)
for name in names:
    cas = CAS[name]
    print(f"── {name} · {cas['titre']}")
    uid = solo(name, cas) if cas["lane"] == "solo" else household(name, cas)
    body_file(name, cas, uid)
