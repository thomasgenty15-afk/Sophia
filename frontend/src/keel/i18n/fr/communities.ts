// Pack français — le namespace `communities`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `communities.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frCommunities = {
  // ── COMMUNITIES — la page des communautés (`/communities`) ──────────────
  //
  // REGISTRE: `/communities` VOUVOIE (`fr.ts`, en-tête « LE REGISTRE, ET LÀ OÙ IL
  // BASCULE »). Les gens que le lecteur accompagne sont des MEMBRES — « élève »
  // est le mot de `/coaches` seulement.
  //
  // ⚠️ Ce n'est PAS un calque. Les tournures anglaises ont un rythme qui ne
  // survit pas à la traduction mot à mot.
  //
  // COMPOSITION: apostrophe typographique ’ (U+2019), espace insécable U+00A0
  // avant : ; ! ? » € % et après «. ⛔ JAMAIS U+202F (sans glyphe dans les deux
  // polices). ⛔ Pas de → (U+2192): il n'existe dans aucune des deux familles.
  "communities.seo_title":
    "Sophia pour les communautés payantes — la réponse qu’un fil ne donne pas",
  "communities.seo_description":
    "Une communauté est un fil : vous répondez en public, et aucun membre n’a de réponse à lui. Sophia est la couche du dessous — chaque membre du palier coaché a son espace, sa semaine et ses réponses, composés à partir de votre méthode. 7 € par membre et par mois.",

  // ── BANDE 1 · DOULEUR 01 — un fil n'a pas de destinataire ────────────────
  "communities.hero.kicker": "Pour ceux qui tiennent une communauté payante",
  "communities.hero.title": "Une communauté est un fil. Un fil ne répond pas à une personne.",
  "communities.hero.lede":
    "Aucune heure de plus n’y changera rien : c’est la forme même de ce que vous avez construit. Sophia est la couche du dessous — chaque membre du palier coaché a son espace, sa semaine et ses réponses, tirés de votre méthode.",
  "communities.hero.cta": "Commencer l’essai de 14 jours",
  "communities.hero.note":
    "14 jours, 3 membres au plus, puis ça s’arrête tout seul. Vos membres entrent par une invitation e-mail envoyée depuis votre espace, et rien ne vous revient sous forme de boîte de réception.",
  "communities.hero.signin_prompt": "Déjà sur Sophia ?",
  "communities.hero.signin_link": "Se connecter",

  "communities.fig_lane.label": "UNE QUESTION, DEUX DESTINATIONS",
  "communities.fig_lane.alt_title": "Une réponse pour tous, ou une réponse à chacun",
  "communities.fig_lane.alt_desc":
    "Les mêmes quatre membres, dessinés deux fois. À gauche, un seul trait les ouvre tous les quatre : c’est une réponse publique, écrite pour convenir à tout le monde. À droite, un trait chacun.",
  "communities.fig_lane.thread_label": "DANS LE FIL",
  "communities.fig_lane.tier_label": "SUR LE PALIER COACHÉ",
  "communities.fig_lane.thread_caption": "une réponse pour tout le monde",
  "communities.fig_lane.tier_caption": "une réponse à chacun",

  "communities.tier.title":
    "Un palier au-dessus de ce que vous vendez déjà. Rien ne bouge en dessous.",
  "communities.tier.body":
    "Même plateforme, même prix d’entrée, mêmes publications, mêmes gens. Au-dessus, vous ouvrez une option de plus : tout ce qu’ils ont déjà, et une ligne à eux dans votre méthode. Ceux qui en veulent montent ; les autres ne s’aperçoivent jamais qu’elle existe.",
  "communities.tier.example":
    "Un exemple chiffré. Cinq cents membres, trois sur dix prennent le palier : 150 × 12 €, moins 150 sièges à 7 €. Environ 750 € par mois, sur des gens dont vous avez déjà payé l’acquisition.",
  "communities.tier.example_caption":
    "Votre prix et votre taux de passage décident de ce total, et ces deux-là sont à vous. Le 7 € n’est pas une estimation, et il ne porte que sur les membres qui montent.",
  "communities.tier.reserve":
    "Aucune intégration Skool, Circle, Discord ou Kajabi — aucune, et vous préférez l’apprendre ici plutôt que le premier jour. Vous continuez d’encaisser vos membres là où vous le faites déjà : le produit ne demande jamais un paiement à un membre. Et les chiffres d’énergie sont éteints par défaut sur son compte.",

  "communities.fig_tier.label": "LA MÊME OFFRE, ET UNE BANDE DE PLUS",
  "communities.fig_tier.alt_title":
    "Le palier se pose au-dessus, l’offre du dessous ne bouge pas",
  "communities.fig_tier.alt_desc":
    "Deux fois la même offre, dessinée par un seul élément appelé deux fois. Celle du dessus porte une bande de plus : une ligne à eux. Rien d’autre ne change.",
  "communities.fig_tier.band": "une ligne à lui, chaque jour",
  "communities.fig_tier.tier_label": "LE PALIER COACHÉ",
  "communities.fig_tier.tier_value": "41 €",
  "communities.fig_tier.base_label": "VOTRE COMMUNAUTÉ",
  "communities.fig_tier.base_value": "29 €",
  "communities.fig_tier.cost_label": "VOTRE COÛT",
  "communities.fig_tier.cost_value": "7 €",

  // ── BANDE 2 · DOULEUR 02 — si un agent répond, plus personne ne se répond ─
  "communities.layer.kicker": "Ce à quoi Sophia ne touche pas",
  "communities.layer.title": "Gardez les pairs. Ajoutez ce qu’un groupe n’allait jamais faire.",
  "communities.layer.body":
    "Vos membres ne se voient jamais entre eux dans Sophia : pas de fil, pas de salon, pas de commentaire. Sophia ne peut pas devenir l’endroit où vos gens se retrouvent, parce qu’il n’y a pas d’endroit de ce genre dans Sophia. Ce qu’un groupe ne sait pas faire, c’est répondre à une personne, à 21 h, sur le dîner qu’elle a devant elle.",
  "communities.layer.figure_caption":
    "C’est l’absence qui fait la garantie : il n’y a nulle part, dans Sophia, où votre communauté pourrait déménager.",

  "communities.fig_layer.label": "LÀ OÙ ILS SE PARLENT, ET LÀ OÙ NON",
  "communities.fig_layer.alt_title": "La communauté au-dessus, une ligne à chacun en dessous",
  "communities.fig_layer.alt_desc":
    "Quatre membres. Au-dessus du trait, chacun est relié à tous les autres : c’est votre communauté, et Sophia n’y touche pas. En dessous, chacun descend dans sa ligne, et rien ne relie une ligne à une autre.",
  "communities.fig_layer.community_label": "VOTRE COMMUNAUTÉ",
  "communities.fig_layer.sophia_label": "DANS SOPHIA",
  "communities.fig_layer.absence": "pas de fil, pas de salon, pas de commentaire",

  // ── BANDE 3 · DOULEUR 03 — un modèle lisse ma voix ───────────────────────
  "communities.voice.kicker": "Votre voix est l’actif",
  "communities.voice.title":
    "Sophia répond avec vos mots. Pas avec les siens, et pas dans un style maison.",
  "communities.voice.body":
    "Vos membres reconnaissent votre écriture au premier coup d’œil, au milieu de n’importe quel contenu santé — et cette reconnaissance est l’essentiel de ce qu’ils paient. Sophia n’a donc pas de personnalité à elle : elle prend la vôtre — vos mots, vos positions, et ce que vous dites à la place de ce que vous ne recommandez pas.",
  // ⚠️ FORMULATION B8b, MOT POUR MOT.
  "communities.voice.lock":
    "Votre méthode entre dans le chat, dans chaque semaine et dans chaque repas que Sophia rédige ; et ce qu’elle écrit dans le chat est relu contre vos lignes rouges avant d’être envoyé — sans modèle dans cette boucle.",
  "communities.voice.close":
    "Votre membre ne reçoit jamais un refus, et jamais un « demandez dans le groupe ».",

  "communities.fig_lock.label": "UN MESSAGE, RELU",
  "communities.fig_lock.alt_title": "Ce qui a été retenu, et ce qui est parti",
  "communities.fig_lock.alt_desc":
    "Trois temps, de haut en bas : la question d’un membre, le brouillon retenu parce qu’il contredit une ligne rouge, et le message réellement envoyé — la phrase que vous avez écrite à la place. Seul le troisième est reçu.",
  "communities.fig_lock.ask_label": "UN MEMBRE DEMANDE",
  "communities.fig_lock.ask_value": "Je peux ajouter une collation entre midi et le dîner ?",
  "communities.fig_lock.draft_label": "LE BROUILLON DISAIT",
  "communities.fig_lock.draft_value": "Une petite collation l’après-midi peut aider.",
  "communities.fig_lock.held": "retenu",
  "communities.fig_lock.sent_label": "CE QUI EST PARTI",
  "communities.fig_lock.sent_value1": "Trois vrais repas. Si tu as faim entre les deux,",
  "communities.fig_lock.sent_value2": "c’est que le repas d’avant était trop petit.",
  "communities.voice.figure_caption":
    "Ce remplacement n’est pas le nôtre. Chaque ligne rouge porte ce que vous dites à la place, dans vos mots, et il part signé de votre nom.",

  // ── BANDE 4 · LE PRIX ET LA CLÔTURE ──────────────────────────────────────
  "communities.pricing.kicker": "Le prix",
  "communities.pricing.title": "Une ligne, et seulement pour les membres qui montent.",
  "communities.pricing.seat_period": "par membre et par mois",
  "communities.pricing.seat_label":
    "Pas de forfait de plateforme. Pas de frais de mise en route. Rien d’autre.",
  "communities.pricing.annual": "6 € pour un siège payé à l’année.",
  "communities.pricing.why":
    "Vous payez les membres que vous avez mis sur le palier coaché, et vous arrêtez de payer le mois où vous éteignez un siège. Le reste de votre communauté ne vous coûte rien, parce qu’il n’est pas là.",
  // À CONSERVER VERBATIM (B31).
  "communities.pricing.no_number":
    "Nous n’avons pas de chiffre de rétention à vous vendre, et nous n’allons pas en inventer un. Le chiffre qui décide de tout ça est le vôtre : ce que vaut, à votre prix, un membre qui reste trois mois de plus.",
  "communities.pricing.trial_note": "14 jours, 3 membres au plus, puis ça s’arrête tout seul.",

  "communities.closing.title":
    "Vous avez déjà les membres, le prix et la méthode. Ce qu’un fil ne peut pas leur donner, c’est une réponse à eux.",
  "communities.closing.cta": "Commencer l’essai de 14 jours",
  "communities.closing.signin_prompt": "Déjà sur Sophia ?",
  "communities.closing.signin_link": "Se connecter",
} satisfies TranslatedMessagesOf<"communities">;
