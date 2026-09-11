#!/usr/bin/env python3
"""
LE BANC CORRIGÉ — la bibliothèque. Lot 8 de `docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md`.

⛔ CE FICHIER NE MESURE RIEN. Il fait UNE chose et une seule : dire à quelle
requête appartient chaque ligne de journal, et refuser de rendre un nombre
quand la source ne le porte pas.

── LES DEUX DÉFAUTS D'INSTRUMENT QU'IL FERME ────────────────────────────────

① `docker logs --since <iso>` REÇOIT UNE HEURE LOCALE, ET LE BANC LUI DONNAIT
   DE L'UTC SANS `Z`. Machine en CEST : la fenêtre du journal partait deux
   heures trop tôt. Mesuré sur les archives de la campagne du 2026-09-10 :
   le fichier `log-F5-…json` porte **13 identifiants de requête et 6 comptes**
   pour UNE génération. `20-mesure.py` lisait `tags[...][-1]` — la dernière
   ligne d'une fenêtre de deux heures, pas la ligne de CE plan.

② VALEUR ABSENTE ≠ ZÉRO. `20-mesure.py` lisait
   `generated_from.exclusion_belt.final_bites` : `exclusion_belt` n'est PAS
   dans `generated_from` (ni solo ni foyer — vérifié sur les 12 brouillons
   aboutis), et `final_bites` n'existe que sur la lane foyer, dans le journal.
   Le rapport publiait « exclusion nouvelle : **0** ✅ » sur douze champs
   absents. Ici, absent rend `INCONNU`, et `INCONNU` ne s'additionne pas.

PUR : lecture de fichiers seulement, aucune écriture, aucun appel réseau.
"""
import json
import pathlib

# ── LA VALEUR QUI N'EST PAS UN NOMBRE ─────────────────────────────────────
# Une chaîne, exprès : elle traverse `json.dumps`, se voit dans un tableau, et
# fait lever toute arithmétique qui l'oublierait. Un `None` se serait fondu
# dans les `or 0` du rapport, ce qui est le défaut qu'on ferme.
INCONNU = "inconnu"


def est_connu(x) -> bool:
    return x is not None and x != INCONNU


def nombre(x):
    """Un nombre, ou `INCONNU`. Jamais zéro par défaut."""
    if x is None:
        return INCONNU
    try:
        return float(x) if isinstance(x, float) else int(x)
    except (TypeError, ValueError):
        return INCONNU


def somme(xs):
    """
    La somme, ou `INCONNU` dès qu'un terme manque.

    ⛔ ELLE NE SAUTE PAS LES TROUS. `sum(x for x in xs if x is not None)` rend
    un nombre qui a l'air complet et ne l'est pas : c'est la forme exacte du
    défaut « pas de valeur inconnue présentée comme zéro » (§ 4 du plan).
    """
    total = 0
    for x in xs:
        if not est_connu(x):
            return INCONNU
        total += x
    return total


def charger(path):
    try:
        return json.loads(pathlib.Path(path).read_text())
    except Exception:  # noqa: BLE001
        return None


# ── ① LA DÉCOUPE PAR REQUÊTE ──────────────────────────────────────────────
# Les lignes arrivent dans l'ordre du conteneur. Certaines portent leur
# `request_id` (`*.wall`, `*.draft_store`, `meals_delivered`, `cells`,
# `empty_slots_retry`, `plan.repair_refused`), la plupart non.
#
# LA RÈGLE : une ligne sans identifiant appartient à la requête de la
# PROCHAINE ligne qui en porte un. Elle tient parce qu'une requête émet ses
# lignes puis se ferme par son `wall` — jamais l'inverse.
#
# ⚠️ ET ELLE A UN TROU NOMMÉ : une requête tuée par le 546 avant son `wall`
# n'émet aucun identifiant, et ses lignes remontent à la requête suivante.
# `segment_de` le détecte par comptage (voir `coherent`), et rend alors
# `INCONNU` plutôt qu'une valeur volée au voisin.


