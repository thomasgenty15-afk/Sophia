#!/usr/bin/env python3
"""Lit les sorties d'`analyse-lot-F.ts` (une par tir) et les fixtures figées,
et rend un JSON + un tableau : bilan de livraison, cinq dénominateurs, dix
contrôles, anomalies NOMMÉES (bouche · date · créneau). Aucune équation ici :
on COMPTE des lignes que l'instrument a rendues, on n'en calcule aucune."""
import json, re, sys, glob, os
M="scratchpad/2026-09-15-BETA-PREUVES/mesure-30"; FX="scratchpad/2026-09-11-CLOTURE/fixtures"; SO="scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F"
TIRS=sys.argv[1:] or sorted(os.path.basename(f)[:-4] for f in glob.glob(f"{M}/c30-*-p*.txt") if not f.endswith(".figer.txt"))
# ⚠️ LE DERNIER SYMBOLE D'ÉTAT DE LA LIGNE, PAS LE PREMIER. Le contrôle 6 imprime
# le couloir d'ARCHIVE (celui du 2026-09-11) avec un ⛔ AVANT l'état réel de la
# case ; lire le premier symbole comptait chaque dîner comme un écart.
ROW=re.compile(r"^(\d{4}-\d{2}-\d{2})\s+(\w+)\s.*(✅|❌|⚪)\s*([^✅❌⚪]*)$")
DAYROW=re.compile(r"^(\d{4}-\d{2}-\d{2})\s+\d+\s+\d+\s.*(✅|❌|⚪)\s*([^✅❌⚪]*)$")
PROT=re.compile(r"^(\d{4}-\d{2}-\d{2})\s+(\d+ %)\s+(\S+)\s+(\S+ g|—)\s+(✅|❌|⚪)\s*([^✅❌⚪]*)$")
def section(txt, num):
    m=re.search(rf"^══ {num}\. [^\n]*\n(.*?)(?=^══ |\Z)", txt, re.S|re.M); return m.group(1) if m else ""
def count_states(block, rx=ROW):
    c={"ok":0,"ko":0,"nm":0}; anos=[]
    for line in block.splitlines():
        m=rx.match(line.strip())
        if not m: continue
        st=m.group(len(m.groups())-1); detail=m.group(len(m.groups())).strip()
        if st=="✅": c["ok"]+=1
        elif st=="⚪": c["nm"]+=1; anos.append(("non mesurable", line.strip()))
        else: c["ko"]+=1; anos.append(("non conforme", line.strip()))
    return c, anos
