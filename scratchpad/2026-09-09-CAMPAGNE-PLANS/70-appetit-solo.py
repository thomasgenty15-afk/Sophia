#!/usr/bin/env python3
"""
L'APPÉTIT SUR LA LANE SOLO — la fixture que la campagne du 2026-09-09 n'avait pas.

⛔ POURQUOI CE SCRIPT EXISTE. `10-fixtures.py` crée les comptes solo SANS foyer
(`solo()` ne touche à aucune table `household_*`). Or l'appétit vit sur la FICHE
DE BOUCHE (`household_member_bodies.appetite`), y compris celle du titulaire — à
qui l'écran pose la question au « tu ». Un compte solo sans ligne de foyer ne
peut donc pas porter de réponse, et le banc mesurerait « l'appétit ne change
rien » sur une population qui n'a jamais pu répondre.

⚠️ CE N'EST PAS UN ÉTAT ARTIFICIEL: l'entonnoir réel (FF-060) crée le foyer du
titulaire dès l'inscription. C'est la FIXTURE qui était en retard sur le produit.

⛔ `chooseGenerator` ROUTE TOUJOURS SUR LA LANE SOLO: un foyer d'une seule bouche
compose comme un solo (`otherMouths >= 1` est faux). On mesure donc bien la lane
individuelle, avec une fiche de bouche derrière elle.

    python3 70-appetit-solo.py S2 small
    python3 70-appetit-solo.py S2 --clear      (retire la réponse, garde la ligne)
"""
import json, subprocess, sys, pathlib, urllib.request, urllib.error

HERE = pathlib.Path(__file__).parent
REPO = HERE.parent.parent
ENV = {}
for line in (REPO / "supabase" / ".env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        ENV[k.strip()] = v.strip().strip('"')
API, ANON = ENV["SUPABASE_URL"], ENV["SUPABASE_ANON_KEY"]
DB = "supabase_db_Sophia_2"
CAS = json.loads((HERE / "cas.json").read_text())


def psql(sql):
    p = subprocess.run(["docker", "exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres",
                        "-v", "ON_ERROR_STOP=1", "-tA"], input=sql, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip())
    return p.stdout.strip()


def http(url, body=None, token=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("apikey", ANON)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        return {"__http_error__": e.code, "detail": e.read().decode()[:400]}


def main(name, appetite):
    cas = CAS[name]
    if cas["lane"] != "solo":
        raise SystemExit(f"{name} n'est pas une lane solo")
    tok = http(f"{API}/auth/v1/token?grant_type=password",
               {"email": cas["email"], "password": "1234567"})["access_token"]
    body = json.loads((HERE / f"body-{name}.json").read_text())
    uid = body["userId"]

    def rpc(fn, payload):
        return http(f"{API}/rest/v1/rpc/{fn}", payload, token=tok)

    roster = rpc("keel_household_roster", {})
    if not isinstance(roster, list) or len(roster) == 0:
        rpc("keel_household_create", {"p_name": f"Solo {name} (banc appétit)"})
        roster = rpc("keel_household_roster", {})
    mid = roster[0]["member_id"]
    # ⛔ LE MÊME APPEL QUE L'ÉCRAN, pas un `update` SQL: `keel_household_set_member_body`
    # porte le CHECK du vocabulaire et l'horodatage `appetite_asked_at`. Un
    # `update` direct écrirait un état que l'écran ne peut pas produire.
    out = rpc("keel_household_set_member_body", {
        "p_member": mid,
        "p_height_cm": body["heightCm"], "p_weight_kg": body["weightKg"],
        "p_gender": body["gender"], "p_activity_level": body["activityLevel"],
        "p_day_activity": None, "p_sport_frequency": None, "p_activity_axes_asked": False,
        "p_takes_dessert": None, "p_takes_cheese": None, "p_takes_bread": None,
        "p_meal_structure_asked": False,
        # ⛔ `p_appetite_asked` EST LE SEUL INTERRUPTEUR D'ÉCRITURE. Le `on
        # conflict` de la RPC garde la valeur d'avant quand il est faux (« la
        # question n'a pas été posée cette fois-ci »); c'est donc `true` +
        # `p_appetite: null` qui EFFACE une réponse, et l'état obtenu se lit
        # « on a demandé, personne n'a répondu » — pas « jamais demandé ».
        "p_appetite": appetite, "p_appetite_asked": True})
    if isinstance(out, dict) and "__http_error__" in out:
        raise SystemExit(f"écriture refusée: {out}")
    hh = psql(f"select public.keel_household_of('{uid}')")
    # La couverture, sinon `generate-meal-v1` rend 402 `household_frozen`.
    psql(f"update households set free_until=current_date+30 where id='{hh}'")
    row = psql(f"""select b.appetite, b.appetite_asked_at is not null
                     from household_members m
                     left join household_member_bodies b on b.member_id=m.member_id
                    where m.user_id='{uid}'""")
    print(f"{name}: foyer {hh} · bouche {mid} · appetite={row}")
    print(f"       bouches={len(rpc('keel_household_roster', {}))} (1 ⇒ la lane solo reste choisie)")


if __name__ == "__main__":
    n = sys.argv[1]
    a = sys.argv[2] if len(sys.argv) > 2 else None
    main(n, None if a in (None, "--clear") else a)
