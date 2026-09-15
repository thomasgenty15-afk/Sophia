/**
 * UNE EXCLUSION QU'ON INTERROGE EST UNE EXCLUSION MORTE — lot M6.
 *
 * Autorité produit: `scratchpad/2026-08-21-DESIGN-MEMOIRE.md` §2.9 ③ et §3.5 M6.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE ÇA FERME
 * ═══════════════════════════════════════════════════════════════════════════
 * *« Quand quelqu'un demande "pourquoi il n'y a jamais de poulet ?", il vient de
 * révoquer sa règle. Le renvoyer vers un écran, c'est lui faire payer deux fois
 * une préférence qu'il n'a plus. »*
 *
 * La question EST le signal. Personne ne demande pourquoi il n'y a jamais de ce
 * qu'il ne veut pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ « PROPOSE DE LA LEVER LÀ » — ET LE CHAT N'ÉCRIT TOUJOURS PAS
 * ═══════════════════════════════════════════════════════════════════════════
 * Le §2.9 dit *« propose de la lever LÀ »*; le §2.8 dit *« le chat n'écrit
 * JAMAIS. Pas même une allergie. Pas même en un tap. »* — et il donne la raison
 * qui tranche: *« S'il peut écrire une allergie en un tap, pourquoi pas un
 * aliment évité ? Six mois plus tard le chat écrit tout à nouveau, un bouton à
 * la fois. »*
 *
 * ⇒ **La seconde règle gagne, et elle nomme le cas de la première.** Ce module
 * ne lève rien: il RETROUVE la ligne, DIT d'où elle vient, et montre OÙ elle se
 * lève. C'est la forme retenue au §2.8 — de la navigation, pas de l'effet.
 *
 * ⚠️ ET LE GAIN RESTE ENTIER. Ce qui coûtait cher n'était pas le tap, c'était
 * *« d'arriver sur un écran de préférences et de devoir chercher où mettre la
 * chose »*. Ici on nomme la ligne exacte et sa cause: la personne sait ce
 * qu'elle va enlever avant d'y aller.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ AUCUN MATCHER MAISON — LE MOTEUR DU DÉPÔT, UTILISÉ COMME IL EST FAIT
 * ═══════════════════════════════════════════════════════════════════════════
 * Retrouver « poulet » dans « plus jamais de poulet le soir » est exactement le
 * travail de `findForbiddenMatches`: un TOKEN contre de la PROSE. Il échappe la
 * regex (`escapeRegex`), pose des frontières de mot par lookaround, et tolère
 * pluriels et séparateurs. C'est lui qui fait que **« lait » ne matche pas dans
 * « laitue »** — la cicatrice chiffrée du dépôt, 12 faux positifs sur 12.
 *
 * ⚠️ `allowNegatedMentions: false`, COMME LE COMPTEUR DE M7 ET POUR LA MÊME
 * RAISON. Une règle d'exclusion est écrite AU NÉGATIF (« plus jamais de
 * poulet »). En mode ceinture, la négation blanchit la mention et on ne
 * trouverait jamais la ligne qu'on cherche — un chercheur aveugle à ce qu'il
 * cherche.
 *
 * ⛔ ── ET LE MOT VIENT DU MODÈLE, PAS D'UNE RELECTURE DU MESSAGE ───────────
 * Ce module ne lit jamais la phrase de la personne. Il reçoit le mot que le
 * dispatcher a extrait — « poulet » — et le cherche dans les lignes STOCKÉES.
 * Reconnaître « pourquoi il n'y a jamais de X » sur du texte libre, dans deux
 * langues, demanderait le matcher que ce dépôt a mesuré faux.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire.
 */

import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";
import type { RetainedItem } from "./retained_item.ts";

/** Le signal du dispatcher, réduit à ce que cette règle regarde. */
export type RuleQuestionSignal = {
  readonly detected: boolean;
  /** LE MOT DE LA PERSONNE — « poulet ». Brut, jamais un slug. */
  readonly food?: string | null;
};

/**
 * UNE RÈGLE STOCKÉE, RÉDUITE À CE QU'IL FAUT POUR LA RETROUVER ET LA CITER.
 *
 * ⚠️ `quote` VIENT DU LOT M2, et c'est ce qui rend la réponse utile: dire *« tu
 * l'as demandé au bilan »* sans dire CE QU'ELLE A DIT laisse la personne devant
 * le même doute qu'avant. La citation est ce qui transforme « une règle existe »
 * en « voilà pourquoi, et tu peux la lever ».
 */
