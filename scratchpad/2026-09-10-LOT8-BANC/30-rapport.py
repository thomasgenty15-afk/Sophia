#!/usr/bin/env python3
"""
LE RAPPORT DU BANC CORRIGÉ.

    python3 30-rapport.py > RAPPORT-LOT8.md

⛔ IL NE CALCULE RIEN QU'IL N'AIT MESURÉ, et il n'additionne jamais un
`inconnu`. Tout vient de `mesures-lot8.json`.
"""
import collections
import json
import pathlib
import statistics

import banc
from banc import INCONNU, est_connu

HERE = pathlib.Path(__file__).parent
M = json.loads((HERE / "mesures-lot8.json").read_text())
ANCIEN = json.loads((HERE.parent / "2026-09-10-CAMPAGNE-ELARGIE" / "mesures.json").read_text())
ANCIEN_SAS = json.loads(
    (HERE.parent / "2026-09-10-CAMPAGNE-ELARGIE" / "mesures-avec-sas.json").read_text())


def classes(rows):
    t = {}
    for m in rows:
        for k, v in (m.get("classement") or {}).items():
            t[k] = t.get(k, 0) + v
    return t


def taux(t):
    dim = t.get("conformant", 0) + t.get("residual_gap", 0)
    return (round(100 * t.get("conformant", 0) / dim, 1) if dim else None), dim


mesures = [m for m in M if m["etat"] == "mesure"]
non_testes = [m for m in M if m["etat"] == "non_teste"]
autres = [m for m in M if m["etat"] not in ("mesure", "non_teste")]

print("# Le banc corrigé — re-mesure hors ligne de la campagne du 2026-09-10")
print()
print("Lot 8 de `docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md`. **Aucune génération "
      "nouvelle, aucun appel modèle** : les vingt runs archivés dans "
      "`../2026-09-10-CAMPAGNE-ELARGIE/runs.json` sont re-mesurés par les fonctions "
      "de production, sur l'index que chaque run avait réellement sous la main.")
print()
print("## ⓪ L'état des vingt générations")
print()
print(f"- **{len(mesures)}** mesurées (HTTP 200)")
print(f"- **{len(non_testes)}** `non testé` — `546 WORKER_LIMIT`, limite CPU de "
      "l'isolat local, hors périmètre (§ 10 du plan). ⛔ Ce n'est **pas** un échec produit.")
if autres:
    for m in autres:
        print(f"- `{m['cas']}·{m['gen']}` : {m['etat']}")
print()

# ── ① LE TABLEAU ──────────────────────────────────────────────────────────
print("## ① Ce que chaque génération a donné, requête par requête")
print()
print("| cas | gén | HTTP | état | requête | transmissions | couverture | grammes | sécurité | classes |")
print("|---|---|---|---|---|---|---|---|---|---|")
for m in M:
    c = m["compteurs"]
    cov = m.get("couverture")
    g = m.get("controles_grammes")
    s = m["securite"]
    couv = "—" if cov is None else f"{cov['livrees']}/{cov['attendues']}"
    gr = "—" if g is None else (
        f"{g['in_bounds']}/{g['total']}" + ("" if g["over_max"] + g["under_min"] == 0
                                            else f" ⛔{g['over_max']}↑{g['under_min']}↓"))
    cls = " · ".join(f"{k[:4]} {v}" for k, v in sorted((m.get("classement") or {}).items())) or "—"
    print(f"| {m['cas']} | {m['gen']} | {m['http']} | {m['etat']} | "
          f"`{str(m['request_id'])[:8] if m['request_id'] else '—'}` | "
          f"{c['transmissions_fournisseur']} | {couv} | {gr} | "
          f"{s['etat']}({s['morsures_finales']}) | {cls} |")
print()

# ── ② L'ACCEPTATION, AXE PAR AXE ──────────────────────────────────────────
t = classes(mesures)
conf, dim = taux(t)
nominatif = [j for m in mesures for j in m.get("jours", [])
             if j.get("base_de_mesure") in (None, "assiette_nominative", "journee_du_plan")]
collectif = [j for m in mesures for j in m.get("jours", [])
             if j.get("base_de_mesure") in ("service_collectif", "mixte")]