def segmenter(rows):
    """Rend [{request_id, rows}], dans l'ordre. Le reliquat final a `None`."""
    segments = []
    courant = []
    for r in rows:
        courant.append(r)
        rid = r.get("request_id")
        if rid:
            # Toutes les lignes accumulées appartiennent à cette requête-là.
            if segments and segments[-1]["request_id"] == rid:
                segments[-1]["rows"].extend(courant)
            else:
                segments.append({"request_id": rid, "rows": courant})
            courant = []
    if courant:
        segments.append({"request_id": None, "rows": courant})
    return segments


# Les marqueurs qui ne peuvent apparaître qu'UNE fois par requête. Deux
# occurrences dans un même segment = la découpe a agrégé deux requêtes.
UNIQUES = (
    "keel.meal.envelope",
    "keel.meal.day_target",
    "keel.meal.portion_scaling",
    "keel.household_meal.portion_sizing",
    "keel.household_meal.box_counts",
)


def segment_de(rows, request_id):
    """
    Le segment de CETTE requête, ou `None`.

    Rend aussi `coherent`: faux si un marqueur unique y apparaît deux fois —
    auquel cas l'appelant doit rendre `INCONNU`, pas la dernière valeur.
    """
    if not request_id:
        return None
    for seg in segmenter(rows):
        if seg["request_id"] != request_id:
            continue
        compte = {}
        for r in seg["rows"]:
            t = r.get("tag")
            if t in UNIQUES:
                compte[t] = compte.get(t, 0) + 1
        seg["coherent"] = all(n == 1 for n in compte.values())
        seg["doublons"] = {t: n for t, n in compte.items() if n > 1}
        return seg
    return None


def tag_unique(seg, tag):
    """
    LA ligne de ce tag dans ce segment, ou `None`.

    ⛔ PAS `[-1]`. Deux lignes du même tag dans un segment veulent dire que la
    découpe a raté : rendre la dernière serait exactement le geste que ce
    fichier existe pour supprimer.
    """
    if seg is None:
        return None
    hits = [r for r in seg["rows"] if r.get("tag") == tag]
    if len(hits) != 1:
        return None
    return hits[0]


def requete_du_run(run):
    """
    L'identifiant de requête d'une génération archivée, par JOINTURE — pas par
    proximité horaire.

    `student_meal_drafts.id` (archivé dans `draft-*.json`) est écrit par la
    ligne `keel.*.draft_store`, qui porte `request_id`. Une seule ligne peut
    matcher : l'identifiant du brouillon est unique.

    Rend `None` quand la requête n'a rien stocké — c'est le cas des huit 546,
    et c'est pour ça qu'ils sont `non_teste` et pas « échec ».
    """
    ret = run["retenu"]
    if not ret.get("log") or not ret.get("draft"):
        return None
    draft = charger(ret["draft"]) or []
    if not draft:
        return None
    did = draft[0].get("id")
    if not did:
        return None
    rows = charger(ret["log"]) or []
    hits = [
        r for r in rows
        if str(r.get("tag", "")).endswith(".draft_store")
        and r.get("draft_id") == did and r.get("request_id")
    ]
    if len(hits) != 1:
        return None
    return hits[0]["request_id"]


# ── ② LA CLASSE D'UN CODE HTTP ────────────────────────────────────────────
# ⛔ 546 N'EST PAS UN ÉCHEC PRODUIT. C'est la limite CPU de l'isolat local
# (`policy = "per_worker"`), antérieure au chantier et explicitement hors
# périmètre (§ 10 du plan). Le compter comme un échec de génération ferait
# porter à ce chantier un défaut de plateforme ; le compter comme un succès
# serait pire. Il est `non_teste`.
PLATEFORME = {546, 502, -1, None}


def classe_http(code):
    if code == 200:
        return "mesure"
    if code in PLATEFORME:
        return "non_teste"
    return "echec_produit"
