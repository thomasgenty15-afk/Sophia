/**
 * UNE ALLERGIE DITE SUR UN RETOUR DE PLAN EST UNE ALLERGIE — le PUR.
 *
 * Autorité produit : `docs/keel/NOMENCLATURE-MEMOIRE.md` §2 axe 1, encadré
 * « CE QUE CETTE RÈGLE NE DIT PLUS — arbitrage du 2026-09-01 ».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE ÇA FERME, ET IL A ÉTÉ MESURÉ
 * ═══════════════════════════════════════════════════════════════════════════
 * Sur un tour réel, « Je suis allergique aux arachides » écrit dans un retour
 * de plan donnait :
 *
 *   food.exclude · scope=next_plan · sujet=household
 *   student_safety_constraints : 0 ligne
 *   keel/safety_fallback : slugs=['peanut'] fell_back=true
 *
 * Trois pertes en une : aucune ceinture en sortie (ce magasin nourrit un prompt
 * et rien ne vérifie le résultat), aucune attribution, **et ça expirait le
 * dimanche suivant**. La même phrase dite en conversation écrivait correctement
 * dans la table : c'était donc la SURFACE qui décidait du sort d'une allergie.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ CE N'EST PAS UN NEUVIÈME `kind`
 * ═══════════════════════════════════════════════════════════════════════════
 * La liste des huit `RetainedKind` reste fermée, et `draft_note_classify.ts`
 * continue de refuser d'y ranger une allergie. Ceci est un **second canal**, à
 * côté, vers des tables qui ont leur ceinture. Les deux sorties du modèle sont
 * disjointes : `items` d'un côté, `safety` de l'autre.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ LE MODÈLE NE CHOISIT PAS LA SÉVÉRITÉ, ET C'EST STRUCTUREL
 * ═══════════════════════════════════════════════════════════════════════════
 * `severity` décide si la ceinture de sortie mord (`medical` seulement). Laisser
 * un modèle la baisser produirait une contrainte enregistrée, visible en base,
 * et **inerte** — la pire des trois issues, parce qu'elle a l'air d'avoir
 * marché. Ce module ne lit donc JAMAIS de `severity` : `intakeSafetyConstraintEffect`
 * applique son défaut, qui est la plus haute compatible avec le `kind`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ DEUX DESTINATIONS, PARCE QUE LA TABLE DE SÉCURITÉ N'A PAS DE COLONNE BOUCHE
 * ═══════════════════════════════════════════════════════════════════════════
 * `student_safety_constraints` est clavetée sur `user_id` : elle ne peut porter
 * que ce qui concerne la personne qui écrit. Une allergie de Tom vit dans
 * `household_member_allergies` (RPC `keel_household_add_allergy`), et un régime
 * dans `household_members.diet` (`keel_household_set_member_diet`).
 *
 * Router les deux au même endroit écrirait l'allergie d'un enfant sur la ligne
 * de sa mère — un fait faux sur de la santé, et le genre de fait qu'on ne
 * découvre qu'à l'hôpital.
 *
 * PURE MODULE : aucun I/O, aucune horloge, aucun aléatoire.
 */

import { normalizeAllergenRef } from "./allergen_catalog.ts";

/** Les six `kind` de la table, dans son propre vocabulaire fermé. */
export const SAFETY_DECLARATION_KINDS = [
  "allergy",
  "intolerance",
  "medical",
  "religious",
  "dislike",
  "diet",
] as const;
export type SafetyDeclarationKind = (typeof SAFETY_DECLARATION_KINDS)[number];

/**
 * ⛔ `dislike` N'EST PAS ACCEPTÉ SUR CE CANAL, et c'est délibéré.
 *
 * Un goût a déjà sa place — `food.exclude`, dans `items`, avec sa date
 * d'expiration et son écran d'édition. L'accepter ici ouvrirait la porte que
 * l'arbitrage du 2026-09-01 n'a **pas** ouverte : celle où tout finit dans la
 * table de sécurité parce que c'est le canal qui « marche ». La frontière est
 * la même que celle du prompt : *« "no peanuts, they make me ill" is a safety
 * fact; "I don't like peanuts" is a preference »*.
 */
export const SAFETY_DECLARATION_REFUSED_KINDS: readonly SafetyDeclarationKind[] = [
  "dislike",
];

