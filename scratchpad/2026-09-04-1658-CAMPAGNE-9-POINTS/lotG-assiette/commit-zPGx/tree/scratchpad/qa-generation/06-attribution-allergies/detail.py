import json,re,sys,os
names={'8917f344-51d8-4177-8c54-ff4460ef9122':'Bertille',
       'db0dcc2f-a0f4-46d7-90ab-980b8be0189c':'Ysoline (allergique)',
       '2a937736-693a-45f1-97a6-110f535ae004':'Marceau'}
for d in sorted(sys.argv[1:]):
    if not os.path.exists(f"{d}/http-response.json"): print(f"{d}: incomplet"); continue
    r=json.load(open(f"{d}/http-response.json"))
    if "invalid response" in json.dumps(r): print(f"{os.path.basename(d)}: 502 Kong (ne conclut rien)"); continue
    pu=open(f"{d}/dump/prompt-user.txt").read() if os.path.exists(f"{d}/dump/prompt-user.txt") else ""
    arm = "APRÈS" if "MOUTHS AT THIS TABLE" in pu else "AVANT"
    verdict = "422 "+str(r.get('lock')) if r.get('error') else ("200 plan écrit" if r.get('ok') else str(r)[:60])
    # le modèle: où est le pistachio ?
    src = None
    if os.path.exists(f"{d}/dump/output.json"):
        o=json.load(open(f"{d}/dump/output.json"))
        src=o['result'].get('output_text_json') or None
    hits=[]
    if src:
        def walk(n,p):
            if isinstance(n,dict):
                for k,v in n.items(): walk(v,p+"."+k)
            elif isinstance(n,list):
                for i,v in enumerate(n): walk(v,f"{p}[{i}]")
            elif isinstance(n,str) and re.search("pistachio",n,re.I): hits.append(p)
        walk(src,"")
    boxed=[]
    if src:
        for pr in src.get('preparations',[]):
            if re.search("pistachio", json.dumps(pr), re.I):
                for b in pr.get('boxes',[]): boxed += [names.get(m,m[:8]) for m in b.get('member_ids',[])]
        for dd in src.get('dishes',[]):
            pass
    warn=[]
    if src:
        for mp in src.get('member_portions',[]):
            note=mp.get('portion_note') or ''
            for m in re.findall(r"(?:with |and )?no ([a-z ]{3,18})", note):
                warn.append(f"{names.get(mp['member_id'],mp['member_id'][:8])}: « no {m.strip()} »")
    print(f"{os.path.basename(d):12s} [{arm}] {verdict}")
    print(f"   pistachio dans la sortie MODÈLE: {len(hits)} champ(s) {hits[:5]}")
    if boxed: print(f"   boîtes de la préparation au pistachio -> {sorted(set(boxed))}")
    if warn: print(f"   avertissements: {warn}")