export interface StoredRule {
  readonly text: string;
  readonly source: RetainedItem["source"];
  readonly at: string;
  readonly quote: string | null;
}

export interface FoundRule extends StoredRule {
  /** Le mot qui a mordu, tel qu'il apparaît DANS la ligne. */
  readonly matched: string;
}

/**
 * LE MOT EST-IL EXPLOITABLE ?
 *
 * ⛔ UN MOT VIDE OU D'UNE SEULE LETTRE EST REFUSÉ. `tokenPattern("a")` matche
 * un « a » isolé dans n'importe quelle prose française: la personne recevrait
 * une règle qui n'a rien à voir, présentée comme la cause de son plan. Le
 * silence est la bonne réponse quand on ne sait pas de quoi le tour parlait.
 */
export function usableFoodWord(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (raw.length < 2) return null;
  // ⚠️ PLAFONNÉ. Le mot vient du modèle; une phrase entière passée comme
  // « aliment » ferait un motif qui ne matche rien et coûterait le balayage.
  return raw.slice(0, 60);
}

/**
 * LES RÈGLES QUE CETTE QUESTION RÉVOQUE.
 *
 * ⚠️ TOUTES, PAS LA PREMIÈRE. Quelqu'un peut avoir dit « plus de poulet le
 * soir » au bilan ET « pas de poulet du tout » sur un brouillon. N'en montrer
 * qu'une lui ferait enlever la mauvaise et croire que le produit ment quand le
 * poulet ne revient pas.
 *
 * ⛔ ET AUCUNE N'EST INVENTÉE: on ne rend que des lignes qui EXISTENT dans le
 * magasin, avec leur texte tel quel. C'est le même principe que l'appartenance
 * exacte aux titres de plats du bilan — la liste décide, la réponse ne fait que
 * la lire.
 */
export function rulesMentioning(args: {
  food: string;
  rules: readonly StoredRule[];
}): FoundRule[] {
  const food = usableFoodWord(args.food);
  if (!food) return [];
  const terms: readonly ForbiddenTerm[] = [{ ruleId: "asked", token: food }];
  const out: FoundRule[] = [];
  for (const rule of args.rules ?? []) {
    const text = String(rule?.text ?? "").trim();
    if (!text) continue;
    const hits = findForbiddenMatches(text, terms, {
      // ⛔ MODE AUDIT. Une règle d'exclusion est écrite au négatif; en mode
      // ceinture, la négation blanchit la mention et on ne trouverait jamais
      // la ligne qu'on cherche.
      allowNegatedMentions: false,
    });
    if (hits.length === 0) continue;
    out.push({ ...rule, text, matched: hits[0].matchedText });
  }
  return out;
}

// ===========================================================================
// LE CHARGEUR — la seule I/O de ce lot, et elle est PARESSEUSE
// ===========================================================================

/** Le strict minimum de client dont ce chargeur a besoin. */
export type MinimalRuleClient = {
  from: (table: string) => any;
};

/**
 * LES RÈGLES DE CETTE PERSONNE, LUES SEULEMENT QUAND ON EN A BESOIN.
 *
 * ⛔ PARESSEUX, ET C'EST LA DÉCISION DU LOT. La lane de conversation ne lisait
 * PAS `practical_constraints` — vérifié, aucune occurrence. Deux façons de le
 * changer:
 *   ① charger les règles à CHAQUE tour et les mettre dans le prompt, pour que
 *      le modèle puisse en nommer une. Coût: du budget de prompt sur tous les
 *      tours, pour servir un cas rare;
 *   ② ne charger QUE sur le tour où la question tombe, et chercher le mot du
 *      modèle dans les lignes stockées.
 *
 * ⇒ ②. Le mot suffit: `findForbiddenMatches` fait le reste, et il fait
 * exactement ce travail (un token contre de la prose) depuis le premier jour.
 *
 * ⛔ ET LA LECTURE EST SCOPÉE SUR `user_id`, en plus de RLS — cicatrice nommée:
 * *« RLS ne remplace pas un `.eq(user_id)` »*, une ligne d'élève rendue au
 * coach.
 *
 * ⚠️ FAIL-CLOSED VERS LE SILENCE. Une lecture en panne rend `[]`, donc aucune
 * phrase: le pire cas est une question sans réponse enrichie. L'inverse —
 * inventer une règle — dirait à quelqu'un qu'il a demandé une chose qu'il n'a
 * jamais demandée.
 */
