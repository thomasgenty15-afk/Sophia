/**
 * LE CHAT NE RANGE RIEN: IL RENVOIE — lot M1 du chantier « mémoire ».
 *
 * Autorité produit: `scratchpad/2026-08-21-DESIGN-MEMOIRE.md` §2.3 et §3.5 M1.
 * Socle: `retained_item.ts` (ligne ③ de la matrice, désormais VIDE).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CE FICHIER A REMPLACÉ, ET POURQUOI ON NE LE RECOLLE PAS
 * ═══════════════════════════════════════════════════════════════════════════
 * Il s'appelait `conversation_retained.ts` et portait DEUX moitiés: un
 * memorizer qui classait la conversation en `RetainedItem`, et un renvoi pour
 * la seule famille qu'il n'avait pas le droit de classer (`portion.adjust`).
 * Le lot M1 a supprimé la première et généralisé la seconde: **toute** famille
 * se renvoie, aucune ne se classe.
 *
 * ── LE MOTIF, ET IL N'EST PAS LA QUALITÉ DU CLASSEMENT ────────────────────
 * Le modèle classait bien. Le défaut était structurel: une phrase de chat n'a
 * pas de **dénominateur**. « c'était trop » ne dit ni de quoi, ni pour qui;
 * « j'aime pas trop ça » ne nomme pas un plat. Le retour sur brouillon et le
 * bilan de fin de plan, eux, sont ancrés sur un objet — CE brouillon, CE plan —
 * et c'est la question qui porte la structure, pas la fiabilité du modèle.
 *
 * Le magasin que la conversation alimentait ne pouvait donc que **grandir**:
 * de l'inférence en entrée, un prompt sans plafond en sortie, et une règle de
 * dépôt qui interdit de réécrire ce que quelqu'un a renseigné. Mesuré au
 * 2026-08-21: 3 lignes du memorizer en base, et l'ancienne liste plate portait
 * *« Aime le brocoli s'il est rôti »* et *« N'aime pas le brocoli »* dans le
 * même prompt.
 *
 * ⛔ ── LA RÈGLE DE FORMULATION EST UNE GARDE, PAS UN DÉTAIL ───────────────
 * Aucune phrase d'ici ne doit laisser croire que c'est enregistré. **Pas de
 * « je le note », pas de « j'en tiens compte », pas de « c'est bon ».** C'est
 * exactement la phrase qui a coûté cher à ce dépôt: `student_safety_constraints`
 * avait six lecteurs armés en production et zéro écrivain, et quelqu'un qui
 * déclarait une anaphylaxie recevait *« Noted, I'll keep it in mind »* pendant
 * que la base restait vide. **Un lecteur sans écrivain ressemble trait pour
 * trait à une fonctionnalité qui marche; ici, le mensonge était une phrase
 * rassurante.**
 *
 * ⚠️ ET LA PHRASE DE SIZING LA VIOLAIT. Héritée du lot 2C, elle s'ouvrait sur
 * *« I'm noting that for the end-of-plan review »* / *« Je garde ça pour le
 * bilan »* — la formule interdite, mot pour mot, pour un runtime qui n'écrit
 * rien. Elle est réécrite ici. Ce n'est pas un ravalement: c'était la même
 * panne, en plus petit.
 *
 * ⛔ ── AUCUN MATCHER MAISON, NULLE PART ────────────────────────────────────
 * Ce module ne lit JAMAIS le message de la personne. Il lit le verdict que le
 * dispatcher a déjà rendu (`plan_feedback`, `profile_statement`). Reconnaître
 * « je n'ai pas de four » sur du texte libre, dans deux langues, demanderait
 * exactement le matcher que ce dépôt a mesuré faux: « laitue » ≠ « lait »,
 * 12 faux positifs sur 12.
 *
 * ⚠️ ── LA LANGUE, ET ELLE EST UNE CICATRICE CHIFFRÉE ──────────────────────
 * Deux packs entiers, jamais un repli mot à mot, et la langue arrive en
 * paramètre. `profiles.locale` vaut `fr-FR` par défaut sur ce produit: une
 * phrase anglaise en dur serait lue par la majorité des gens. Le dépôt porte
 * les deux mesures — une garde testée dans une seule langue (« not » ne couvre
 * pas « doesn't »), et une doctrine `fr-FR` sortie en anglais.
 *
 * ⚠️ ── ET ELLES DOIVENT ÊTRE **DITES**, PAS SEULEMENT RENDUES ─────────────
 * Les deux `append*` sont faites pour être appelées DANS `finalVisibleText`,
 * au même endroit et pour la même raison qu'`appendPhotoInvitation`: c'est le
 * seul entonnoir que tous les chemins de sortie traversent. Une lane voisine
 * (`plan_question`) capture 38 % des tours et rend sa propre réponse; une
 * phrase posée avant elle serait avalée sans trace.
 *
 * PURE MODULE: no I/O, no clock, no randomness. La langue arrive TOUJOURS en
 * paramètre.
 */

