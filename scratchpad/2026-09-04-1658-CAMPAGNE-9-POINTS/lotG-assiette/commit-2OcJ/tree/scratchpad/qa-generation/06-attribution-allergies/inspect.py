import json,re,sys,os
d=sys.argv[1]
names={'8917f344-51d8-4177-8c54-ff4460ef9122':'Bertille',
       'db0dcc2f-a0f4-46d7-90ab-980b8be0189c':'Ysoline',
       '2a937736-693a-45f1-97a6-110f535ae004':'Marceau'}
r=json.load(open(f"{d}/http-response.json"))
print(f"--- {os.path.basename(d)} ---")
print("  ok:", r.get('ok'), "| error:", r.get('error'), "| lock:", r.get('lock'))
pu=open(f"{d}/dump/prompt-user.txt").read() if os.path.exists(f"{d}/dump/prompt-user.txt") else ""
print("  bloc attribué:", "MOUTHS AT THIS TABLE" in pu, "| bloc severity (autre lane):", "not decoration" in pu)
if pu:
    for l in pu.split("\n")[:8]:
        if l.startswith("- ") and "severity=" in l: print("   prompt>", l)
txt=json.dumps(r).lower()
for tok in ("pistachio","tree_nut","tree nut","celeriac"):
    n=txt.count(tok)
    if n: print(f"  ⚠ {tok} x{n}")
if 'member_portions' in r:
    for mp in r['member_portions']:
        note=(mp.get('portion_note') or '')
        warn=[w for w in re.findall(r"(?:with |and )?no [a-z ]{3,20}", note)]
        print("  ", names.get(mp['member_id'],mp['member_id'][:8]), "::", (warn or "—"))
if r.get('error'):
    print("  issues:", (r.get('issues') or [])[:4])