/** Ce que le modèle a le droit de rendre dans `safety`. */
export const SAFETY_DECLARATION_ALLOWED_KINDS: readonly SafetyDeclarationKind[] =
  SAFETY_DECLARATION_KINDS.filter(
    (k) => !SAFETY_DECLARATION_REFUSED_KINDS.includes(k),
  );

/** Une déclaration relue, prête pour la porte d'écriture. */
export interface SafetyDeclaration {
  readonly kind: SafetyDeclarationKind;
  /** Le slug normalisé — `peanut`, `lactose`, `vegetarian`… */
  readonly ref: string;
  /** `null` = la personne qui écrit. Sinon l'uuid d'une bouche du foyer. */
  readonly memberId: string | null;
  /** Ce qu'elle a écrit, tel quel. Sert à la notification, pas à la décision. */
  readonly text: string;
}

export interface SafetyDeclarationRefusals {
  readonly total: number;
  /** Un `kind` hors des six, ou l'un des refusés (`dislike`). */
  readonly badKind: number;
  /** Aucun identifiant exploitable après normalisation. */
  readonly badRef: number;
  /** Un `member_id` qui n'est pas au foyer — JAMAIS un repli sur le titulaire. */
  readonly unknownMember: number;
  /** Ni objet, ni champs lisibles. */
  readonly malformed: number;
}

export interface SafetyDeclarationReading {
  readonly proposed: number;
  readonly declarations: readonly SafetyDeclaration[];
  readonly refused: SafetyDeclarationRefusals;
}

const EMPTY: SafetyDeclarationReading = {
  proposed: 0,
  declarations: [],
  refused: { total: 0, badKind: 0, badRef: 0, unknownMember: 0, malformed: 0 },
};

/**
 * RELIT LE TABLEAU `safety` DU MODÈLE.
 *
 * ⛔ UN `member_id` INCONNU EST UN REFUS, JAMAIS UN REPLI SUR LE TITULAIRE.
 * Replier écrirait l'allergie d'un enfant sur la ligne de sa mère. C'est la
 * même règle que `items` — et ici elle porte sur de la santé, donc elle ne se
 * discute pas.
 *
 * ⚠️ LE TEXTE EST GARDÉ, mais il ne décide de rien : il sert à ce que la
 * notification puisse dire ce qu'on a compris, dans les mots de la personne.
 */
export function readSafetyDeclarations(args: {
  raw: unknown;
  /** Les uuid des bouches du foyer. Vide = personne d'autre à table. */
  memberIds: readonly string[];
}): SafetyDeclarationReading {
  const rows = Array.isArray(args.raw) ? args.raw : null;
  if (!rows || rows.length === 0) return EMPTY;

  const known = new Set(
    (args.memberIds ?? []).map((id) => String(id ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  const out: SafetyDeclaration[] = [];
  let badKind = 0, badRef = 0, unknownMember = 0, malformed = 0;

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      malformed += 1;
      continue;
    }
    const rec = row as Record<string, unknown>;

    const rawKind = String(rec.kind ?? "").trim().toLowerCase();
    if (
      !(SAFETY_DECLARATION_ALLOWED_KINDS as readonly string[]).includes(rawKind)
    ) {
      badKind += 1;
      continue;
    }
    const kind = rawKind as SafetyDeclarationKind;

    // ⛔ LE MÊME NORMALISEUR QUE LA CONVERSATION. Une maladie déclarée au chat
    // et la même déclarée ici doivent produire le MÊME slug, sinon la base
    // porte deux lignes pour un seul fait — et la ceinture n'en lit qu'une.
    const ref = normalizeAllergenRef(rec.ref);
    if (!ref) {
      badRef += 1;
      continue;
    }

    const rawMember = String(rec.member_id ?? "").trim().toLowerCase();
    let memberId: string | null = null;
    if (rawMember !== "" && rawMember !== "null") {
      if (!known.has(rawMember)) {
        unknownMember += 1;
        continue;
      }
      memberId = rawMember;
    }

    out.push({
      kind,
      ref,
      memberId,
      text: String(rec.text ?? "").trim().slice(0, 280),
    });
  }

  return {
    proposed: rows.length,
    declarations: out,
    refused: {
      total: badKind + badRef + unknownMember + malformed,
      badKind,
      badRef,
      unknownMember,
      malformed,
    },
  };
}

/**
 * LE TABLEAU `safety` DE LA SORTIE BRUTE, ou `null`.
 *
 * ⚠️ MÊME TOLÉRANCE QUE `itemsOf`, ET SÉPARÉMENT. Le modèle peut rendre une
 * chaîne JSON; il peut aussi rendre `items` sans `safety`, ou l'inverse. Les
 * deux listes sont DISJOINTES: une note qui ne porte qu'une allergie doit
 * atteindre la porte de sécurité même si `items` est vide — et c'est exactement
 * le cas que la sortie anticipée `nothing_to_file` faisait manquer.
 */
export function safetyOf(raw: unknown): unknown[] | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const safety = (value as Record<string, unknown>).safety;
  if (safety === undefined || safety === null) return null;
  return Array.isArray(safety) ? safety : null;
}

