// Seed anglais — le namespace `communities`, et lui seul.
// Assemblé dans `../en.ts`; une clé `communities.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enCommunities = {
  //
  // ── CE QUI A DISPARU DE CE NAMESPACE, ET POURQUOI ─────────────────────────
  // `communities.monday.*` + `communities.fig_monday.*` (24 clés): la page du
  // lundi appartient à `/gyms` (douleur 02) et au hall `/pro` (ligne 04), pas à
  // une page dont les trois douleurs sont le fil, la couche sociale et la voix.
  // `communities.fig_third_day.*` + `roles.figure_caption` (9): la relance à 72 h
  // est le même argument de rétention, donc la même ligne de grille.
  // `communities.fig_voice.*` (13): la maquette des champs de doctrine est
  // repliée dans la figure du verrou, qui montre ce que le MEMBRE reçoit.
  // `communities.tier.not*` (9): les quatre bornes tiennent en une phrase.
  // `communities.roles.*` devient `communities.layer.*`: « les rôles » nommait un
  // tableau à deux colonnes; la bande nomme désormais une STRUCTURE.
  "communities.seo_title": "Sophia for paid communities — the answer a thread can’t give",
  "communities.seo_description":
    "A community is a thread: you answer in public, and no member gets an answer of their own. Sophia is the layer underneath — each member on the coached tier gets their own space, their own week and their own answers, built from your method. €7 per member, per month.",

  // ── BANDE 1 · DOULEUR 01 — un fil n'a pas de destinataire ────────────────
  // Le titre nomme l'ARCHITECTURE, pas la fatigue. « Tu es débordé » est faux
  // et vaguement insultant pour quelqu'un qui tient 500 personnes ; « un fil ne
  // répond pas à une personne » est vrai, structurel, impossible à contester,
  // et c'est ce qu'il a déjà pensé sans l'avoir formulé.
  "communities.hero.kicker": "For owners of a paid community",
  "communities.hero.title": "A community is a thread. A thread can’t answer one person.",
  "communities.hero.lede":
    "No number of extra hours changes that: it is the shape of the thing you built. Sophia is the layer underneath — each member on the coached tier gets their own space, their own week and their own answers, out of your method.",
  "communities.hero.cta": "Start the 14-day trial",
  // Les trois faits qu'il vérifie en premier, dans l'ordre où ils le rassurent :
  // la porte est petite, l'entrée est simple, et rien ne lui retombe dessus.
  "communities.hero.note":
    "14 days, up to 3 members, then it stops on its own. Members come in by email invitation from your workspace, and nothing comes back to you as an inbox.",
  "communities.hero.signin_prompt": "Already using Sophia?",
  "communities.hero.signin_link": "Sign in",

  "communities.fig_lane.label": "ONE QUESTION, TWO DESTINATIONS",
  "communities.fig_lane.alt_title": "One answer for everybody, or an answer each",
  "communities.fig_lane.alt_desc":
    "The same four members, drawn twice. On the left one rule opens all four at once: a public answer, written to fit everyone. On the right, a rule each.",
  "communities.fig_lane.thread_label": "IN THE THREAD",
  "communities.fig_lane.tier_label": "ON THE COACHED TIER",
  "communities.fig_lane.thread_caption": "one answer, for everybody",
  "communities.fig_lane.tier_caption": "an answer of their own",

  // Le palier est la FORME COMMERCIALE de la même douleur, pas une seconde :
  // quelqu'un qui a 500 membres payants n'achète pas une migration, il achète
  // une ligne de plus sur sa page de vente, vendue à une base déjà payée.
  "communities.tier.title": "One tier above what you already sell. Nothing underneath moves.",
  "communities.tier.body":
    "Same platform, same entry price, same posts, same people. Above them you open one more option: everything they already have, plus a lane of their own in your method. The members who want it upgrade; the others never notice it exists.",
  // L'arithmétique, à revérifier si l'un de ces nombres bouge :
  //   500 membres × 30 % = 150   |   écart 41 − 29 = 12 €
  //   150 × 12 € = 1 800 €   |   150 × 7 € = 1 050 €   |   1 800 − 1 050 = 750 €
  // L'écart est de 12 € et pas de 30 : on ne demande pas à un membre de doubler
  // sa dépense pour ajouter une couche, et un écart qu'il ne croit pas
  // discrédite le reste de la page — y compris ce qui est vrai.
  "communities.tier.example":
    "A worked example. Five hundred members, three in ten take the tier: 150 × €12, minus 150 seats at €7. About €750 a month, on people whose acquisition you have already paid for.",
  "communities.tier.example_caption":
    "Your price and your take-up decide that total, and both are yours. The €7 is not an estimate, and it only ever applies to the members who upgrade.",
  // Les quatre bornes de l'ancienne page, en une phrase. Un « non » découvert
  // après le chiffre annule le chiffre, donc elles restent AVANT le prix.
  // ⚠️ On ne compte pas les gardes à voix haute : le brief en annonce quatre,
  // l'audit cinq selon ce qu'on garde, et un chiffre sans source unique n'entre
  // pas sur une page.
  "communities.tier.reserve":
    "No Skool, Circle, Discord or Kajabi integration — none, and you would rather know it here than on day one. You keep charging your members where you already do: there is no member checkout in the product. And energy numbers are off by default on a member’s account.",

  "communities.fig_tier.label": "THE SAME OFFER, PLUS ONE BAND",
  "communities.fig_tier.alt_title": "The tier sits on top; the offer underneath does not move",
  "communities.fig_tier.alt_desc":
    "The same offer drawn twice, from a single element used twice over. The upper one carries one extra band: a lane of their own. Nothing else changes.",
  "communities.fig_tier.band": "a lane of their own, every day",
  "communities.fig_tier.tier_label": "THE COACHED TIER",
  "communities.fig_tier.tier_value": "€41",
  "communities.fig_tier.base_label": "YOUR COMMUNITY",
  "communities.fig_tier.base_value": "€29",
  "communities.fig_tier.cost_label": "YOUR COST",
  "communities.fig_tier.cost_value": "€7",

  // ── BANDE 2 · DOULEUR 02 — si un agent répond, plus personne ne se répond ─
  // Son objection n°1, rarement dite frontalement : l'IA menace précisément le
  // mécanisme qu'il facture. La réponse n'est pas une promesse, c'est une
  // ABSENCE DE SURFACE. ⚠️ Jamais élargie en « personne ne partage jamais
  // d'espace » : le foyer en est un.
  "communities.layer.kicker": "What it does not touch",
  "communities.layer.title": "Keep the peers. Add the one thing a group was never going to do.",
  "communities.layer.body":
    "Your members never see each other in Sophia: no feed, no rooms, no comments. It cannot become the place your people gather, because there is no such place in it. What a group cannot do is answer one person, at 9pm, about the dinner in front of them.",
  "communities.layer.figure_caption":
    "The absence is the guarantee: there is nowhere in Sophia for your community to move to.",

  "communities.fig_layer.label": "WHERE THEY MEET, AND WHERE THEY DON’T",
  "communities.fig_layer.alt_title": "The community above, one lane each below",
  "communities.fig_layer.alt_desc":
    "Four members. Above the line each is linked to every other: that is your community, and Sophia does not touch it. Below it, each runs in a lane of their own, and nothing joins one lane to another.",
  "communities.fig_layer.community_label": "YOUR COMMUNITY",
  "communities.fig_layer.sophia_label": "IN SOPHIA",
  "communities.fig_layer.absence": "no feed, no rooms, no comments",

  // ── BANDE 3 · DOULEUR 03 — un modèle lisse ma voix ───────────────────────
  // Un propriétaire de communauté a un ton, des formules que ses membres
  // reconnaissent au premier paragraphe. Sa peur a un nom dans son milieu : le
  // « tone flattening ». Il ne loue pas un modèle, il prête sa voix.
  //
  // ⚠️ NI « votre marque » NI « votre nom sur les messages » (B18) : zéro
  // personnalisation de marque existe, l'agent s'appelle Sophia partout. Ce qui
  // est vrai et suffit : ce sont SES MOTS qui sortent, signés de son nom.
  "communities.voice.kicker": "Your voice is the asset",
  "communities.voice.title": "It answers in your words. Not in ours, and not in a house style.",
  "communities.voice.body":
    "Your members can tell your writing from a generic health post at a glance, and that recognition is most of what they pay for. So Sophia gets no personality of its own: it gets your method — your words, your positions, and what you say instead of what you don’t recommend.",
  // ⚠️ FORMULATION B8b, MOT POUR MOT. « La doctrine entre à chaque message » est
  // faux (B7 : un seul appelant) et « chaque message sortant est vérifié » est
  // faux pour « chaque » (B8 : quatre surfaces scannées, quatre non). Ce qui
  // reste est déjà l'argument le plus fort du produit.
  "communities.voice.lock":
    "Your method goes into the chat, into every week and into every meal Sophia writes; and what it writes in the chat is read back against your red lines before it is sent — with no model in that loop.",
  "communities.voice.close":
    "Your member never gets a refusal, and never gets “ask in the group”.",

  "communities.fig_lock.label": "ONE MESSAGE, READ BACK",
  "communities.fig_lock.alt_title": "What was held, and what went out",
  "communities.fig_lock.alt_desc":
    "Three moments, top to bottom: a member’s question, the draft held because it contradicts a red line, and the message actually sent — the sentence you wrote instead. Only the third is received.",
  "communities.fig_lock.ask_label": "A MEMBER ASKS",
  "communities.fig_lock.ask_value": "Should I add a snack between lunch and dinner?",
  "communities.fig_lock.draft_label": "THE DRAFT SAID",
  "communities.fig_lock.draft_value": "A small snack mid-afternoon can help.",
  "communities.fig_lock.held": "held",
  "communities.fig_lock.sent_label": "WHAT WENT OUT",
  "communities.fig_lock.sent_value1": "Three real meals. If you are hungry between them,",
  "communities.fig_lock.sent_value2": "the meal before was too small.",
  "communities.voice.figure_caption":
    "That replacement is not ours. Each red line carries what you say instead, in your own words, and it goes out signed with your name.",

  // ── BANDE 4 · LE PRIX ET LA CLÔTURE ──────────────────────────────────────
  // Une seule carte : deux cartes obligent à faire une addition, et une
  // addition sur une page de vente est un endroit où se tromper. Le tarif
  // annuel est une LIGNE sous la carte — une modalité de paiement, pas une
  // seconde offre. ⚠️ Et il porte sur un SIÈGE payé à l'année, jamais sur
  // l'année d'un membre (B2/B3) : c'est l'intervalle du coach.
  "communities.pricing.kicker": "Pricing",
  "communities.pricing.title": "One line, and only for the members who upgrade.",
  "communities.pricing.seat_period": "per member, per month",
  "communities.pricing.seat_label": "No platform fee. No setup. Nothing else.",
  "communities.pricing.annual": "€6 for a seat paid a year up front.",
  "communities.pricing.why":
    "You pay for the members you put on the coached tier, and you stop paying the month you turn a seat off. The rest of your community costs you nothing, because they are not here.",
  // La meilleure ligne des trois pages de vente, et elle vaut double sur ce
  // marché : les taux de rétention qui circulent dans son écosystème sont des
  // chiffres de blogs d'éditeurs, sans échantillon ni méthode. Rien dans ce
  // dépôt ne mesure le churn contre un témoin. À CONSERVER VERBATIM (B31).
  "communities.pricing.no_number":
    "We don’t have a retention number to sell you, and we are not going to invent one. The number that decides this is yours: what one member who stays three months longer is worth, at your own price.",
  "communities.pricing.trial_note": "14 days, up to 3 members, then it stops on its own.",

  // Elle referme sur le titre du hero et sur la formule que la page a employée
  // deux fois, « an answer of their own ». ⚠️ Pas de métaphore ici : une clôture
  // est la dernière phrase qu'on lit avant de cliquer, c'est le pire endroit du
  // site pour faire travailler le lecteur.
  "communities.closing.title":
    "You already have the members, the price and the method. What a thread cannot give them is an answer of their own.",
  "communities.closing.cta": "Start the 14-day trial",
  "communities.closing.signin_prompt": "Already using Sophia?",
  "communities.closing.signin_link": "Sign in",
} as const
