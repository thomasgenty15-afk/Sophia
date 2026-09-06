#!/usr/bin/env python3
"""Synthèse depuis les PLANS (compteurs embarqués dans la réponse = par requête), pas depuis les journaux partagés."""
import re,glob,os,json,unicodedata
FB=os.path.dirname(os.path.abspath(__file__)); TARGET={"Paul":2200,"Claire":1986,"Leo":2459,"Nora":1926}
NAMES={"b60378e6":"Paul","89fbc19f":"Nora","620d929d":"Claire","49375b46":"Leo"}
n=lambda s: unicodedata.normalize("NFKD",str(s or "")).encode("ascii","ignore").decode().lower()
def label(txt):
    m=re.search(r"retenu: (.*)",txt); raw=m.group(1) if m else ""
    try:
        arr=json.loads(raw.split(" · encart:")[0]) if raw.startswith("[") else []
        s=", ".join(f"{i['kind'].split('.')[1]} {i['text']}@{NAMES.get(i['subject'][7:15],'?') if i['subject'].startswith('member:') else 'table'}" for i in arr) or "témoin"
        return s+(" + envie fajitas" if "encart:" in raw else "")
    except Exception: return raw[:40]
rows=[]
for f in sorted(glob.glob(f"{FB}/F[BC]*.txt"), key=lambda p:(len(os.path.basename(p)),p)):
    cas=os.path.basename(f)[:-4]; t=open(f,encoding="utf-8",errors="replace").read()
    plans=sorted(glob.glob(f"{FB}/plan-{cas}-*.json"))
    if not plans: continue
    d=json.load(open(plans[-1])); h=d.get("household") or {}
    eb=h.get("exclusion_belt") or {}; md=h.get("meals_delivered") or {}; bs=h.get("box_sizing") or {}; ub=bs.get("unmet_band") or {}
    http=re.search(r"http=(\d+) · ([\d.]+) s",t)
    kcal={}
    for name in TARGET:
        mm=re.search(rf"^\s*{name}\s+(\d+)\s+(\d+)\s+(\d+)",t,re.M)
        if mm: kcal[name]=int(mm.group(2))
    leaks=re.search(r"boîtes vérifiées (\d+) · fuites (\d+)",t)
    slots=len({(x.get("day"),x.get("slot")) for x in d.get("dishes",[]) if x.get("slot") in ("lunch","dinner")})
    lbl=bs.get("lost_by_line") or {}
    rows.append((cas,label(t),http.group(1) if http else "?",float(http.group(2)) if http else 0,kcal,eb,md,ub,leaks.group(2) if leaks else "—",slots,len(d.get("dishes",[])),lbl))
print(f"{'cas':5} | {'retenu':42} | http/s  | {'Paul':9} {'Claire':9} {'Leo':9} {'Nora':9} | morsures bites/sep/refus · avant→après(relance) | manquants (avant→après) · repli | ≥200 sous | fuites | déj+dîn/plats | perdu par la ligne (j-bouche/kcal)")
for cas,lab,code,secs,kcal,eb,md,ub,leaks,slots,nd,lbl in rows:
    pct=lambda k: f"{100*kcal[k]/TARGET[k]:3.0f}%" if k in kcal else "  — "
    ebs=f"{eb.get('bites','-')}/{eb.get('separated','-')}/{eb.get('refused','-')} · {eb.get('bites_before','-')}→{eb.get('bites_after','-')}({'oui' if eb.get('retried') else 'non'})"
    mds=f"{md.get('missing_before','-')}→{md.get('missing','-')} · fb={md.get('restored_fallback','-')}"
    print(f"{cas:5} | {lab[:42]:42} | {code}/{secs:3.0f} | {pct('Paul'):9} {pct('Claire'):9} {pct('Leo'):9} {pct('Nora'):9} | {ebs:44} | {mds:24} | {ub.get('gte_200','-')!s:9} | {leaks:6} | {slots}/{nd} | {lbl.get('mouth_days','—')}/{lbl.get('kcal','—')}")