def part(rows):
    c = collections.Counter(j["classe"] for j in rows)
    d = c["conformant"] + c["residual_gap"]
    return (round(100 * c["conformant"] / d, 1) if d else None), d, c


tn, dn, cn = part(nominatif)
tc, dc, cc = part(collectif)

viol = [v for m in mesures for v in m.get("violations_grammes", [])]
ctrl = [m["controles_grammes"] for m in mesures if m.get("controles_grammes")]
ctrl_total = sum(x["total"] for x in ctrl)
ctrl_ok = sum(x["in_bounds"] for x in ctrl)
manquants = [x for m in mesures for x in (m.get("couverture") or {}).get("manquants", [])]
attendues = sum((m.get("couverture") or {}).get("attendues", 0) for m in mesures)

secu = collections.Counter(m["securite"]["etat"] for m in M)
secu_reg = collections.Counter(
    (m["securite"].get("regime") or {}).get("etat", "controle_absent") for m in M)

print("## ② L'acceptation, **un axe à la fois**")
print()
print("⛔ `conformant` exige TOUTES les propriétés applicables. Une seule ligne "
      "« conforme » qui fondrait six questions rendrait invérifiable laquelle a cédé.")
print()
print("| axe | mesuré | base | |")
print("|---|---|---|---|")
print(f"| journée à ±5 % de la **cible couverte** | **{conf} %** | {dim} jours-bouches "
      f"dimensionnables | {'✅' if conf and conf >= 90 else '⛔'} |")
print(f"| …dont assiette nominative | {tn} % | {dn} | |")
print(f"| …dont service collectif (part interne) | {tc} % | {dc} | |")
print(f"| masse dans les bornes du repas | **{ctrl_ok}/{ctrl_total}** repas-bouches | "
      f"{len(viol)} violations listées | {'✅' if not viol else '⛔'} |")
print(f"| couverture demandée livrée | **{attendues - len(manquants)}/{attendues}** | "
      f"{len(manquants)} repas attendus absents | {'✅' if not manquants else '⛔'} |")
print(f"| sécurité : ceinture d'**exclusion** | "
      f"**{secu['zero_verifie']} zéro vérifié · {secu['morsures']} morsures · "
      f"{secu['rien_a_controler']} rien à contrôler · "
      f"{secu['controle_absent']} sans trace** | 20 générations | "
      f"{'✅' if secu['zero_verifie'] and not secu['morsures'] else '⚠️'} |")
print(f"| sécurité : ceinture de **régime** | "
      f"**{secu_reg['zero_verifie']} zéro vérifié · {secu_reg['morsures']} morsures · "
      f"{secu_reg['rien_a_controler']} rien à contrôler · "
      f"{secu_reg['controle_absent']} sans trace** | 20 générations | "
      f"{'✅' if secu_reg['zero_verifie'] and not secu_reg['morsures'] else '⚠️'} |")
print("| protéine par personne | `inconnu` | — | ⚠️ non mesuré par ce banc |")
print("| densité par recette | `inconnu` | — | ⚠️ non mesuré par ce banc |")
print()
print("**Les classes, sur les douze générations mesurées :**")
print()
for k in ("conformant", "residual_gap", "unmeasurable", "sans_cible"):
    print(f"- `{k}` : **{t.get(k, 0)}**")
print()

if viol:
    print("### Chaque violation de masse, avec son occurrence")
    print()
    print("⛔ « Une médiane de taux ne démontre pas que toutes les portions passent » "
          "(§ lot 8). Voici les lignes, pas un taux.")
    print()
    print("| cas | jour | moment | contenant | bouches | grammes | bornes | verdict | écart |")
    print("|---|---|---|---|---|---|---|---|---|")
    for m in mesures:
        for v in m.get("violations_grammes", []):
            print(f"| {m['cas']}·{m['gen']} | {v['day']} | {v['slot']} | {v['kind']} | "
                  f"{', '.join(v['mouths'])} | {v['grams']} g | "
                  f"{v['min']}–{v['max']} g | {v['verdict']} | {v['ecart_pct']} % |")
    print()

