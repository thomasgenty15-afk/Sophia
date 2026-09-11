#!/usr/bin/env python3
"""Un tir : les rattrapages n'ont-ils touché QUE ce qu'ils devaient, et chaque bouche atteint-elle sa cible ?

Base = la réponse de composition archivée (llm_raw_response_events, même request_id).
Final = plan-<cas>-*.json. Autorisé = lignes density_repair_ask (frais/casseroles réécrivables
lues dans la consigne archivée) et dedicated_repair_append (plats ajoutés au nom d'un porteur).
"""
import json, glob, re, subprocess, sys
cas = sys.argv[1]
log = sorted(glob.glob(f"log-{cas}-*.txt"))[-1]; plan = sorted(glob.glob(f"plan-{cas}-*.json"))[-1]
rows = [json.loads(l) for l in open(log, encoding="utf-8") if l.strip().startswith("{")]
rq = next(r["request_id"] for r in rows if r.get("request_id"))
def sql(q):
    return subprocess.run(["docker","exec","supabase_db_Sophia_2","psql","-U","postgres","-At","-c",q],capture_output=True,text=True).stdout
# ⚠️ LA BASE EST LE DERNIER PLAN ENTIER AVANT LES RATTRAPAGES. Une relance de
# ceinture (exclusion, ancre protéique, échange) remplace le plan AVANT la
# réparation de densité : comparer au tout premier jet ferait lire « tout a
# bougé » (tir T4 : 8 plats → 6 par exclusion_retry). Ces relances-là ne sont
# pas des rattrapages de densité ; elles sont hors de cette vérification.
raw = sql(f"select output_text from llm_raw_response_events where request_id='{rq}' and outcome='text' and source not in ('generate-household-meal-v1.density_repair','generate-household-meal-v1.dedicated_repair','generate-household-meal-v1.composition_fill') order by created_at desc limit 1;")
base_src = sql(f"select replace(source,'generate-household-meal-v1','composition') from llm_raw_response_events where request_id='{rq}' and outcome='text' and source not in ('generate-household-meal-v1.density_repair','generate-household-meal-v1.dedicated_repair','generate-household-meal-v1.composition_fill') order by created_at desc limit 1;").strip()
m = re.search(r"\{.*\}", raw, re.S); base = json.loads(m.group(0)) if m else {}
final = json.load(open(plan, encoding="utf-8"))
ask_txt = sql(f"select user_message from llm_raw_response_events where request_id='{rq}' and source='generate-household-meal-v1.density_repair' and outcome='pending' order by created_at limit 1;").replace("\\n","\n")
rework = set(re.findall(r'Preparation (\S+) "[^"]*", REWORKABLE', ask_txt))
frozen = set(re.findall(r'Preparation (\S+) "[^"]*", FROZEN', ask_txt))
asked_dishes = [d for d in re.findall(r'^- "([^"]+)" serves', ask_txt, re.M)]
# ⚠️ depuis la ligne de journal `density_repair_ask`, pas par regex sur la consigne : c'est ce que le moteur a DÉCIDÉ.
fresh_rework = {str(r.get("dish")) for r in rows if r.get("tag","").endswith("density_repair_ask") and r.get("fresh_reworkable") is True}
added = [(x.get("cell"), x.get("memberId")) for r in rows if r.get("tag","").endswith("dedicated_repair_append") for x in []]  # renseigné plus bas
ps = next(r for r in rows if r.get("tag")=="keel.household_meal.portion_sizing")
ded = ps.get("dedicated_repair") or {}; rep = ps.get("repairs") or {}
# ⚠️ la base (réponse du modèle) dit `for_member_id`, le final (plan servi) dit `member_id`.
def key(d): return (str(d.get("day")), str(d.get("slot")), d.get("for_member_id") or d.get("member_id") or None)
# ⚠️ TERMES seulement : le moteur MULTIPLIE les quantités (frais × Σ facteurs), c'est voulu.
def ings(x): return sorted(str(i.get("term")) for i in (x.get("ingredients") or []))
bd = {key(d): d for d in base.get("dishes",[])}; fd = {key(d): d for d in final.get("dishes",[])}
bp = {p["id"]: p for p in base.get("preparations",[])}; fp = {p["id"]: p for p in final.get("preparations",[])}
print(f"══ {cas} · request {rq[:8]} · base = {base_src or 'composition'} ══")
print(f"  consigne : plats demandés {asked_dishes} · frais réécrivable {sorted(fresh_rework)} · casseroles REWORKABLE {sorted(rework)} · FROZEN {sorted(frozen)}")
print(f"  compteurs : rép {rep.get('asked')}/{rep.get('accepted')} skipped_stuck={rep.get('skipped_stuck')} splice={json.dumps(rep.get('splice'))} · dernier recours {ded.get('asked')}/{ded.get('accepted')} missed_aim={ded.get('missed_aim')}")
# ① casseroles : gelées intactes, réécrivables changées seulement si acceptées
ok = True
for pid, p in bp.items():
    f = fp.get(pid)
    if f is None: print(f"  ⛔ casserole {pid} DISPARUE du final"); ok=False; continue
    same = ings(p) == ings(f)
    if pid in frozen and not same: print(f"  ⛔ casserole GELÉE {pid} modifiée"); ok=False
    elif pid in rework and same: print(f"  · casserole réécrivable {pid} inchangée (réparation refusée ou non nécessaire)")
    elif pid in rework: print(f"  ✓ casserole réécrivable {pid} modifiée")
    elif not same: print(f"  ⛔ casserole NON DEMANDÉE {pid} modifiée"); ok=False