import { isFrenchLocale } from "./locale.ts";

// ===========================================================================
// ① LE RENVOI DU SIZING — vers le bilan de fin de plan
// ===========================================================================

/**
 * LA PHRASE, DANS LES DEUX LANGUES. Deux packs entiers, jamais un repli mot à
 * mot — patron de `QUESTION_LABELS` (`plan_feedback.ts`) et de `COPY`
 * (`plan_question/renderer.ts`).
 *
 * ── CE QU'ELLE DIT, ET CE QU'ELLE NE DIT PAS ──────────────────────────────
 * Elle dit **qu'on n'a rien rangé**, **pourquoi**, et **où ça se pose**. Elle
 * ne promet rien: ce serait un accusé sans effet, exactement ce que la ceinture
 * d'accusé fantôme retire. Et elle ne demande rien ici: la question fermée
 * appartient au bilan, qui a la liste du foyer sous les yeux.
 *
 * ⛔ AUCUN PRÉNOM, AUCUN CHIFFRE. Le sujet est précisément ce qu'on ne sait
 * pas; en nommer un serait l'inventer.
 */
export const SIZING_REDIRECT_SENTENCES = {
  en:
    "I haven't saved that — for a serving I need to know who it's for, and chat can't tell. The end-of-plan review asks that with everyone at your table in front of you.",
  fr:
    "Je n'ai pas enregistré ça — pour une portion j'ai besoin de savoir pour qui, et le chat ne sait pas l'attribuer. Le bilan de fin de plan pose la question avec tout ton foyer sous les yeux.",
} as const;

/**
 * La phrase dans la langue de la personne.
 *
 * ⚠️ `isFrenchLocale` ET PAS `startsWith("fr")`. C'est le seul prédicat de
 * langue autorisé dans ce dépôt (`locale.ts`), et il normalise avant de couper.
 * ⚠️ ET PAS `localePackKey`: celui-là LÈVE sur une langue non livrée, et une
 * phrase d'accompagnement ne doit jamais faire tomber un tour.
 */
export function sizingRedirectSentence(locale: string | null | undefined): string {
  return isFrenchLocale(locale)
    ? SIZING_REDIRECT_SENTENCES.fr
    : SIZING_REDIRECT_SENTENCES.en;
}

/**
 * LE SIGNAL DU DISPATCHER, RÉDUIT À CE QUE CETTE RÈGLE REGARDE.
 *
 * ⛔ AUCUN MATCHER MAISON. Ce module ne lit pas le message de la personne: il
 * lit le verdict que le dispatcher a déjà rendu.
 */
export type SizingFeedbackSignal = {
  readonly detected: boolean;
  readonly kind?: string | null;
  readonly detail?: string | null;
  readonly sentiment?: string | null;
};

/**
 * LES JETONS DE `plan_feedback.kind` QUI PARLENT D'UNE PART. Liste FERMÉE.
 *
 * ⚠️ ELLE EST FERMÉE POUR LA MÊME RAISON QUE `RETAINED_KINDS`: un jeton inconnu
 * ne se devine pas. Un `kind` absent ou hors liste ne déclenche RIEN — le
 * silence est la bonne réponse quand on ne sait pas de quoi le tour parlait, et
 * poser la phrase « au cas où » la ferait sortir sur des tours qui ne parlent
 * pas de portions du tout.
 */
export const SIZING_FEEDBACK_KINDS: readonly string[] = [
  "portion",
  "portions",
  "portion_size",
  "serving",
  "serving_size",
  "sizing",
];

/**
 * FAUT-IL RENVOYER CE TOUR VERS LE BILAN ?
 *
 * ⚠️ LES DEUX MOITIÉS SONT NÉCESSAIRES, et `detected` seul ne suffit pas: le
 * signal `plan_feedback` couvre tout retour sur une ligne de plan (« ce plat
 * était bon »), pas seulement les portions. Renvoyer sur `detected` seul ferait
 * sortir la phrase sur des compliments.
 *
 * PURE: aucun I/O, aucune horloge, aucune lecture du message.
 */