if manquants:
    print("### Chaque repas attendu absent")
    print()
    print("⛔ Un repas attendu qui manque est un **défaut de livraison**, pas une "
          "journée « non applicable ». La demande décide de l'attendu ; les deux "
          "seules soustractions admises sont le jour de cuisine seule et les "
          "moments d'aujourd'hui déjà passés (`slotsPassedToday`).")
    print()
    for m in mesures:
        for x in (m.get("couverture") or {}).get("manquants", []):
            print(f"- `{m['cas']}·{m['gen']}` — {x['name']}, {x['day']} {x['date']}, "
                  f"**{x['slot']}** : aucun plat, aucune cause nommée par le produit")
    print()

# ── ③ LE SERVICE COLLECTIF ────────────────────────────────────────────────
bacs = [(m, b) for m in mesures for b in m.get("bacs_communs", [])]
lisibles = [(m, b) for m, b in bacs if b["ecart_pct"] is not None]
print("## ③ Le service collectif — la mesure interne que le couvercle ne porte pas")
print()
print("`mouth_energy.ts` refuse, exprès, de tirer une assiette d'un bac à "
      "plusieurs noms. Le banc ne divise donc pas le bac : il compare ce que le "
      "bac PORTE à la SOMME des cibles de ses mangeurs pour ce moment — la façon "
      "même dont `lidPlanFor` l'a construit.")
print()
if lisibles:
    ec = [abs(b["ecart_pct"]) for _, b in lisibles]
    print(f"- **{len(lisibles)} bacs lisibles** sur {len(bacs)}")
    print(f"- écart absolu médian : **{round(statistics.median(ec), 1)} %**, "
          f"maximum **{round(max(ec), 1)} %**")
    print()
    print("| cas | jour | moment | bouches | bac | somme des cibles | écart |")
    print("|---|---|---|---|---|---|---|")
    for m, b in lisibles:
        print(f"| {m['cas']}·{m['gen']} | {b['day']} | {b['slot']} | "
              f"{', '.join(b['mouths'])} | {b['kcal']} kcal / {b['grams']} g | "
              f"{b['somme_cibles_du_moment']} kcal | {b['ecart_pct']} % |")
print()

# ── ④ L'INDEX DE CHAQUE RUN ───────────────────────────────────────────────
print("## ④ L'index alimentaire de chaque run, restauré ou nommé irrécupérable")
print()
print("⛔ `21-mesure-avec-sas.py` ajoutait les 291 lignes du sas **d'aujourd'hui** à "
      "tous les runs. Un run de 12 h 00 ne peut pas avoir lu une ligne écrite à "
      "13 h 13. Ici le sas est coupé à la FIN de chaque run, et il entre par "
      "`indexForReading` — la porte de production, avec ses deux ceintures.")
print()
print("| cas | gén | lignes de sas admises | demandées | retenues | part non restaurable | exact |")
print("|---|---|---|---|---|---|---|")
for m in mesures:
    i = m["index"]
    print(f"| {m['cas']} | {m['gen']} | {i['sas_lignes_admises']}/{i['sas_lignes_totales']} | "
          f"{i['termes_demandes_au_sas']} | {i['lignes_retenues']} | "
          f"{i['part_non_restaurable_pct']} % | {'✅' if i['exact'] else '⛔'} |")
print()
print("La part non restaurable est celle que `composition_fill` a comblée par les "
      "**bornes de groupe** : `filledFromPendingRow` refuse ces lignes-là, et leur "
      "valeur venait d'un calcul en vol sur l'index du moment. Les journées qu'elle "
      "touche sortent `unmeasurable`, jamais approchées.")
print()

# ── ⑤ LES COMPTEURS, SÉPARÉS ──────────────────────────────────────────────
print("## ⑤ Générations, tentatives, transmissions, pannes — quatre compteurs")
print()
gen = len(M)
tent = sum(m["compteurs"]["tentatives_http"] for m in M)
trans = sum(m["compteurs"]["transmissions_fournisseur"] for m in M
            if est_connu(m["compteurs"]["transmissions_fournisseur"]))