export async function loadRulesFor(
  admin: MinimalRuleClient,
  userId: string,
): Promise<StoredRule[]> {
  const id = String(userId ?? "").trim();
  if (!admin || !id) return [];
  try {
    const { data, error } = await admin
      .from("student_goals")
      .select("practical_constraints")
      .eq("user_id", id)
      .maybeSingle();
    if (error || !data) return [];
    const pc = (data as Record<string, unknown>).practical_constraints;
    return rulesFrom(pc as Record<string, unknown> | null);
  } catch {
    return [];
  }
}

/**
 * LES DEUX MAGASINS, EN UNE SEULE LECTURE.
 *
 * ⚠️ LES DEUX, PARCE QUE LES DEUX SERVENT LE PROMPT. Une règle peut venir du
 * magasin structuré (`retained_items`, avec sa citation depuis M2) ou de
 * l'ancienne liste plate (`food_preferences`, sans citation). N'en lire qu'un
 * ferait répondre « tu n'as rien demandé » à quelqu'un dont la règle est dans
 * l'autre — et c'est le pire mensonge possible ici, puisqu'il porte sur ce que
 * la personne a elle-même dit.
 *
 * ⛔ LES PHRASES PLATES N'ONT PAS DE CITATION, ET ON NE LEUR EN INVENTE PAS.
 * `quote: null` se rend « telle quelle », sans cause: c'est le §7 de la
 * nomenclature — elles se lisent, elles ne se devinent pas.
 */
export function rulesFrom(
  pc: Record<string, unknown> | null | undefined,
): StoredRule[] {
  const out: StoredRule[] = [];
  const constraints = pc ?? {};

  const structured = constraints["retained_items"];
  if (Array.isArray(structured)) {
    for (const row of structured) {
      const item = row && typeof row === "object" && !Array.isArray(row)
        ? row as Record<string, unknown>
        : null;
      if (!item) continue;
      const kind = String(item.kind ?? "");
      // ⛔ SEULEMENT LES FAMILLES QUI EXCLUENT OU PRÉFÈRENT UN ALIMENT. Une
      // ligne de logistique ou de rythme ne « fait jamais apparaître » un
      // aliment: la citer répondrait à côté.
      if (kind !== "food.exclude" && kind !== "food.prefer") continue;
      const text = String(item.text ?? "").trim();
      if (!text) continue;
      const quote = String(item.quote ?? "").trim();
      out.push({
        text,
        source: (String(item.source ?? "written")) as StoredRule["source"],
        at: String(item.at ?? ""),
        quote: quote || null,
      });
    }
  }

  const flat = constraints["food_preferences"];
  if (Array.isArray(flat)) {
    for (const row of flat) {
      const text = String(row ?? "").trim();
      if (!text) continue;
      out.push({ text, source: "written", at: "", quote: null });
    }
  }
  return out;
}

// ===========================================================================
// ⛔ CE QUE LE MODÈLE DOIT SAVOIR AVANT DE COMPOSER — et pourquoi ça existe
// ===========================================================================

