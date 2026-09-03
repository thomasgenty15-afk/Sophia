/**
 * CE QUE J'AI RETENU AUJOURD'HUI — le récap du soir. PUR.
 *
 * Autorité produit : `docs/keel/NOMENCLATURE-MEMOIRE.md` §2 axe 1, encadré
 * « arbitrage du 2026-09-01 », et §6 (« avec sa date d'expiration affichée »).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ CE N'EST PAS UNE COMMODITÉ — C'EST LA MOITIÉ D'UN ARBITRAGE DE SÉCURITÉ
 * ═══════════════════════════════════════════════════════════════════════════
 * Le 2026-09-01, le produit a cessé d'exiger un consentement synchrone pour
 * écrire une allergie déclarée sur un retour de plan. Ce qui remplace ce
 * consentement, mot pour mot :
 *
 *   « on l'écrit, on le DIT, et ça se défait en un geste »
 *
 * Ce module est le **on le DIT**. Sans lui, l'arbitrage n'existe plus et
 * l'écriture redevient une contrainte médicale posée dans le dos de quelqu'un.
 * Un lot qui retirerait ce récap doit retirer l'écriture avec.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ UN ÉNONCÉ, PAS UNE DEMANDE — ET C'EST CE QUI L'AUTORISE
 * ═══════════════════════════════════════════════════════════════════════════
 * T4 borne les **demandes** à une par jour, toutes surfaces confondues
 * (`DAILY_ASK_BUDGET = 1`, et `DAILY_ASK_KINDS` ne contient que des questions).
 * Ce récap ne demande rien : il rend compte. Il ne consomme donc pas le budget,
 * et il ne doit JAMAIS être écrit au registre des demandes.
 *
 * ⚠️ Il ne porte non plus AUCUN bouton. Un bouton de retrait ici rouvrirait
 * « le chat écrit », que le §2.8 ferme : *« s'il peut écrire une allergie en un
 * tap, pourquoi pas un aliment évité ? »*. Le retrait vit sur SON écran, qui
 * existe déjà (`StudentHealthPage`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ LA SÉCURITÉ D'ABORD, ET SÉPARÉE DES GOÛTS
 * ═══════════════════════════════════════════════════════════════════════════
 * Une allergie enregistrée et une envie de fajitas ne se lisent pas de la même
 * façon. Les mélanger dans une liste ferait glisser l'œil sur la seule ligne
 * qu'il fallait vérifier.
 *
 * PURE MODULE : aucun I/O, aucune horloge, aucun aléatoire.
 */

export type RecapLanguage = "fr" | "en";

/** Une contrainte de sécurité écrite aujourd'hui. */
export interface RecapSafety {
  /** `allergy` | `intolerance` | `medical` | `religious` | `diet`. */
  readonly kind: string;
  /** Le slug — il est rendu tel quel, jamais traduit. */
  readonly ref: string;
  /** Le prénom de la bouche, ou `null` = la personne à qui on parle. */
  readonly who: string | null;
}

/** Une ligne de mémoire souple écrite aujourd'hui. */
export interface RecapKept {
  readonly text: string;
  /** Le dernier jour où elle vit (`ancre + 6`), ou `null` si durable. */
  readonly until: string | null;
}