export function sizingFeedbackDetected(
  signal: SizingFeedbackSignal | null | undefined,
): boolean {
  if (!signal || signal.detected !== true) return false;
  const kind = String(signal.kind ?? "").trim().toLowerCase();
  if (kind === "") return false;
  return SIZING_FEEDBACK_KINDS.includes(kind);
}

/**
 * LA PHRASE À DIRE SUR CE TOUR, ou `null`.
 *
 * ⚠️ `isKeelStudent` EST REQUIS, JAMAIS OPTIONNEL — cicatrice « paramètre de
 * garde optionnel = garde désarmée ». Hors élève KEEL il n'y a ni plan, ni
 * bilan de fin de plan, ni foyer: la phrase renverrait vers un écran qui
 * n'existe pas.
 */
export function sizingRedirectFor(args: {
  signal: SizingFeedbackSignal | null | undefined;
  locale: string | null | undefined;
  isKeelStudent: boolean;
}): string | null {
  if (args.isKeelStudent !== true) return null;
  if (!sizingFeedbackDetected(args.signal)) return null;
  return sizingRedirectSentence(args.locale);
}

// ===========================================================================
// ② LE RENVOI VERS UN CHAMP — le lot M1 proprement dit
// ===========================================================================

/**
 * LES QUATRE DESTINATIONS. Liste FERMÉE, et chacune est **un écran qui
 * existe**.
 *
 * ⛔ NE PAS EN AJOUTER UNE SANS L'ÉCRAN. Renvoyer vers un champ qui n'existe
 * pas est le même mensonge qu'un accusé sans effet, avec un pas de plus: la
 * personne fait le geste, ne trouve rien, et conclut que le produit ment. Les
 * quatre ci-dessous sont vérifiées:
 *
 *   `food_preference`  → `/app/about-you`  (`StudentKnownPage`)
 *   `equipment`        → `/app/setup`      (`SetupPage`, équipement de cuisine)
 *   `rhythm`           → `/app/setup`      (`SetupPage`, rythme des repas)
 *   `logistics`        → `/app/setup`      (`SetupPage`, temps/budget/courses)
 *
 * ⚠️ `craving` N'EST PAS ICI, ET C'EST VOULU. Une envie a déjà son canal à
 * elle (`household_envy_submissions`, écran foyer): la renvoyer vers un champ
 * dupliquerait une porte qui marche.
 *
 * ⚠️ `portion.adjust` N'EST PAS ICI NON PLUS: il a son propre renvoi, ci-dessus,
 * vers le bilan et pas vers un champ — parce qu'une part a besoin d'un sujet
 * que seul le bilan sait demander.
 */
export const PROFILE_REDIRECT_KINDS = [
  "food_preference",
  "equipment",
  "rhythm",
  "logistics",
] as const;
export type ProfileRedirectKind = (typeof PROFILE_REDIRECT_KINDS)[number];

/**
 * LES PHRASES, PAR DESTINATION ET PAR LANGUE.
 *
 * ── LA FORME EST LA MÊME POUR LES QUATRE, ET C'EST DÉLIBÉRÉ ───────────────
 *   ① « je n'ai pas enregistré ça » — le démenti, EN PREMIER;
 *   ② pourquoi — le chat ne retient rien de lui-même;
 *   ③ où ça se pose — LA SECTION, nommée.
 *
 * ⛔ L'ORDRE COMPTE. Le démenti passe devant parce qu'une phrase qui commence
 * par « pour que ça compte, va dans… » se lit comme un conseil facultatif posé
 * sur un enregistrement déjà fait. Ce qu'on doit corriger, c'est la croyance
 * par défaut — et elle est « c'est retenu ».
 *
 * ⛔ ET ELLE NOMME LA SECTION, PAS LA PAGE. « ce qui tue une redirection n'est
 * pas le tap — c'est d'arriver sur un écran de préférences et de devoir
 * chercher où mettre la chose » (design §2.8).
 */
export const PROFILE_REDIRECT_SENTENCES: Readonly<
  Record<ProfileRedirectKind, { readonly en: string; readonly fr: string }>