/**
 * LE BLOC DE PROMPT — la promesse TOUCHE la clé de schéma.
 *
 * ⚠️ Cicatrice chiffrée du dépôt : 0 % de conformité quand la promesse et la
 * clé de schéma sont éloignées dans le prompt. La frontière goût/sécurité est
 * donc écrite SUR la ligne de `"kind"`, pas dans un paragraphe plus bas.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-04 — LA PORTÉE MANQUAIT, ET UN FOYER ENTIER A MANGÉ VÉGÉTARIEN.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QUI A ÉTÉ MESURÉ, SUR UNE CAMPAGNE RÉELLE ──────────────────────────
 * La note d'un cycle disait: **« On mange végétarien le lundi soir. »** Un dîner
 * par semaine. Ce bloc l'a fait ranger en `{"kind":"diet","ref":"vegetarian",
 * "member_id":null}`, et trois maillons ont fait le reste — le sujet vide vaut
 * « la personne qui écrit » (la titulaire), `DEFAULT_SEVERITY.diet` vaut
 * `strict`, et la contrainte dure d'une bouche gouverne TOUT ce que le foyer
 * cuisine, achète, met en boîte et sert.
 *
 * ⇒ **Quatre omnivores ont mangé végétarien à tous les repas, et rien ne le
 * disait.** Le symptôme ressemblait même à une amélioration: le plat devient
 * commun partout (`common_pot_day` au maximum) et les refus « quelqu'un n'a
 * rien à manger » s'ARRÊTENT — parce qu'il n'y a plus rien à échanger.
 *
 * ⛔ LES DEUX AUTRES MAILLONS SONT JUSTES, ET ON N'Y TOUCHE PAS. Le `null` est
 * correct — « je suis végétarienne » n'a pas de sujet. Le défaut de sévérité est
 * correct, et son propre commentaire dit pourquoi: plus bas produirait une
 * contrainte enregistrée, visible en base et INERTE, la pire des trois issues.
 * Et la gouvernance par le foyer est la doctrine, pas un défaut.
 *
 * **Le trou était ici, dans la consigne, et il est réparé ici.**
 *
 * ── LE DISCRIMINANT EST SUR LA LIGNE DE LA CLÉ, comme le premier ───────────
 * Ce bloc séparait déjà le GOÛT de la SÉCURITÉ sur la ligne de `kind`, avec un
 * exemple travaillé, et un test vérifie que l'exemple n'a pas quitté la ligne
 * (cicatrice chiffrée: 0 % de conformité quand la promesse et la clé sont
 * éloignées). Le second discriminant — la PORTÉE — est posé au même endroit et
 * de la même façon, plus une ligne à part qui donne la règle générale.
 *
 * ── ⚠️ CE QUE CE CORRECTIF NE FAIT PAS, ET IL FAUT LE LIRE ────────────────
 * **Une consigne de prompt régresse en réel.** C'est la loi que
 * `household_restriction_lock.ts` a tirée d'un run — le prompt interdisait de
 * commenter les règles de maison, et le modèle a écrit « SANS NUTELLA » — et le
 * défaut ci-dessus en est la seconde démonstration. Ce lot se mesure donc par un
 * TIR RÉEL sur une note de rythme, jamais par un test vert.
 *
 * ⛔ ET ON N'ÉCRIT AUCUN MATCHER DE REFUS SUR LE TEXTE. La sortie tentante —
 * chercher « le lundi », « au dîner » dans la phrase et jeter l'entrée — est la
 * seule qu'on n'a pas le droit de prendre: un faux positif jetterait une VRAIE
 * ligne de sécurité (« je suis allergique aux arachides depuis lundi »),
 * c'est-à-dire fail-OPEN sur la sécurité.
 *
 * ⚠️ LA SORTIE DURE EST LA CLARIFICATION, et elle n'est pas dans ce lot. Le
 * canal existe (`MEMORY_CLARIFICATION_ABOUTS`) et la question est courte: « tu
 * manges végétarien le lundi soir — est-ce que ça vaut pour tous tes repas ? ».
 * Elle appartient au lot qui tient la chaîne de mémoire. Voie NON PRISE, nommée
 * ici avec sa raison pour que personne ne la redécouvre comme un oubli.
 */