const COPY = {
  fr: {
    safetyOne: (what: string) => `J'ai noté ${what}.`,
    safetyMine: (kind: string, ref: string) => `${kind} : ${ref}`,
    safetyWho: (who: string, kind: string, ref: string) => `${kind} de ${who} : ${ref}`,
    kinds: {
      allergy: "une allergie",
      intolerance: "une intolérance",
      medical: "une condition médicale",
      religious: "une règle alimentaire",
      diet: "un régime",
    } as Record<string, string>,
    undo: "Si je me suis trompée, tu peux l'enlever dans ta fiche santé.",
    undoMany: "Si je me suis trompée, tu peux les enlever dans ta fiche santé.",
    keptOne: "J'ai aussi gardé ça de ton retour :",
    until: (day: string) => `jusqu'au ${day}`,
    quote: (t: string) => `« ${t} »`,
  },
  en: {
    safetyOne: (what: string) => `I've recorded ${what}.`,
    safetyMine: (kind: string, ref: string) => `${kind}: ${ref}`,
    safetyWho: (who: string, kind: string, ref: string) => `${who}'s ${kind}: ${ref}`,
    kinds: {
      allergy: "an allergy",
      intolerance: "an intolerance",
      medical: "a medical condition",
      religious: "a dietary rule",
      diet: "a diet",
    } as Record<string, string>,
    undo: "If I got that wrong, you can remove it in your health details.",
    undoMany: "If I got those wrong, you can remove them in your health details.",
    keptOne: "I've also kept this from your feedback:",
    until: (day: string) => `until ${day}`,
    // ⚠️ LES GUILLEMETS SUIVENT LA LANGUE. Ils étaient en dur en français des
    // deux côtés — une ligne anglaise citée « comme ça » se lit comme un
    // copier-coller raté, sur le message qui annonce une allergie.
    quote: (t: string) => `\u201c${t}\u201d`,
  },
} as const;

/**
 * LE RÉCAP, ou `null` QUAND IL N'Y A RIEN À DIRE.
 *
 * ⛔ `null` EST LE CAS NORMAL. La quasi-totalité des soirs n'a rien retenu, et
 * un récap vide (« je n'ai rien noté aujourd'hui ») serait une ligne de plus
 * dans un message que T4 protège justement de l'encombrement.
 *
 * ⚠️ LA SÉCURITÉ SORT MÊME QUAND ELLE EST SEULE, et c'est le point: prévenir
 * de l'enregistrement d'une allergie ne peut pas dépendre du fait qu'il y ait
 * eu autre chose à dire ce soir-là.
 */
export function buildMemoryRecap(args: {
  safety: readonly RecapSafety[];
  kept: readonly RecapKept[];
  language: RecapLanguage;
}): string | null {
  const copy = COPY[args.language] ?? COPY.en;
  const blocks: string[] = [];

  const safety = (args.safety ?? []).filter((s) =>
    String(s?.ref ?? "").trim() !== ""
  );
  if (safety.length > 0) {
    const rendered = safety.map((s) => {
      // ⚠️ UN `kind` INCONNU NE FABRIQUE PAS DE PHRASE. On rend le slug seul
      // plutôt qu'un libellé inventé: mieux vaut « j'ai noté : peanut » que
      // « j'ai noté une <kind> : peanut », qui se lirait comme un bug et
      // ferait douter du reste du message — celui qui porte une allergie.
      const label = copy.kinds[String(s.kind ?? "")] ?? "";
      const ref = String(s.ref).trim();
      const who = String(s.who ?? "").trim();
      if (!label) return who ? `${who} : ${ref}` : ref;
      return who
        ? copy.safetyWho(who, label, ref)
        : copy.safetyMine(label, ref);
    });
    blocks.push(
      `${copy.safetyOne(rendered.join(" · "))} ${
        safety.length > 1 ? copy.undoMany : copy.undo
      }`,
    );
  }

  const kept = (args.kept ?? []).filter((k) => String(k?.text ?? "").trim() !== "");
  if (kept.length > 0) {
    const lines = kept.map((k) => {
      const text = String(k.text).trim();
      const until = String(k.until ?? "").trim();
      // §6 de la nomenclature: « avec sa date d'expiration affichée ». Une
      // règle dont la date ne se voit pas se découvre morte un lundi matin.
      return until
        ? `· ${copy.quote(text)} (${copy.until(until)})`
        : `· ${copy.quote(text)}`;
    });
    blocks.push([copy.keptOne, ...lines].join("\n"));
  }

  return blocks.length === 0 ? null : blocks.join("\n\n");
}