> = {
  food_preference: {
    en:
      "I haven't saved that — chat doesn't keep anything on its own. Add it under \"What Sophia knows about you\" and your next meals will hold to it.",
    fr:
      "Je n'ai pas enregistré ça — le chat ne retient rien de lui-même. Ajoute-le dans « Ce que Sophia sait de toi » et tes prochains repas s'y tiendront.",
  },
  equipment: {
    en:
      "I haven't saved that — chat doesn't keep anything on its own. Update your kitchen equipment in your setup, and the next plans will cook with what you actually have.",
    fr:
      "Je n'ai pas enregistré ça — le chat ne retient rien de lui-même. Mets à jour ton équipement de cuisine dans tes réglages, et les prochains plans cuisineront avec ce que tu as vraiment.",
  },
  rhythm: {
    en:
      "I haven't saved that — chat doesn't keep anything on its own. Your meal rhythm is set in your setup, and that's what every plan starts from.",
    fr:
      "Je n'ai pas enregistré ça — le chat ne retient rien de lui-même. Le rythme de tes repas se règle dans tes réglages, et c'est de là que part chaque plan.",
  },
  logistics: {
    en:
      "I haven't saved that — chat doesn't keep anything on its own. Cooking time, budget and shopping days are set in your setup, and the plans size themselves on those.",
    fr:
      "Je n'ai pas enregistré ça — le chat ne retient rien de lui-même. Ton temps de cuisine, ton budget et tes jours de courses se règlent dans tes réglages, et les plans se dimensionnent dessus.",
  },
} as const;

/**
 * LE SIGNAL DU DISPATCHER POUR CE RENVOI, réduit à ce que la règle regarde.
 *
 * ⛔ AUCUN MATCHER MAISON, MÊME RAISON QUE PLUS HAUT.
 */
export type ProfileStatementSignal = {
  readonly detected: boolean;
  readonly kind?: string | null;
  readonly detail?: string | null;
};

/**
 * LE JETON, S'IL EST DANS LA LISTE FERMÉE — sinon `null`.
 *
 * ⚠️ UN JETON INCONNU NE DÉCLENCHE RIEN, et ce n'est pas une négligence: le
 * silence est la bonne réponse quand on ne sait pas de quoi le tour parlait.
 * Replier sur une destination « par défaut » enverrait la personne vers le
 * mauvais écran, ce qui est pire que de se taire.
 */
export function profileRedirectKindOf(
  signal: ProfileStatementSignal | null | undefined,
): ProfileRedirectKind | null {
  if (!signal || signal.detected !== true) return null;
  const kind = String(signal.kind ?? "").trim().toLowerCase();
  if (kind === "") return null;
  return (PROFILE_REDIRECT_KINDS as readonly string[]).includes(kind)
    ? kind as ProfileRedirectKind
    : null;
}

/** La phrase d'une destination, dans la langue de la personne. */
export function profileRedirectSentence(
  kind: ProfileRedirectKind,
  locale: string | null | undefined,
): string {
  const pack = PROFILE_REDIRECT_SENTENCES[kind];
  return isFrenchLocale(locale) ? pack.fr : pack.en;
}

/**
 * LA PHRASE À DIRE SUR CE TOUR, ou `null`.
 *
 * ⚠️ `isKeelStudent` EST REQUIS, JAMAIS OPTIONNEL — même cicatrice que
 * `sizingRedirectFor`. Hors élève KEEL il n'y a ni carte « ce que Sophia sait
 * de toi », ni écran de réglages de foyer: les quatre destinations n'existent
 * pas, et la phrase renverrait dans le vide.
 */
export function profileRedirectFor(args: {
  signal: ProfileStatementSignal | null | undefined;
  locale: string | null | undefined;
  isKeelStudent: boolean;
}): string | null {
  if (args.isKeelStudent !== true) return null;
  const kind = profileRedirectKindOf(args.signal);
  if (!kind) return null;
  return profileRedirectSentence(kind, args.locale);
}

// ===========================================================================
// ③ LE DIRE — l'ajout déterministe, par le runtime et pas par le modèle
// ===========================================================================

/**
 * L'AJOUT À LA RÉPONSE.
 *
 * ── POURQUOI UN AJOUT DÉTERMINISTE, ET PAS UNE CONSIGNE DE PROMPT ──────────
 * *« Une règle de prompt n'est pas une ceinture »* (`turn_ledger.ts`). Une
 * consigne « dis-lui d'aller dans ses réglages » régresse en réel: le modèle
 * l'oublie, personne ne le voit, et le retour de la personne disparaît sans un
 * mot — c'est-à-dire exactement le défaut que ce lot existe pour fermer.
 *
 * ── ET POURQUOI DANS `finalVisibleText` ───────────────────────────────────
 * C'est le seul entonnoir que TOUS les chemins de sortie traversent. Une lane
 * voisine (`plan_question`) capture une part importante des tours et rend sa
 * propre réponse; une phrase posée en amont d'elle serait avalée sans trace.
 *
 * CONDITION DE DÉSARMEMENT: sans phrase armée, la fonction rend le texte
 * INCHANGÉ et n'en retire jamais rien. Elle ne peut donc pas appauvrir une
 * réponse; au pire elle n'ajoute rien.
 *
 * ⚠️ UNE SEULE FONCTION POUR LES DEUX RENVOIS, ET C'EST VOULU. Deux fonctions
 * jumelles divergeraient sur la déduplication ou sur le séparateur, et la
 * différence ne se verrait que sur un tour qui porte les deux phrases.
 */