for pid in fp:
    if pid not in bp: print(f"  ⛔ casserole NOUVELLE {pid} (aucune relance ne peut en ajouter)"); ok=False
# ② plats : non demandés intacts ; demandés = frais changé seulement si réécrivable ; ajoutés = porteurs nommés seulement
for k, d in bd.items():
    f = fd.get(k)
    if f is None: print(f"  ⛔ plat {k} DISPARU du final"); ok=False; continue
    same = ings(d) == ings(f) and [u.get("preparation_id") for u in d.get("uses",[])] == [u.get("preparation_id") for u in f.get("uses",[])]
    title = str(d.get("title")); demanded = title in asked_dishes
    if not demanded and not same: print(f"  ⛔ plat NON DEMANDÉ modifié : {k} « {title[:40]} »"); ok=False
    elif demanded and not same and title not in fresh_rework: print(f"  ⛔ plat demandé au frais GELÉ modifié : « {title[:40]} »"); ok=False
    elif demanded and not same: print(f"  ✓ plat demandé, frais réécrivable modifié : « {title[:40]} »")
added_keys = [k for k in fd if k not in bd]
for k in added_keys:
    d = fd[k]
    if (d.get("for_member_id") or d.get("member_id")) is None: print(f"  ⛔ plat AJOUTÉ sans porteur : {k}"); ok=False
    elif (d.get("uses") or []): print(f"  ⛔ plat ajouté cite une casserole : {k}"); ok=False
    else: print(f"  ✓ plat ajouté au nom de {str(d.get('for_member_id') or d.get('member_id'))[:8]} : {k[0]}/{k[1]} « {str(d.get('title'))[:40]} »")
# ③ cibles caloriques : par bouche-jour, servi vs cible (rows du journal, facteur brut = cible)
dk = ps.get("day_kcal") or {}; v = ps.get("verdicts") or {}; tot = sum(v.values()) or 1
print(f"  cibles : {dk.get('within_5pct')}/{dk.get('rows')} bouches-jours à ±5 % · assiettes dans les bornes {v.get('in_bounds')}/{tot} · immesurables {v.get('unmeasurable',0)}")
print("  ⇒", "RATTRAPAGES PROPRES" if ok else "⛔ UN RATTRAPAGE A TOUCHÉ AUTRE CHOSE")
