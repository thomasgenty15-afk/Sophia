#!/usr/bin/env python3
"""Le bilan des 30, rendu depuis `mesures-campagne-30.json` (sortie de
`resumer-campagne.py`). Aucun chiffre n'est calculé ici hors des sommes et des
seuils de la passation ; tout vient de l'instrument et de `generated_from`."""
import json, sys, statistics, collections
J=json.load(open("scratchpad/2026-09-15-BETA-PREUVES/mesures-campagne-30.json"))
tirs=sorted(J,key=lambda t:int(t["tir"].split("-")[1]))
N=len(tirs)
def num(t): return int(t["tir"].split("-")[1])
def prof(t): return int(t["tir"].split("-p")[1])
# ── bilan de livraison ────────────────────────────────────────────────────
livres=[t for t in tirs if t["http"]==200]
sans_rattrapage=[t for t in livres if (t["reparations_archivees"] or 0)==0]
conformes=[t for t in livres if t["etat_run"]=="conforme"]
avec_ecarts=[t for t in livres if t["etat_run"]=="livrable_avec_ecarts"]
durees=sorted((t["duree_ms"] or 0)/1000 for t in livres)
def pct(xs,p):
    if not xs: return None
    k=max(0,min(len(xs)-1,int(round(p*(len(xs)-1))))); return xs[k]