export function appendRedirect(
  text: string,
  sentence: string | null | undefined,
): string {
  const source = String(text ?? "");
  const redirect = String(sentence ?? "").trim();
  if (!redirect) return source;
  // Déjà présente (rejeu, ou composeur qui a recopié le gabarit): ne pas la
  // doubler. Comparaison EXACTE sur un gabarit fermé — pas une heuristique de
  // sens, une égalité de chaîne.
  if (source.includes(redirect)) return source;
  const body = source.trim();
  return body ? `${body}\n\n${redirect}` : redirect;
}

/**
 * Le nom historique, gardé parce que le câblage et son test l'épinglent.
 *
 * @deprecated Utiliser `appendRedirect`, qui sert les deux renvois.
 */
export function appendSizingRedirect(
  text: string,
  sentence: string | null | undefined,
): string {
  return appendRedirect(text, sentence);
}

// ===========================================================================
// ④ LA GARDE DE FORMULATION — la liste des promesses interdites
// ===========================================================================

/**
 * LES FORMULES QUI PROMETTENT UN ENREGISTREMENT. Aucune phrase de ce module ne
 * doit en contenir.
 *
 * ⛔ CE N'EST PAS UN MATCHER SUR DU TEXTE LIBRE, ET LA DIFFÉRENCE EST TOUT.
 * On ne cherche pas ces formules dans ce que dit la personne ni dans ce que
 * rend le modèle — on les cherche dans **nos propres littéraux**, qui sont un
 * ensemble fermé de dix phrases qu'on a écrites. Un faux positif y est
 * impossible: on lit ce qu'on a tapé.
 *
 * ⚠️ LES DEUX LANGUES, ET C'EST LA CICATRICE. Une garde testée dans une seule
 * langue ne mord pas dans l'autre — « not » ne couvre pas « doesn't », et une
 * phrase française fautive passerait sous une liste anglaise.
 *
 * ⚠️ AUCUN TERME NIÉ DANS CETTE LISTE. « enregistré » et « saved » en sont
 * ABSENTS exprès: nos phrases s'ouvrent sur « je n'ai PAS enregistré ». Un
 * terme dont la négation est justement la bonne formulation ferait rougir la
 * garde sur la phrase correcte — c'est la cicatrice de l'ordre des mots
 * (« négation après le terme = morsure »).
 */
export const FORBIDDEN_STORAGE_CLAIMS: readonly string[] = [
  // FR
  "je le note",
  "je note ",
  "c'est noté",
  "j'en tiens compte",
  "je le garde",
  "je garde ça",
  "je retiens",
  "je m'en souviendrai",
  // EN
  "i'm noting",
  "i've noted",
  "noted,",
  "i'll keep that",
  "i'll remember",
  "got it,",
];

/**
 * Toutes les phrases de ce module, à plat — ce que la garde relit.
 *
 * ⚠️ DÉRIVÉE DES LITTÉRAUX, JAMAIS RETAPÉE. Une seconde liste écrite à la main
 * serait celle qu'on oublierait de mettre à jour, et la garde deviendrait verte
 * sur une phrase qu'elle ne lit plus.
 */
export function allRedirectSentences(): string[] {
  return [
    ...Object.values(SIZING_REDIRECT_SENTENCES),
    ...Object.values(PROFILE_REDIRECT_SENTENCES).flatMap((pack) => [
      pack.en,
      pack.fr,
    ]),
    // LOT M6 — la garde de formulation relit AUSSI la phrase de révocation.
    // Elle est celle qui parle le plus d'enregistrement (« je ne la lève pas
    // d'ici »), donc celle où une promesse se glisserait le plus facilement.
    ...Object.values(RULE_QUESTION_SENTENCES).flatMap((pack) => [
      pack.one,
      pack.many,
    ]),
  ];
}

