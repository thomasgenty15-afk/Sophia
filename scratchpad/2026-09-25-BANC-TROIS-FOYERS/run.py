#!/usr/bin/env python3
"""Lance les générations UNE À LA FOIS et attend chaque brouillon.   python3 run.py A B C"""
import json, os, sys, time, uuid, pathlib, urllib.request, urllib.error
from cas import CAS
from fixtures import API, ANON, psql, login

HERE = pathlib.Path(__file__).parent


def post(token, body, rid):
    req = urllib.request.Request(f"{API}/functions/v1/generate-household-meal-v1",
                                 data=json.dumps(body).encode(), method="POST")
    for k, v in {"apikey": ANON, "content-type": "application/json",
                 "authorization": "Bearer " + token, "x-request-id": rid}.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=170) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def run(name):
    cas = CAS[name]
    uid = json.loads((HERE / f"ids-{name}.json").read_text())["uid"]
    tok = login(cas["email"])
    body = {"intent": "draft", "origin": "setup",
            "window": {"kind": "exact", **cas["window"]},
            "context": None, "replaces": None, "takeover": True, "operation": "compose",
            "preferences": None, "cooking_shape": None, "cooking_sessions": cas["sessions"]}
    rid = str(uuid.uuid4())
    t0 = time.time()
    code, raw = post(tok, body, rid)
    print(f"[{name}] HTTP {code} {raw[:300]}", flush=True)
    if code not in (200, 202):
        return
    draft = None
    while time.time() - t0 < 900:
        time.sleep(10)
        row = psql(f"select id||'|'||status||'|'||coalesce(stage,'')||'|'||attempt from student_meal_drafts "
                   f"where user_id='{uid}' and created_at > now() - interval '20 minutes' order by created_at desc limit 1")
        if not row:
            continue
        draft, status, stage, attempt = row.split("|")
        print(f"[{name}] {int(time.time()-t0)}s {status} {stage} tentative={attempt}", flush=True)
        if status not in ("running", "queued", "pending"):
            break
    if draft:
        # BANC_TAG: garde les pointeurs de référence (draft-A.txt…) intacts.
        (HERE / f"draft-{name}{os.environ.get('BANC_TAG', '')}.txt").write_text(draft)
        print(f"[{name}] brouillon {draft} en {int(time.time()-t0)}s", flush=True)


if __name__ == "__main__":
    for n in sys.argv[1:] or ["A", "B", "C"]:
        run(n)
