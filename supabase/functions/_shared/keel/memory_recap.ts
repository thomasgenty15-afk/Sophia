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

/**
 * Une ligne de mémoire souple écrite aujourd'hui.
 *
 * ⟳ LOT D (2026-09-03) — ELLE PORTE MAINTENANT SA DESTINATION ET SA BOUCHE.
 *
 * Le récap n'annonçait QUE l'encart (`retained_next_plan`). Or les deux sources
 * du modèle écrivent aussi une PRÉFÉRENCE durable et une NOTE — et le modèle
 * dit, en toutes lettres, qu'on retient ET qu'on le dit. Une préférence écrite
 * en silence est exactement le magasin invisible que ce chantier ferme.
 *
 * ⚠️ ET LE SUJET, PARCE QU'IL CHANGE LE SENS. « J'ai noté : pas de poisson » et
 * « J'ai noté pour Tom : pas de poisson » ne disent pas la même chose à un
 * foyer de trois personnes; la première se lit comme une règle de table.
 */
export interface RecapKept {
  readonly text: string;
  /** Le dernier jour où elle vit, ou `null` — l'encart ne meurt plus par date. */
  readonly until: string | null;
  /**
   * Où c'est rangé. Vocabulaire FERMÉ.
   *
   * ⟳ 2026-09-04 — `setting` REJOINT LES TROIS. Le bilan bouge aussi des
   * RÉGLAGES (la difficulté des recettes, le temps de cuisine, la variété), et
   * ils étaient les seuls écrits de ce produit qui ne se disaient nulle part:
   * ni sur la carte au moment du geste, ni ici. Un curseur qui bouge sans un
   * mot est exactement ce que « on retient, et on le dit » existe pour empêcher.
   *
   * ⚠️ IL RESTE UNE DESTINATION À PART, avec sa propre phrase: un réglage n'est
   * pas une chose que Sophia SAIT de la personne, c'est un curseur qu'elle a
   * bougé à cause d'une réponse. Les fondre dirait le contraire du modèle.
   */
  readonly kind: "preference" | "note" | "next_plan" | "setting";
  /** Le prénom de la bouche, ou `null` = toute la table. */
  readonly who: string | null;
  /**
   * ⟳ 2026-09-06 — LE SENS DE LA LIGNE, EN MOTS. Mesuré (cas Léa/Marc) : « Léa :
   * « les asperges » · Marc : « les asperges » » — la note était classée juste
   * (exclusion chez Léa, préférence chez Marc) et l'accusé ne disait pas qui
   * veut et qui ne veut pas. La famille retenue (`RetainedKind`) est rendue en
   * mots avant la citation ; `null`/absent = comme avant (une note, un réglage).
   */
  readonly sense?: string | null;
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
    // ⟳ 2026-09-05 — l'écriture qui a ÉCHOUÉ se dit aussi. Sans cette phrase,
    // une allergie d'enfant refusée par la base était un chiffre dans un
    // journal, et la personne croyait Sophia prévenue.
    notWritten: (what: string) =>
      `Je n'ai pas pu enregistrer ${what}. Ajoute-le depuis la fiche du foyer, pour que j'en tienne compte.`,
    keptOne: "J'ai aussi gardé ça de ton retour :",
    until: (day: string) => `jusqu'au ${day}`,
    quote: (t: string) => `« ${t} »`,
    // ⟳ LOT D — LES TROIS DESTINATIONS SE NOMMENT. Un seul « j'ai gardé ça »
    // pour trois magasins laissait la personne sans moyen de savoir OÙ aller
    // le corriger — et la carte a trois blocs distincts.
    keptPreference: "J'ai noté ce que tu veux (ou pas) dans l'assiette :",
    keptNote: "J'ai retenu ça :",
    keptSetting: "J'ai ajusté un réglage :",
    keptFor: (who: string) => ` pour ${who}`,
    senses: {
      "food.exclude": "à éviter",
      "food.prefer": "à servir plus souvent",
      "method.avoid": "pas préparé comme ça",
      "method.prefer": "plutôt préparé comme ça",
      "portion.adjust": "la part",
      craving: "une envie",
    } as Record<string, string>,
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
    notWritten: (what: string) =>
      `I could not save ${what}. Add it from the household page so I can take it into account.`,
    keptOne: "I've also kept this from your feedback:",
    keptPreference: "I've noted what you do (and don't) want on the plate:",
    keptNote: "I've kept this:",
    keptSetting: "I've adjusted a setting:",
    keptFor: (who: string) => ` for ${who}`,
    until: (day: string) => `until ${day}`,
    // ⚠️ LES GUILLEMETS SUIVENT LA LANGUE. Ils étaient en dur en français des
    // deux côtés — une ligne anglaise citée « comme ça » se lit comme un
    // copier-coller raté, sur le message qui annonce une allergie.
    quote: (t: string) => `\u201c${t}\u201d`,
    senses: {
      "food.exclude": "to avoid",
      "food.prefer": "to serve more often",
      "method.avoid": "not cooked that way",
      "method.prefer": "rather cooked that way",
      "portion.adjust": "the portion",
      craving: "a craving",
    } as Record<string, string>,
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
  // ⚠️ UN BLOC PAR DESTINATION, DANS L'ORDRE DE LA CARTE. Fondre les trois
  // sous « j'ai gardé ça » laissait la personne sans moyen de savoir OÙ aller
  // le corriger; la carte a trois blocs, le message en a trois.
  //
  // ⛔ L'ORDRE EST CELUI DE `KNOWN_BLOCKS` CÔTÉ FRONT, et ce n'est pas une
  // coquetterie: le message renvoie vers l'écran, et deux ordres différents
  // pour les mêmes trois choses se lisent comme deux listes différentes.
  const INTRO = {
    preference: copy.keptPreference,
    note: copy.keptNote,
    setting: copy.keptSetting,
    next_plan: copy.keptOne,
  } as const;
  // ⚠️ LES RÉGLAGES EN DERNIER DES TROIS DURABLES, avant l'encart: ce sont les
  // lignes les moins « à propos d'elle » du message, et les mettre devant
  // ferait passer un curseur avant un goût.
  for (
    const destination of ["preference", "note", "setting", "next_plan"] as const
  ) {
    const rows = kept.filter((k) => k.kind === destination);
    if (rows.length === 0) continue;
    const lines = rows.map((k) => {
      const text = String(k.text).trim();
      const until = String(k.until ?? "").trim();
      const who = String(k.who ?? "").trim();
      // ⚠️ LE SUJET COLLE À LA LIGNE, PAS À L'INTRO: deux bouches peuvent
      // apparaître dans le même bloc, et une intro « pour Tom » suivie d'une
      // ligne qui parle de Léa serait un fait faux, pas une approximation.
      const head = who ? `· ${who} :` : "·";
      // ⟳ 2026-09-06 — le sens avant la citation : « Léa : à éviter — « les
      // asperges » · Marc : à servir plus souvent — « les asperges » ». Un sens
      // inconnu ne fabrique pas de mot (même règle que `kinds`).
      const sense = copy.senses[String(k.sense ?? "")] ?? "";
      const body = sense ? `${sense} — ${copy.quote(text)}` : copy.quote(text);
      // §6 de la nomenclature: « avec sa date d'expiration affichée ». Une
      // règle dont la date ne se voit pas se découvre morte un lundi matin.
      return until
        ? `${head} ${body} (${copy.until(until)})`
        : `${head} ${body}`;
    });
    blocks.push([INTRO[destination], ...lines].join("\n"));
  }