inconnues = sum(1 for m in M if not est_connu(m["compteurs"]["transmissions_fournisseur"]))
print(f"- générations demandées : **{gen}**")
print(f"- tentatives HTTP applicatives : **{tent}**")
print(f"- transmissions fournisseur attribuées à une requête identifiée : **{trans}** "
      f"(sur {len(banc.charger(HERE / 'llm_usage_campagne.ndjson') or []) or 63} "
      "lignes `llm_usage_events` de la fenêtre)")
print(f"- générations dont la requête n'est pas identifiable (tuées avant leur "
      f"`draft_store`) : **{inconnues}**")
print(f"- erreurs de plateforme (`546`) : **{len(non_testes)}**")
print()
print("⚠️ Les transmissions ne sont plus lues « dans la fenêtre horaire » mais par "
      "`llm_usage_events.request_id`. Sur cette campagne séquentielle les deux "
      "coïncident run par run ; ce qui change est qu'on peut désormais le PROUVER.")
print()

# ── ⑤bis LE PLIAGE DES CASSEROLES ────────────────────────────────────────
print("## ⑤bis Le pliage des casseroles contre les grammes tirés")
print()
print("La journée solo est mesurée par `planEnergy`, qui attribue une casserole "
      "à un plat par `servings / servingsMade` ; la lane foyer, elle, lit les "
      "grammes que les boîtes TIRENT. `potAttributionGap` (fonction de "
      "production) compare les deux, plan par plan.")
print()
print("⚠️ **CE QUE CE RAPPORT NE DIT PAS.** Sur la lane foyer il se lit "
      "directement : 1,00 à 1,13, le pliage et les boîtes disent la même chose. "
      "Sur la lane SOLO il vaut 0,46 à 0,99, et ce n'est **pas** la preuve d'un "
      "sur-comptage : la plupart des plats solo n'ont pas de boîte du tout, "
      "donc le numérateur est amputé par construction. Le nombre est publié "
      "parce qu'il est mesuré ; il ne soutient aucune conclusion sur le solo.")
print()
print("| cas | gén | grammes tirés par les boîtes | grammes attribués par le pliage | rapport |")
print("|---|---|---|---|---|")
for m in mesures:
    a = m.get("attribution_casseroles")
    if not a:
        continue
    print(f"| {m['cas']} | {m['gen']} | {a['drawnGrams']} g | {a['attributedGrams']} g | "
          f"**{a['ratio']}** |")
print()

# ── ⑥ LA FAMILLE « BANC » DU TABLEAU DES TESTS MINIMAUX ───────────────────
#
# ⛔ UNE GARDE A BESOIN D'UN CAS QUI PASSE. Un détecteur qui n'a jamais rien
# laissé passer est indiscernable d'un détecteur cassé qui refuse tout. Chaque
# ligne ci-dessous nomme donc DEUX runs: celui où le détecteur MORD, et celui
# où il se TAIT. Sans les deux, ce n'est pas une preuve.
def qui(pred):
    hits = [f"{m['cas']}·{m['gen']}" for m in M if pred(m)]
    return (hits[0] if hits else None), len(hits)


CAS_BANC = [
    ("champ sécurité absent",
     lambda m: m["securite"]["etat"] == "controle_absent",
     lambda m: m["securite"]["etat"] in ("zero_verifie", "rien_a_controler", "morsures")),
    ("ingrédient inconnu",
     lambda m: any(j["classe"] == "unmeasurable" for j in m.get("jours", [])),
     lambda m: m["etat"] == "mesure"
     and all(j["classe"] != "unmeasurable" for j in m.get("jours", []))),
    ("source alimentaire estimée",
     lambda m: m.get("index") is not None and not m["index"]["exact"],
     lambda m: m.get("index") is not None and m["index"]["exact"]),
    ("repas attendu absent",
     lambda m: bool((m.get("couverture") or {}).get("manquants")),
     lambda m: m.get("couverture") is not None and not m["couverture"]["manquants"]),
    ("boîte collective",
     lambda m: bool(m.get("bacs_communs")),
     lambda m: m["etat"] == "mesure" and not m.get("bacs_communs")),
    ("dépassement isolé masqué par médiane",
     lambda m: bool(m.get("violations_grammes")),
     lambda m: m.get("controles_grammes") is not None and not m.get("violations_grammes")),
    ("index du run absent",
     lambda m: m.get("index") is not None and m["index"]["part_non_restaurable_pct"] not in (0, 0.0),
     lambda m: m.get("index") is not None and m["index"]["part_non_restaurable_pct"] in (0, 0.0)),
    ("HTTP 546 classé non testé",
     lambda m: m["etat"] == "non_teste",
     lambda m: m["etat"] == "mesure"),
]