export const SAFETY_DECLARATION_PROMPT_BLOCK = [
  "",
  // ⟳ 2026-09-04 — CETTE LIGNE ÉTAIT PÉRIMÉE, ET ELLE MENTAIT AU MODÈLE. Elle
  // annonçait la forme d'avant le lot A (`{ "items": [...] }`), alors que le
  // prompt principal en demande six clés depuis. Deux lignes de schéma
  // contradictoires dans la même consigne: le modèle en suit une, et personne
  // ne sait laquelle. Elle nomme maintenant la liste par son rang réel.
  "SAFETY — a SIXTH list, next to the five above and never inside them:",
  '{ "preferences": [ ... ], "next_plan": [ ... ], "notes": [ ... ], "skipped": [ ... ], "clarify": [ ... ], "safety": [ ... ] }',
  "",
  "An allergy, an intolerance, a medical condition, a religious rule or a diet is NOT a preference and never goes in any of the five above. It goes here, and it reaches a table that is checked against the food actually served.",
  "Each entry is exactly:",
  "{",
  `  "kind": one of ${
    SAFETY_DECLARATION_ALLOWED_KINDS.join(" | ")
  } — and NEVER ${
    SAFETY_DECLARATION_REFUSED_KINDS.join(", NEVER ")
  }: "no peanuts, they make me ill" is a safety fact and belongs here; "I don't like peanuts" is a taste and belongs in "items" as food.exclude; "we eat vegetarian on Monday nights" is a RHYTHM, not a diet -- it holds on ONE occasion, so it belongs in "notes" with its "when" and NEVER here,`,
  '  "ref": the thing itself as ONE lowercase english word or short slug — peanut, lactose, gluten, shellfish, vegetarian, vegan, halal. Never a sentence, never their whole phrase,',
  '  "member_id": null when it is the person writing. An id COPIED EXACTLY from the roster when the note says it is someone else — same rule as "items": if you cannot tell WHO, leave the entry out entirely. An allergy written on the wrong person is worse than one not written,',
  '  "text": their own sentence, so we can tell them what we understood',
  "}",
  "",
  "",
  "⛔ A line here holds at EVERY meal, for good. If the note ties it to a day, a moment or a frequency -- \"on Mondays\", \"at dinner\", \"twice a week\", \"during Lent\" -- it is not a safety fact whatever words it uses, and it goes in \"notes\" with its \"when\". A diet that holds one evening a week is not a diet: it is a rhythm.",
  // ⟳ 2026-09-05 — LA TROISIÈME ISSUE, SUR LA MÊME LIGNE QUE LES DEUX AUTRES.
  // Entre « toujours » et « un soir par semaine », la phrase qui ne dit rien
  // de sa portée. Deviner écrit une ceinture sur une supposition; la sortie
  // est la question `scope` de la liste `clarify` (règle SCOPE, plus haut).
  "⛔ And when the note names a diet WITHOUT saying whether it always holds -- \"we eat vegetarian\", \"we try to eat vegan\", \"we mostly skip meat these days\" -- put NOTHING here and nothing in the drawers above: it goes in \"clarify\" with \"about\": \"scope\" (rule SCOPE), carrying this very entry under \"safety\". They will be asked, once.",
  "",
  "Return \"safety\": [] when the note says nothing about any of these. That is the normal answer.",
  "⛔ You do NOT choose how serious it is. Never return a severity.",
].join("\n");