// ===========================================================================
// ⑤ LA QUESTION VAUT RÉVOCATION — lot M6
// ===========================================================================

/**
 * LA PHRASE, PAR LANGUE.
 *
 * ── CE QU'ELLE DIT, DANS CET ORDRE ────────────────────────────────────────
 *   ① la RÈGLE, citée telle qu'elle est écrite — pas reformulée;
 *   ② d'OÙ elle vient, dans les mots de la personne (la citation de M2);
 *   ③ OÙ elle se lève.
 *
 * ⛔ ET ELLE NE LÈVE RIEN. Le §2.9 dit « propose de la lever là »; le §2.8
 * tranche « le chat n'écrit JAMAIS, pas même en un tap », avec la raison qui
 * décide: *« s'il peut écrire une allergie en un tap, pourquoi pas un aliment
 * évité ? »*. La seconde règle nomme le cas de la première, donc elle gagne.
 *
 * ⚠️ LE GAIN RESTE ENTIER: ce qui coûtait cher n'était pas le tap, c'était
 * « d'arriver sur un écran et de devoir chercher où mettre la chose ». Ici la
 * ligne est NOMMÉE et sa cause est rappelée — la personne sait ce qu'elle va
 * enlever avant d'y aller.
 *
 * ⛔ AUCUNE PROMESSE D'ENREGISTREMENT, et la garde de formulation du §④ relit
 * ces phrases comme les autres.
 */
export const RULE_QUESTION_SENTENCES = {
  en: {
    one:
      "I haven't saved that — I'm not lifting it from here. It comes from one line you have: {rule}. You can remove it under \u201cWhat Sophia knows about you\u201d and it stops applying.",
    many:
      "I haven't saved that — I'm not lifting it from here. It comes from lines you have: {rule}. You can remove them under \u201cWhat Sophia knows about you\u201d and they stop applying.",
  },
  fr: {
    one:
      "Je n'ai pas enregistré ça — et je ne la lève pas d'ici. Elle vient d'une ligne que tu as : {rule}. Tu peux l'enlever dans « Ce que Sophia sait de toi », et elle cesse de s'appliquer.",
    many:
      "Je n'ai pas enregistré ça — et je ne les lève pas d'ici. Elles viennent de lignes que tu as : {rule}. Tu peux les enlever dans « Ce que Sophia sait de toi », et elles cessent de s'appliquer.",
  },
} as const;

/** Comment une règle se cite dans la phrase. ⛔ Telle quelle, jamais reformulée. */
export const RULE_QUOTE_SENTENCES = {
  en: { withCause: "\u201c{text}\u201d (you said: {quote})", bare: "\u201c{text}\u201d" },
  fr: { withCause: "« {text} » (tu as dit : {quote})", bare: "« {text} »" },
} as const;

/**
 * LA PHRASE À DIRE SUR CE TOUR, ou `null`.
 *
 * ⚠️ `isKeelStudent` REQUIS, jamais optionnel — même cicatrice que les deux
 * renvois du dessus: hors élève KEEL il n'y a ni carte, ni règles à lever.
 *
 * ⛔ ET `null` QUAND ON NE TROUVE RIEN. Une question sur un aliment qu'aucune
 * règle ne nomme n'est pas une révocation: c'est une question ordinaire, et y
 * répondre « tu as une règle » serait inventer une cause. Le silence rend la
 * main à la lane qui parlait.
 */
export function ruleQuestionRedirectFor(args: {
  rules: readonly { text: string; quote: string | null }[];
  locale: string | null | undefined;
  isKeelStudent: boolean;
}): string | null {
  if (args.isKeelStudent !== true) return null;
  const rules = (args.rules ?? []).filter((r) => String(r?.text ?? "").trim());
  if (rules.length === 0) return null;
  const fr = isFrenchLocale(args.locale);
  const quote = fr ? RULE_QUOTE_SENTENCES.fr : RULE_QUOTE_SENTENCES.en;
  const rendered = rules
    .map((r) => {
      const cause = String(r.quote ?? "").trim();
      return cause
        ? quote.withCause.replace("{text}", r.text).replace("{quote}", cause)
        : quote.bare.replace("{text}", r.text);
    })
    .join(fr ? " et " : " and ");
  const pack = fr ? RULE_QUESTION_SENTENCES.fr : RULE_QUESTION_SENTENCES.en;
  const shape = rules.length > 1 ? pack.many : pack.one;
  return shape.replace("{rule}", rendered);
}