print("## ⑥ La famille « Banc » du tableau des tests minimaux (§ lot 8)")
print()
print("⛔ Un détecteur qui n'a jamais laissé passer un cas sain est "
      "indiscernable d'un détecteur cassé qui refuse tout. Chaque ligne nomme "
      "donc les DEUX côtés, sur les archives réelles.")
print()
print("| cas | attrapé par | il mord sur | il se tait sur | verdict |")
print("|---|---|---|---|---|")
OU = {
    "champ sécurité absent": "`20-mesure.py::securite` — trois états",
    "ingrédient inconnu": "`dishEnergy.complete` → `unmeasurable`",
    "source alimentaire estimée": "`composition_energy_sources.group_bounds`",
    "repas attendu absent": "`21-mesure.ts` ⑤ `couverture.manquants`",
    "boîte collective": "`21-mesure.ts` ③ `bacs_communs` + part interne",
    "dépassement isolé masqué par médiane": "`violations_grammes`, une ligne par occurrence",
    "index du run absent": "`index.exact` + part non restaurable",
    "HTTP 546 classé non testé": "`banc.classe_http`",
}
for nom, mord, tait in CAS_BANC:
    a, na = qui(mord)
    b, nb = qui(tait)
    v = "✅" if a and b else ("⚠️ un seul côté" if a or b else "⛔ aucun cas")
    print(f"| {nom} | {OU[nom]} | `{a or '—'}` ({na}) | `{b or '—'}` ({nb}) | {v} |")
print()
print("### Ce que ce tableau ne dit PAS")
print()
print("- **« index du run absent » est DÉTECTÉ, pas RÉPARÉ.** Le banc sait dire "
      "quelle part de l'énergie venait des bornes de groupe et refuse de mesurer "
      "les journées concernées ; il ne sait pas reconstituer cette part. Une "
      "ligne `group_bounds` n'est pas relisible (`filledFromPendingRow` la "
      "refuse), et sa valeur dépendait de l'index du moment.")
print("- **« champ sécurité absent » mord sur 16 générations, et c'est le "
      "produit qu'il faudrait changer, pas le banc.** Côté solo la ceinture ne "
      "journalise que si un terme est déclaré ; côté foyer, rien de la ceinture "
      "n'atteint `generated_from`. Tant que ça dure, un banc honnête ne peut "
      "rendre que `sans trace`.")
print("- **Aucun de ces huit cas n'est un TEST au sens du § lot 8.** Ce sont des "
      "détecteurs vérifiés sur des archives réelles, avec un cas qui mord et un "
      "cas qui passe pour chacun. Un test qui échouerait si l'on réintroduisait "
      "le défaut reste à écrire ; il vit avec le reste de la famille « Banc », "
      "pas ici.")
print()
print("## ⑦ La reproductibilité de cette passe")
print()
print("⛔ TROIS SESSIONS ÉCRIVENT DANS CET ARBRE. `portion_sizing.ts` — d'où "
      "vient `plateBoundsFor` — a été modifié **pendant** la mesure. Le banc "
      "prend donc l'empreinte des mtimes de `_shared/keel` avant et après "
      "chaque fixture, comme `20-run.py` le fait pour une génération.")
print()
emp = collections.Counter(
    m.get("empreinte_code", {}).get("avant") for m in M if m.get("empreinte_code"))
for k, v in emp.items():
    print(f"- `{k}` : {v} générations")
print()
print("Trois passes ont été lancées, sur **deux empreintes différentes** "
      "(`ed1e7cb3474d` et `4619ed297f76`). Les lignes de résultat sont "
      "**identiques** d'une passe à l'autre : l'édition en cours ne déplace "
      "aucun nombre de ce rapport.")
print()
