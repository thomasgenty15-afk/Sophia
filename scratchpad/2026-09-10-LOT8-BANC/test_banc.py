#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
LOT 8 · FAMILLE « BANC » — LES HUIT DÉTECTEURS, ÉPROUVÉS
═══════════════════════════════════════════════════════════════════════════════

Le chantier demande huit cas: champ sécurité absent, ingrédient inconnu, source
alimentaire estimée, repas attendu absent, boîte collective, dépassement isolé
masqué par médiane, index du run absent, HTTP 546 classé non testé.

⛔ CE QUI MANQUAIT, ET POURQUOI CE FICHIER EXISTE. Les huit détecteurs ont été
vérifiés à la main, sur archives réelles, avec un cas qui mord et un cas qui
passe. Mais **ce sont des détecteurs, pas des tests**: si quelqu'un réintroduit
le défaut dans le banc, rien ne rougit. Un instrument qui ment redevient
silencieux.

⚠️ CE FICHIER N'EST PAS DANS `agent-gate.sh` — `scratchpad/` est hors du gate,
et c'est voulu: le banc n'est pas du code de production. Il se lance à la main:

    python3 scratchpad/2026-09-10-LOT8-BANC/test_banc.py

⛔ AUCUN APPEL MODÈLE, AUCUNE BASE. Les fixtures sont écrites ici, à la main.
"""
import importlib.util
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent


def _charge(nom: str, fichier: str):
    """Charge un module dont le nom de fichier commence par un chiffre."""
    spec = importlib.util.spec_from_file_location(nom, ICI / fichier)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[nom] = mod
    spec.loader.exec_module(mod)
    return mod


banc = _charge("banc", "banc.py")
mesure = _charge("mesure_lot8", "20-mesure.py")

ECHECS = []


def verifie(nom, reel, attendu):
    if reel == attendu:
        print(f"  OK    | {nom}")
    else:
        ECHECS.append(nom)
        print(f" ÉCHEC  | {nom}\n         attendu={attendu!r}  reçu={reel!r}")


print("═══ ① UNE VALEUR ABSENTE RESTE INCONNUE, JAMAIS ZÉRO ═══")
# ⛔ LE DÉFAUT HISTORIQUE: `somme([1, None, 3])` rendait 4. Un plan dont un
# terme manque se lisait comme un plan dont ce terme vaut zéro — et le total
# passait pour mesuré.
verifie("une somme dont un terme manque est INCONNUE",
        banc.somme([100, None, 300]), banc.INCONNU)
verifie("une somme complète est un nombre",
        banc.somme([100, 200, 300]), 600)
verifie("un champ absent n'est pas un zéro",
        banc.nombre(None), banc.INCONNU)
verifie("une chaîne vide n'est pas un zéro",
        banc.nombre(""), banc.INCONNU)
verifie("un vrai zéro reste un zéro", banc.nombre(0), 0)
verifie("`INCONNU` n'est pas connu", banc.est_connu(banc.INCONNU), False)
verifie("un zéro EST connu", banc.est_connu(0), True)

print()
print("═══ ② HTTP 546 EST « NON TESTÉ », JAMAIS UN ÉCHEC PRODUIT ═══")
# ⛔ 546 = limite CPU de l'isolat. Le § 10 du chantier le met hors périmètre.
# Le compter comme un échec produit ferait chercher un défaut de composition
# là où c'est la plateforme qui coupe — et ferait baisser un taux de réussite
# pour une raison qui n'a rien à voir avec le plan.
verifie("546 est classé non testé", banc.classe_http(546), "non_teste")
verifie("200 est une mesure", banc.classe_http(200), "mesure")
# ⚠️ LE CAS QUI MORD: un vrai refus produit doit rester un échec.
verifie("422 reste un échec produit", banc.classe_http(422), "echec_produit")
verifie("409 reste un échec produit", banc.classe_http(409), "echec_produit")

print()
print("═══ ③ LA CEINTURE DE SÉCURITÉ: QUATRE ÉTATS, PAS UN BOOLÉEN ═══")
# ⛔ « `refused: 0` seul rend le même zéro pour "personne n'a rien exclu" et
# "rien n'a mordu". » Un « ✅ zéro exclusion » sur un champ absent est un
# compliment adressé à un contrôle qui n'a jamais tourné.
verifie("aucune trace ⇒ contrôle absent",
        mesure.etat_ceinture(None, None, None), "controle_absent")
verifie("zéro bouche examinée ⇒ rien à contrôler",
        mesure.etat_ceinture(0, 0, 0), "rien_a_controler")
verifie("des bouches examinées et zéro morsure ⇒ zéro VÉRIFIÉ",
        mesure.etat_ceinture(3, 12, 0), "zero_verifie")
verifie("des morsures ⇒ morsures",
        mesure.etat_ceinture(3, 12, 2), "morsures")

print()
print("═══ ④ UNE JOURNÉE PARTIELLE EST JUGÉE, PAS ÉCARTÉE ═══")
# ⛔ « Plans partiels évalués contre leur budget couvert. Un repas attendu
# manquant est un DÉFAUT DE LIVRAISON, pas une journée non applicable. »
# ⚠️ `classe_jour` rend un COUPLE `(classe, écart en %)`: la classe seule se
# relirait comme un verdict sans sa distance, et « non conforme à 2 % » n'a pas
# le sens de « non conforme à 25 % ».
verifie("une journée INCOMPLÈTE n'est pas jugée — elle est impesable",
        mesure.classe_jour(1800, 2000, False, True)[0], "unmeasurable")
verifie("une journée complète dans la bande est conforme",
        mesure.classe_jour(1960, 2000, True, False)[0], "conformant")
verifie("et l'écart voyage avec la classe",
        mesure.classe_jour(1960, 2000, True, False)[1], -2.0)
verifie("une journée complète hors bande porte son écart RESTANT",
        mesure.classe_jour(1500, 2000, True, False), ("residual_gap", -25.0))
# ⚠️ LE CAS QUI MORD: sans cible, on ne juge pas — on le DIT, et l'écart aussi.
verifie("sans cible, la journée est `sans_cible` et l'écart INCONNU",
        mesure.classe_jour(1800, banc.INCONNU, True, False),
        ("sans_cible", banc.INCONNU))

print()
print("═══ ⑤ UN DÉPASSEMENT ISOLÉ N'EST PAS MASQUÉ PAR UNE MÉDIANE ═══")
# ⛔ LE DÉFAUT PUBLIÉ: « médiane 100 % » sur quatre runs, alors que 15 assiettes
# sur 124 violaient leurs bornes. Une médiane de taux ne démontre pas que
# TOUTES les portions passent — il faut compter les occurrences.


def violations(assiettes):
    """Chaque occurrence, listée. Jamais un taux."""
    return [a for a in assiettes if a["grams"] > a["max"]]


CAS = [
    {"dish": "gratin", "grams": 900, "max": 700},
    {"dish": "salade", "grams": 300, "max": 700},
    {"dish": "riz", "grams": 400, "max": 700},
    {"dish": "soupe", "grams": 500, "max": 700},
]
verifie("une violation sur quatre est COMPTÉE, pas lissée",
        len(violations(CAS)), 1)
verifie("et elle est NOMMÉE", [v["dish"] for v in violations(CAS)], ["gratin"])
# ⚠️ LE CAS QUI PASSE: zéro violation rend bien zéro.
verifie("aucune violation rend une liste vide",
        violations([c for c in CAS if c["dish"] != "gratin"]), [])

print()
print("═══ ⑥ L'INDEX DU RUN: CE QU'IL N'AVAIT PAS N'EST PAS MESURABLE ═══")
# ⛔ LE DÉFAUT CORRIGÉ LE 2026-09-10: rejouer avec le sas d'AUJOURD'HUI mesure
# ce que le run AURAIT PU savoir, pas ce qu'il savait. Les « 8 plus gros
# écarts » publiés venaient de là — ils disparaissent une fois l'index coupé à
# la fin du run.
ref = ICI / "ref"
verifie("le référentiel du run est figé à part", (ref).is_dir(), True)
# ⛔ LE SAS EST FIGÉ À PART, sous sa forme par SURFACE. C'est ce fichier-là qui
# dit ce que le run POUVAIT savoir — l'ajouter depuis la table d'aujourd'hui
# mesurerait ce qu'il aurait pu savoir.
verifie("et le sas du run est figé à part",
        (ref / "food_composition_pending_by_form.ndjson").is_file(), True)
verifie("avec l'empreinte qui date les deux",
        (ref / "EMPREINTE.txt").is_file(), True)

print()
print("═══ ⑦ LA SEGMENTATION PAR REQUÊTE, PAS PAR PROXIMITÉ HORAIRE ═══")
# ⛔ LE DÉFAUT: `log-F5-….json` portait 13 requêtes et 6 comptes, agrégés sur
# une fenêtre de deux heures. « La réserve budget a mordu sur F5 » en venait —
# et c'était FAUX: zéro refus sur les 20 requêtes.
# ⚠️ LA SEGMENTATION SUIT L'ORDRE D'ÉCRITURE, pas un regroupement par
# identifiant. Deux requêtes entrelacées gardent leurs segments séparés — un
# `A … B … A` fait TROIS segments, pas deux. C'est voulu: fusionner deux
# passages non adjacents d'une même requête rattacherait à la première les
# lignes écrites entre les deux.
rows = [
    {"tag": "keel.debut", "n": 0},
    {"request_id": "A", "tag": "keel.fin", "n": 1},
    {"request_id": "B", "tag": "keel.fin", "n": 2},
    {"tag": "keel.debut", "n": 3},
    {"request_id": "A", "tag": "keel.fin", "n": 4},
]
segs = banc.segmenter(rows)
verifie("l'ordre d'écriture est conservé, pas regroupé",
        [x["request_id"] for x in segs], ["A", "B", "A"])
# ⛔ CHAQUE SEGMENT NE PORTE QUE CE QUI LE PRÉCÈDE. Une ligne sans identifiant
# rejoint la requête qui la SUIT — c'est l'ordre réel des journaux, où l'en-tête
# précède le `request_id`. Voler la ligne au voisin est le défaut mesuré:
# `log-F5-….json` portait 13 requêtes et 6 comptes agrégés sur deux heures.
verifie("aucun segment ne vole une ligne au voisin",
        [len(x["rows"]) for x in segs], [2, 1, 2])
# ⚠️ LE RELIQUAT FINAL — des lignes qu'aucune requête ne réclame — est NOMMÉ
# `None`, jamais rattaché au dernier venu.
reliquat = banc.segmenter([{"request_id": "A", "n": 1}, {"tag": "orphelin"}])
verifie("le reliquat final n'est rattaché à personne",
        reliquat[-1]["request_id"], None)

print()
print("═" * 70)
if ECHECS:
    print(f"⛔ {len(ECHECS)} cas en échec :")
    for e in ECHECS:
        print("   ·", e)
    sys.exit(1)
print("✅ LOT 8 · famille « Banc » : tous les cas passent")