appels=sum(t["appels_total"]//2 if t["appels_total"] else 0 for t in tirs)  # registre : attempt_start + success
sautes=sum(1 for t in tirs if any(str(i).startswith("plan_repair_skipped:no_blocking_defect") for i in t.get("issues_run",[])))
# ── par profil ────────────────────────────────────────────────────────────
par_profil=collections.defaultdict(list)
for t in tirs: par_profil[prof(t)].append(t)
# ── dénominateurs et contrôles ────────────────────────────────────────────
tot=collections.Counter()
anos=[]
for t in tirs:
    b=t.get("bilan") or {}
    tot["cases_attendues"]+=t.get("cases_attendues") or 0
    tot["cal_ok"]+=int(b.get("cal_ok") or 0); tot["cal_n"]+=int(b.get("cal_n") or 0)
    tot["compl_ok"]+=int(b.get("compl_ok") or 0); tot["compl_n"]+=int(b.get("compl_n") or 0)
    tot["incomplets"]+=int(b.get("incomplets") or 0)
    for bo in t["bouches"]:
        c4=bo.get("c4") or ("0","0","0"); tot["plats"]+=int(c4[1]); tot["manquantes"]+=int(c4[2])
        for k in ("c1","c2","c5","c6","c8"):
            for st,v in (bo.get(k) or {}).items(): tot[f"{k}_{st}"]+=v
        ing=bo.get("ingredients") or {}
        for k,label in (("lignes d'ingrédient","ing_lignes"),("① référence vérifiée","ing_verif"),("② estimation de groupe","ing_estim"),("③ en attente de validation","ing_attente"),("④ ingrédient non mesurable","ing_nm")):
            tot[label]+=int(ing.get(k) or 0)
        pp=bo.get("prose_perimee") or (None,None); tot["prose_perimee"]+=int(pp[0] or 0)
        al=bo.get("allergies"); 
        if al and int(al[0])>0: tot["allergies_declarees"]+=1
        for kind,line in bo.get("anomalies",[]): anos.append((num(t),bo["bouche"],kind,line[:110]))
    for d in t.get("defauts_detail",[]): anos.append((num(t),"garde du RUN",d.get("cause"),f"{d.get('member_id')} · {d.get('day')} · {d.get('slot')}"))
# ── seuils de la passation § 3.3 ──────────────────────────────────────────
seuils=[
 ("plans livrés (HTTP 200)", len(livres), N, None),
 ("sans rattrapage modèle", len(sans_rattrapage), N, 24),
 ("utilisables = conformes (D3 : un écart nommé ne compte pas)", len(conformes), N, 27),
 ("p95 de disponibilité ≤ 180 s (D1)", pct(durees,0.95), None, 180),
 ("aucun 546 / 502 inexpliqué", sum(1 for t in tirs if t["http"] in (546,502)), 0, 0),
]
print(f"# Bilan de la campagne des {N} tirs — 2026-09-15\n")
print("## 1. Bilan de livraison, par requête\n")
print("| n | profil | bouches | HTTP | durée | appels | répar. | état du run | défauts | politique |")
print("|---:|---:|---:|---:|---:|---:|---:|---|---|---|")
for t in tirs:
    pol="sans appel (écart compté)" if any(str(i).startswith("plan_repair_skipped") for i in t.get("issues_run",[])) else ("réparé" if (t["reparations_archivees"] or 0)>0 else "—")
    print(f"| {num(t)} | {prof(t)} | {t['bouches_n']} | {t['http']} | {(t['duree_ms'] or 0)/1000:.1f} s | {t['appels_total']//2 if t['appels_total'] else '-'} | {t['reparations_archivees']} | {t['etat_run']} | {', '.join(t['defauts_run']) or '—'} | {pol} |")
print(f"\n| | résultat |\n|---|---|")
print(f"| tirs | {N} |")
print(f"| plans écrits | {len(livres)} / {N} |")
print(f"| sans rattrapage modèle | {len(sans_rattrapage)} / {N} |")
print(f"| conformes | {len(conformes)} / {N} ; livrables avec écart nommé : {len(avec_ecarts)} |")
print(f"| plans partis avec un écart compté SANS appel (nouvelle politique) | {sautes} |")
print(f"| appels modèle | {appels} pour {N} tirs |")
if durees: print(f"| durées | min {durees[0]:.1f} s · médiane {statistics.median(durees):.1f} s · p95 {pct(durees,0.95):.1f} s · max {durees[-1]:.1f} s ; sous 150 s : {sum(1 for d in durees if d<=150)} / {len(durees)} ; sous 180 s : {sum(1 for d in durees if d<=180)} / {len(durees)} |")
print("\n### Par profil (au moins 4 sur 5 utilisables demandés)\n")
print("| profil | tirs | conformes | avec écart | sans rattrapage | durées |")
print("|---:|---:|---:|---:|---:|---|")
for p,ts in sorted(par_profil.items()):
    ds=[(t['duree_ms'] or 0)/1000 for t in ts]
    print(f"| {p} | {len(ts)} | {sum(1 for t in ts if t['etat_run']=='conforme')} | {sum(1 for t in ts if t['etat_run']=='livrable_avec_ecarts')} | {sum(1 for t in ts if (t['reparations_archivees'] or 0)==0)} | {' · '.join(f'{d:.0f}' for d in ds)} s |")
print("\n## 2. Les cinq dénominateurs\n")
print("```text")
print(f"cases attendues      {tot['cases_attendues']}    par personne, absences déduites")
print(f"plats présents       {tot['plats']}    manquantes : {tot['manquantes']}")
print(f"portions calculées   {tot['compl_n']}")
print(f"portions mesurables  {tot['cal_n']}    non mesurables : {tot['c1_nm']}")
print(f"portions conformes   {tot['cal_ok']} / {tot['cal_n']} (±10 %) · complètes {tot['compl_ok']} / {tot['compl_n']}")
print("```\n")
print("## 3. Les dix contrôles, sommés\n")
print("| # | contrôle | conforme | non conforme | non mesurable |")
print("|---|---|---:|---:|---:|")
for k,label in (("c1","calories du créneau ±10 %"),("c2","grammage dans les bornes"),("c5","journée couverte ±5 %"),("c6","densité dans le couloir transmis"),("c8","plancher protéique couvert")):
    print(f"| {k[1]} | {label} | {tot[k+'_ok']} | {tot[k+'_ko']} | {tot[k+'_nm']} |")
print(f"| 3 | ingrédients | {tot['ing_verif']} vérifiés / {tot['ing_lignes']} lignes | estimation {tot['ing_estim']} · attente {tot['ing_attente']} | non mesurables {tot['ing_nm']} |")
print(f"| 7 | allergies déclarées | {tot['allergies_declarees']} bouche(s) avec matière | causes d'exclusion dans la garde : {sum(1 for t in tirs for c in t['defauts_run'] if 'exclusion' in c or 'forbidden' in c or 'house_rule' in c)} | — |")
print(f"| 9 | prose de recette périmée | {tot['prose_perimee']} / {tot['ing_lignes']} | | |")
print("\n## 4. Anomalies nommées\n")
for n_,b,k,l in anos: print(f"- tir {n_} · {b} · {k} · {l}")
if not anos: print("- aucune")
print("\n## 5. Les seuils de la passation (§ 3.3)\n")
print("| critère | mesuré | seuil | verdict |")
print("|---|---:|---:|---|")
for label,mes,den,seuil in seuils:
    if seuil is None: v="—"
    elif label.startswith("p95"): v="✅" if (mes is not None and mes<=seuil) else "⛔"
    elif label.startswith("aucun"): v="✅" if mes==0 else "⛔"
    else: v="✅" if mes>=seuil else "⛔"
    m=f"{mes:.1f} s" if isinstance(mes,float) else (f"{mes} / {den}" if den else str(mes))
    s=(f"{seuil} s" if label.startswith('p95') else (f"{seuil} / {N}" if den else str(seuil))) if seuil is not None else "—"
    print(f"| {label} | {m} | {s} | {v} |")