out=[]
for n in TIRS:
    p=f"{M}/{n}.txt"
    if not os.path.exists(p): print(f"tir {n}: analyse absente"); continue
    txt=open(p,encoding="utf-8").read()
    g=json.load(open(f"{FX}/{n}.json")); dem=g["demande"]; le=g.get("ligne_ecrite") or {}
    gf=le.get("generated_from") or {}; gf=json.loads(gf) if isinstance(gf,str) else gf
    val=gf.get("validation") or {}
    # l'artefact source (durée, statut, appels du registre, réparations)
    src=json.load(open(g["source_sortie"])) if os.path.exists(g["source_sortie"]) else {}
    ea=src.get("etat_apres") or {}
    # blocs par bouche : entre deux lignes de ═ pleine largeur, le nom
    blocs=re.split(r"\n═{60,}\n", txt)
    bouches=[]
    for i in range(1,len(blocs)-1,2):
        nom=blocs[i].strip().splitlines()[0].strip() if blocs[i].strip() else f"bloc{i}"
        body=blocs[i+1]
        c4=re.search(r"attendues (\d+) · plats (\d+) · manquantes (\d+)", section(body,4))
        c1,a1=count_states(section(body,1)); c2,a2=count_states(section(body,2)); c5,a5=count_states(section(body,5),DAYROW); c6,a6=count_states(section(body,6)); c8,a8=count_states(section(body,8),PROT)
        s3=section(body,3); ing={k:(re.search(rf"{k}\s+(\d+)",s3).group(1) if re.search(rf"{k}\s+(\d+)",s3) else None) for k in ("lignes d'ingrédient","① référence vérifiée","② estimation de groupe","③ en attente de validation","④ ingrédient non mesurable")}
        s7=section(body,7); alg=re.search(r"allergies déclarées\s+(\d+)(?:\s*:\s*([^\n(]+))?", s7)
        s9=section(body,9); prose=re.search(r"nombre changé, PROSE PÉRIMÉE\s+(\d+)", s9); apres=re.search(r"PROSE PÉRIMÉE après finalisation\s+(\d+)", s9)
        bouches.append({"bouche":nom,"c4":c4.groups() if c4 else None,"c1":c1,"c2":c2,"c5":c5,"c6":c6,"c8":c8,"ingredients":ing,
                        "allergies":(alg.group(1),(alg.group(2) or "").strip()) if alg else None,"prose_perimee":(prose.group(1) if prose else None, apres.group(1) if apres else None),
                        "anomalies":a1+[("grammage",x[1]) for x in a2]+[("journée",x[1]) for x in a5]+[("densité",x[1]) for x in a6]+[("protéines",x[1]) for x in a8]})
    noms=re.findall(r"^(\S+)\s+calorique \d+/\d+ · complète", txt[txt.find("BILAN DU FOYER"):], re.M)
    for i,bo in enumerate(bouches):
        if i < len(noms): bo["bouche"]=noms[i]
    bilan=re.search(r"TOTAL\s+conformité CALORIQUE (\d+)/(\d+) · conformité COMPLÈTE (\d+)/(\d+) · contrôles INCOMPLETS (\d+)", txt)
    cout=re.search(r"transmissions fournisseur : (\d+)\n\s*réparations : (\d+) / (\d+) \(demandées : (\d+)\)", txt)
    porte=re.search(r"PORTE FINALE.*?livraison : (\S+).*?non évalués : (\[[^\]]*\]).*?incomplets\s*: (\[[^\]]*\]).*?causes\s*: (\[[^\]]*\])", txt, re.S)
    out.append({"tir":n,"titre":g.get("titre"),"request_id":g.get("request_id"),"bouches_n":len(dem.get("bouches") or []),
        "cases_attendues":dem.get("cases_attendues_total"),"completees":dem.get("cases_par_bouche_completees_depuis_roster") or [],
        "http":src.get("statut"),"duree_ms":src.get("duree_ms"),"appels_registre":ea.get("appels_registre"),"appels_total":ea.get("appels_registre_total"),
        "reparations_archivees":len(((src.get("etapes") or {}).get("reparations") or [])),
        # ⚠️ RÉPARATION DU PLAN ≠ AUXILIAIRE. `final_repair` est l'appel qui recompose ;
        # `composition_fill` / `final_repair_fill` sont des appels de 2 s qui remplissent
        # une référence — ils comptent dans le coût, jamais dans « rattrapage ».
        "reparations_plan":sum(v for k,v in (ea.get("appels_registre") or {}).items() if k.endswith("final_repair:success")),
        "appels_succes":sum(v for k,v in (ea.get("appels_registre") or {}).items() if k.endswith(":success")),
        "auxiliaires":sum(v for k,v in (ea.get("appels_registre") or {}).items() if k.endswith(":success") and ("fill" in k)),
        "etat_run":val.get("state"),"defauts_run":[x.get("cause") for x in (val.get("defects") or [])],"defauts_detail":[{k:x.get(k) for k in ("cause","day","slot","member_id","detail")} for x in (val.get("defects") or [])],
        "incomplets_run":val.get("incomplete"),"non_executes_run":val.get("not_run"),
        "issues_run":[x for x in (gf.get("issues") or []) if str(x).startswith("plan_repair")],
        "politique_sans_appel":any(o.get("tag")=="keel.household_meal.plan_repair_pass" and o.get("reason")=="no_blocking_defect" for o in (src.get("journal") or [])),
        "refus_422":(src.get("reponse") or {}).get("detail") if src.get("statut")==422 else None,
        "bilan":dict(zip(["cal_ok","cal_n","compl_ok","compl_n","incomplets"],bilan.groups())) if bilan else None,
        "cout":dict(zip(["transmissions","reparations","max","demandees"],cout.groups())) if cout else None,
        "porte_journal":dict(zip(["livraison","non_evalues","incomplets","causes"],porte.groups())) if porte else None,
        "bouches":bouches})
json.dump(out,open("scratchpad/2026-09-15-BETA-PREUVES/mesures-campagne-30.json","w"),ensure_ascii=False,indent=2)
print("tir | bouches | attendues | HTTP | durée s | appels | répar. | état RUN | défauts RUN | cal | complète | incompl.")
for t in out:
    b=t["bilan"] or {}
    print(f"{t['tir']:>12} | {t['bouches_n']:>7} | {t['cases_attendues']:>9} | {t['http']:>4} | {(t['duree_ms'] or 0)/1000:>7.1f} | {t.get('appels_succes') or 0:>6} | {t.get('reparations_plan') or 0:>6} | {str(t['etat_run'] or 'refusé'):<22} | {','.join(t['defauts_run']) or '-':<20} | {b.get('cal_ok')}/{b.get('cal_n')} | {b.get('compl_ok')}/{b.get('compl_n')} | {b.get('incomplets')}")
print("\n── anomalies nommées ──")
for t in out:
    for d in t["defauts_detail"]: print(f"  tir {t['tir']} · garde du RUN · {d}")
    for bo in t["bouches"]:
        for kind,line in bo["anomalies"]: print(f"  tir {t['tir']} · {bo['bouche']} · {kind} · {line[:120]}")
print("\n── contrôles 3 · 7 · 9 par bouche ──")
for t in out:
    for bo in t["bouches"]:
        print(f"  tir {t['tir']} · {bo['bouche']:<8} c4={bo['c4']} ingr={bo['ingredients']} allergies={bo['allergies']} prose_périmée={bo['prose_perimee']} c8={bo['c8']} c2={bo['c2']} c5={bo['c5']} c6={bo['c6']}")