  return blocks.length === 0 ? null : blocks.join("\n\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// LA LIGNE D'UN RÉGLAGE QUI A BOUGÉ (2026-09-04)
// ═══════════════════════════════════════════════════════════════════════════
//
// Le bilan déplace des curseurs — la difficulté des recettes, le temps de
// cuisine, la variété — et jusqu'ici c'étaient les SEULES écritures du produit
// qui ne se disaient nulle part. Un curseur qui bouge sans un mot est
// exactement ce que « on retient, et on le dit » existe pour empêcher.
//
// ⛔ LES MÊMES MOTS QUE LA CARTE (`known.field.*`). Le message dit « ce qui
// vient de changer » et son bouton mène à l'écran: si le champ y porte un autre
// nom, la personne ne peut pas faire le lien, et le bouton devient une porte
// vers une page où elle ne retrouve rien.

/** Le nom d'un champ, dans les deux langues — miroir de `FIELD_TITLE`. */
const FIELD_TITLE: Readonly<Record<string, { fr: string; en: string }>> = {
  cook_days: { fr: "Jours de cuisine", en: "Cooking days" },
  cooking_time_min: { fr: "Temps de cuisine", en: "Cooking time" },
  budget_amount: { fr: "Budget", en: "Budget" },
  recipe_difficulty: { fr: "Difficulté des recettes", en: "Recipe difficulty" },
  variety: { fr: "Variété", en: "Variety" },
  eating_rhythm: { fr: "Rythme des repas", en: "Meal rhythm" },
  // ⟳ 2026-09-08 — LE DÉPLACEMENT LE PLUS FRÉQUENT DU BILAN, ENFIN NOMMÉ.
  //
  // ⛔ CE `null` N'ÉTAIT PAS UNE PRÉCAUTION ÉTERNELLE, c'était un FAIT daté:
  // « un bouton Voir qui mène sur un écran où la ligne n'est pas ». Vérifié
  // avant d'écrire cette ligne, et la prémisse est tombée: `CookingStyleField`
  // existe, `MealBuilder` le rend, et `onboarding.ts` en fait une étape
  // (`id: "cooking_style"`). Le champ a donc son écran.
  //
  // ⚠️ ET IL EST LE CAS MAJORITAIRE: dès qu'un style est déclaré, c'est LUI que
  // le bilan déplace, et `recipe_difficulty` / `variety` le suivent. Se taire
  // ici, c'était taire presque tous les déplacements (`field_not_announced`).
  cooking_style: { fr: "Style de cuisine", en: "Cooking style" },
  // ⟳ 2026-09-08 — L'APPÉTIT, déplacé d'un cran par une phrase de brouillon
  // (« ma mère ne mange pas autant »). Il a son écran — la fiche de la bouche,
  // que `mouthProfile` écrit — donc la garde du `null` n'a pas à jouer.
  //
  // ⚠️ IL NE VIT PAS DANS `practical_constraints` mais sur
  // `household_member_bodies`. Ça n'a aucune importance ICI: cette fonction dit
  // un champ, elle ne sait pas où il est rangé — et c'est ce qui lui permet de
  // servir les deux magasins sans en apprendre un second.
  appetite: { fr: "Appétit", en: "Appetite" },
};

/**
 * LA VALEUR D'UNE ÉCHELLE FERMÉE, DANS LA LANGUE DE QUI LIT.
 *
 * ⛔ SANS CETTE TABLE, LA PHRASE MÉLANGE DEUX LANGUES. `showFieldValue` rendait
 * `String(value)`, donc une carte française annonçait « Variété : de some à
 * varied ». C'était déjà vrai pour `variety` et `recipe_difficulty`; le rendre
 * vrai AUSSI sur le champ le plus fréquemment déplacé aurait fait du défaut la
 * règle plutôt que l'exception.
 *
 * ⚠️ LES TROIS VOCABULAIRES SONT AILLEURS, ET C'EST EUX QUI DÉCIDENT:
 * `COOKING_STYLES` (`cooking_plan.ts:46`), `RECIPE_DIFFICULTIES` et
 * `VARIETY_LEVELS` (`retained_item.ts:290` et `:294`). Un jeton qu'on ne
 * connaît pas retombe sur lui-même — jamais sur « rien », qui voudrait dire
 * l'absence.
 */
const FIELD_VALUE: Readonly<
  Record<string, Readonly<Record<string, { fr: string; en: string }>>>
> = {
  cooking_style: {
    minimal: { fr: "minimal", en: "minimal" },
    balanced: { fr: "équilibré", en: "balanced" },
    keen: { fr: "passionné", en: "keen" },
  },
  recipe_difficulty: {
    simple: { fr: "simple", en: "simple" },
    normal: { fr: "normale", en: "normal" },
    keen: { fr: "ambitieuse", en: "keen" },
  },
  variety: {
    repeat: { fr: "répétitive", en: "repetitive" },
    some: { fr: "un peu variée", en: "somewhat varied" },
    varied: { fr: "variée", en: "varied" },
  },
  // ⚠️ « moyen » ET PAS « normal » POUR `average`. Le cran du milieu est aussi
  // ce que rend une fiche muette; le dire « normal » ferait lire à quelqu'un
  // qu'on a jugé son appétit normal alors qu'on ne lui a jamais demandé.
  appetite: {
    small: { fr: "petit", en: "small" },
    average: { fr: "moyen", en: "average" },
    large: { fr: "grand", en: "large" },
  },
};

// ⟳ 2026-09-08 — L'ÉLISION, mesurée sur un vrai accusé: « de équilibré à
// minimal ». Depuis que les échelles se disent en français (`FIELD_VALUE`), le
// mot après « de » peut commencer par une voyelle — et une phrase qu'on lit à
// voix haute ne pardonne pas « de équilibré ».
const elideDe = (word: string): string =>
  /^[aeiouyàâäéèêëîïôöùûüh]/i.test(word) ? `d'${word}` : `de ${word}`;
const FIELD_MOVED = {
  fr: (previous: string, next: string) => `${elideDe(previous)} à ${next}`,
  en: (previous: string, next: string) => `from ${previous} to ${next}`,
} as const;

const FIELD_UNSET = { fr: "rien", en: "nothing" } as const;

/** `null` devient « rien », jamais « 0 »: l'absence n'est pas une déclaration. */
/**
 * LE LIBELLÉ D'UN JETON D'ÉCHELLE, ou `null` si ce champ n'est pas une échelle
 * fermée — ou si ce jeton n'y est pas.
 *
 * ⛔ EXPORTÉ POUR ÊTRE TESTABLE, et c'est la raison exacte. En ANGLAIS le
 * libellé est souvent le jeton lui-même (`balanced`, `keen`, `simple`): un test
 * qui vérifierait la couverture en lisant la PHRASE ne saurait pas distinguer
 * « libellé trouvé » de « jeton recraché par `String()` ». Il resterait vert
 * après l'ajout d'un quatrième cran sans libellé — c'est-à-dire qu'il
 * mesurerait l'état d'hier. Ici la couverture se demande, elle ne se devine pas.
 */
export function fieldValueLabel(
  field: string,
  value: unknown,
  language: RecapLanguage,
): string | null {
  if (value === null || value === undefined) return null;
  return FIELD_VALUE[field]?.[String(value)]?.[language] ?? null;
}

function showFieldValue(
  field: string,
  value: unknown,
  language: RecapLanguage,
): string {
  if (value === null || value === undefined) return FIELD_UNSET[language];
  // ⛔ AVANT LE TABLEAU ET AVANT `String()`: une échelle fermée se dit dans la
  // langue de qui lit. Un jeton inconnu tombe plus bas, sur lui-même.
  const known = fieldValueLabel(field, value, language);
  if (known !== null) return known;
  if (Array.isArray(value)) {
    return value.length === 0
      ? FIELD_UNSET[language]
      : value.map((entry) => String(entry)).join(", ");
  }
  return String(value);
}

/**
 * La ligne d'un réglage déplacé, ou `null` si ce champ n'a PAS de nom lisible.
 *
 * ⛔ `null` PLUTÔT QUE LE SLUG. Un champ que la carte ne sait pas afficher
 * enverrait la personne, bouton « Voir » à l'appui, sur un écran où sa ligne
 * n'est pas — pire que le silence, parce que ça lui apprend que le bouton ment.
 * L'appelant compte ce qu'il a tu (`field_not_announced`).
 *
 * ⟳ 2026-09-08 — L'EXEMPLE QUI VIVAIT ICI ÉTAIT `cooking_style`, ET IL N'EST
 * PLUS VRAI: le champ a son écran, donc son libellé. La règle, elle, tient —
 * c'est la liste qui a changé, pas la doctrine. Le prochain champ ajouté à
 * `WRITABLE_FIELDS` sans écran retombera sur ce `null`, et c'est voulu.
 */
export function settingRecapLine(
  change: { field: string; previous: unknown; next: unknown },
  language: RecapLanguage,
): string | null {
  const field = String(change.field ?? "");
  const title = FIELD_TITLE[field];
  if (!title) return null;
  const moved = FIELD_MOVED[language](
    showFieldValue(field, change.previous, language),
    showFieldValue(field, change.next, language),
  );
  // L'espace avant le deux-points suit la langue, comme partout ailleurs ici.
  const colon = language === "fr" ? " : " : ": ";
  return `${title[language]}${colon}${moved}`;
}


/**
 * ⟳ 2026-09-05 — CE QUI N'A PAS PU ÊTRE ÉCRIT EN SÉCURITÉ, dit à la personne.
 *
 * Même rendu par ligne que `buildMemoryRecap` (le genre, la bouche, le slug),
 * mais la phrase dit l'ÉCHEC et où réparer. `null` quand il n'y a rien à
 * dire — jamais une bulle vide.
 */
export function buildSafetyNotWrittenNotice(args: {
  failed: readonly RecapSafety[];
  language: RecapLanguage;
}): string | null {
  const copy = COPY[args.language] ?? COPY.en;
  const failed = (args.failed ?? []).filter((s) =>
    String(s?.ref ?? "").trim() !== ""
  );
  if (failed.length === 0) return null;
  const rendered = failed.map((s) => {
    const label = copy.kinds[String(s.kind ?? "")] ?? "";
    const ref = String(s.ref).trim();
    const who = String(s.who ?? "").trim();
    if (!label) return who ? `${who} : ${ref}` : ref;
    return who ? copy.safetyWho(who, label, ref) : copy.safetyMine(label, ref);
  });
  return copy.notWritten(rendered.join(" · "));
}