/**
 * LA RÈGLE, DITE AU MODÈLE AVANT QU'IL RÉPONDE.
 *
 * ⛔ MESURÉ SUR DES TOURS RÉELS, 2 ARMEMENTS SUR 2. La phrase visible marchait
 * — elle citait la ligne stockée mot pour mot — et la réponse se contredisait
 * quand même:
 *
 *   > *« Because fennel probably hasn't been put in the meal options you're
 *   > being given, NOT BECAUSE IT'S BLOCKED HERE. »*
 *   > puis, collé dessous: *« It comes from one line you have: "L3C — no
 *   > fennel, from the conversation". »*
 *
 * La cause n'est pas un caprice du modèle: la lane de conversation ne lit pas
 * `practical_constraints` (c'est écrit dans `run.ts`, et le grep le confirme).
 * Le modèle ne pouvait que DEVINER, et il devinait le contraire de ce que
 * `appendRedirect` allait coller après lui.
 *
 * ⇒ **Une annotation ne se rattache pas à un texte par la proximité.** C'est la
 * cicatrice `portion-note-contradicts-the-lid`, à un autre étage: dès que le
 * modèle a une opinion sur le même sujet, l'information doit entrer AVANT la
 * génération, jamais après.
 *
 * ⚠️ ET ÇA NE ROUVRE PAS LA DÉCISION ② DU DESIGN. Ce qu'elle refusait, c'était
 * de charger les règles à CHAQUE tour pour servir un cas rare. Ici le
 * chargement est déjà paresseux et a DÉJÀ eu lieu sur ce tour-là: le bloc ne
 * coûte que les octets de prompt du tour où la question tombe.
 *
 * ⛔ ── CE BLOC N'EST PAS UNE PHRASE VISIBLE ────────────────────────────────
 * Il part dans `injectedContext`, pas dans la réponse. Il n'est donc **pas**
 * relu par `FORBIDDEN_STORAGE_CLAIMS` / `allRedirectSentences()`, qui gardent
 * la FORMULATION de ce qu'on dit à la personne. Ne l'y ajoute pas: la garde de
 * M1 interdit « je garde ça », ce qui n'a aucun sens pour une consigne interne.
 *
 * ⚠️ MÊME LISTE QUE LA PHRASE VISIBLE, TOUJOURS. Rendre ici un sous-ensemble
 * (ou un sur-ensemble) recréerait exactement le défaut qu'on répare: deux
 * textes du même tour qui ne parlent pas des mêmes lignes.
 *
 * PURE: aucun I/O, aucune horloge.
 */
export function ruleQuestionContextBlock(args: {
  rules: readonly { text: string }[];
  isKeelStudent: boolean;
}): string | null {
  // ⚠️ LES DEUX MÊMES PORTES QUE `ruleQuestionRedirectFor`, dans le même ordre.
  // Si l'une s'ouvre sans l'autre, le modèle est instruit d'une règle que la
  // phrase ne nommera pas — ou l'inverse.
  if (args.isKeelStudent !== true) return null;
  const rules = (args.rules ?? []).filter((r) => String(r?.text ?? "").trim());
  if (rules.length === 0) return null;
  return [
    "=== CE QUI EXCLUT CET ALIMENT (source structuree, autorite de ce tour) ===",
    "La personne demande pourquoi un aliment n'apparait jamais. La reponse est CONNUE et elle est ici: une ligne qu'elle a elle-meme posee l'exclut.",
    "La ou les lignes, telles qu'elles sont ecrites:",
    ...rules.map((r) => `- « ${String(r.text).trim()} »`),
    // ⛔ ON NOMME L'ÉCHAPPATOIRE, avec les mots exacts que le modèle a produits
    // en vrai. Une interdiction vague (« ne suppose rien ») laisse intacte la
    // formulation qu'on a mesurée.
    "⛔ N'INVENTE AUCUNE AUTRE CAUSE. Ne dis pas que l'aliment manque « parce qu'il n'est pas dans les options », « parce que le plan ne le pioche pas », ni surtout « pas parce qu'il serait bloque »: c'est FAUX, et une phrase ajoutee apres ta reponse dira le contraire de toi.",
    // ⛔ LE SECOND DÉFAUT MESURÉ, CELUI QUE CE BLOC A LUI-MÊME CRÉÉ. Dire la
    // ligne au modèle le fait la CITER — et la phrase ajoutée la cite aussi,
    // mot pour mot. La réponse bégayait. La ligne reste portée par la phrase
    // déterministe (c'est le plancher: elle sort même si le modèle dérape); le
    // modèle, lui, se tait dessus.
    "⛔ NE CITE PAS CETTE LIGNE, ne la recopie pas, ne la reformule pas: la phrase ajoutee apres ta reponse la donne deja mot pour mot, avec sa cause. La redire ferait begayer la reponse.",
    "⛔ N'EXPLIQUE PAS COMMENT L'ENLEVER et ne propose pas de le faire: cette meme phrase ajoutee s'en charge deja.",
    "Dis donc SEULEMENT, en une clause, que c'est voulu et que ca vient d'une exclusion posee par la personne elle-meme — sans la nommer. Puis reponds au reste du message s'il y a un reste.",
  ].join("\n");
}
