// /communities — le pack ANGLAIS, à fusionner dans `frontend/src/keel/i18n/en.ts`.
// Namespace `communities` (inchangé). Aucun trou d'interpolation nulle part :
// les deux packs sont donc trivialement à parité pour `parity.int.test.ts`.
//
// ⛔ CE QUI A ÉTÉ SUPPRIMÉ, ET QUI NE DOIT PAS REVENIR
// `communities.doctrine.no_calories_title`, `.no_calories_body`,
// `.no_calories_body2` — « And no, Sophia doesn't count calories », « A
// deterministic filter strips any calorie or macro target », « The refusal is
// the feature ». FAUX depuis FF-059 : `plan/EnergyReadout.tsx:42-45` affiche
// un nombre de kcal sur `/app/plan` et `/app/today`. `/` et `/gyms` ont abandonné ce
// cadrage le 2026-08-06 et l'ancien en-tête de ce bloc disait par écrit que les
// trois devaient bouger ensemble ; `/communities` était la seule restée en
// arrière, et c'était le seul claim FAUX du site déjà EN LIGNE (AUDIT §8 n°2,
// décision D4).
// Ce qui le remplace est `communities.tier.not4_*`, et c'est C15 : les chiffres
// d'énergie sont ÉTEINTS PAR DÉFAUT (`profiles.energy_display_enabled` default
// false, `20260812230000:60`) et une chaîne de gardes décide si on peut les
// allumer (`energy_gate.ts:228-249`). Plus vrai, presque aussi fort, et ça ne
// promet pas un refus que le produit ne fait plus.
//
// ⛔ SUPPRIMÉ AUSSI : `communities.doctrine.rule1_*` — « No adherence score, no
// percentage, no streak, no leaderboard ». AUDIT B15 : vrai en pratique,
// VIVANT EN CODE (`coach_synthesis.ts:571-575` émet encore « Average adherence
// on core lines: X% » dès qu'une ligne existe, et `risk_band` atteint l'écran).
// Une page de vente ne grave pas une règle que le code peut démentir demain.
//
// ⛔ ET `communities.lock.lock1` A CHANGÉ DE PHRASE. « Your method goes into the
// prompt, on every message » est FAUX comme écrit (AUDIT B7) : `withKeelDoctrineBlock`
// n'a qu'un appelant, le composeur. La formulation retenue est B8b, et elle
// nomme les quatre points d'injection réels (B10) au lieu de « chaque message ».
export const communitiesEn = {
  "communities.seo_title": "Sophia for paid communities — the answer a thread can't give",
  "communities.seo_description":
    "You run a paid community. It is a thread: you answer in public, to the group, and no member ever gets an answer of their own. Sophia is the layer underneath — each member on the coached tier gets their own space, their own week and their own answers, built from your method. Your community does not move. 7 € per member on that tier, per month.",

  // ── HERO ─────────────────────────────────────────────────────────────────
  // Le titre nomme l'ARCHITECTURE, pas la fatigue. « Tu es débordé » est faux
  // et vaguement insultant pour quelqu'un qui tient 500 personnes ; « un fil ne
  // répond pas à une personne » est vrai, structurel, et impossible à
  // contester. C'est ce qu'il a déjà pensé sans l'avoir formulé.
  "communities.hero.kicker": "For owners of a paid community",
  "communities.hero.title": "A community is a thread. A thread can't answer one person.",
  "communities.hero.lede":
    "You answer in public, to the group — and no number of extra hours changes that, because it is the shape of the thing you built. Your members live it as never getting an answer of their own. Sophia is the layer underneath: each member on the coached tier gets their own space, their own week and their own answers, built from your method. Your community does not move.",
  "communities.hero.cta": "Start the 14-day trial",
  // Les trois faits qu'il vérifie en premier, dans l'ordre où ils le rassurent :
  // la porte est petite, l'entrée est simple, et rien ne lui retombe dessus.
  "communities.hero.note":
    "14 days, up to 3 members, then it stops on its own. Members come in by email invitation from your workspace, and nothing comes back to you as an inbox.",
  "communities.hero.signin_prompt": "Already using Sophia?",
  "communities.hero.signin_link": "Sign in",

  // ── FIGURE A — une question, deux destinations ───────────────────────────
  "communities.fig_lane.label": "ONE QUESTION, TWO DESTINATIONS",
  "communities.fig_lane.alt_title": "One answer for everybody, or an answer each",
  "communities.fig_lane.alt_desc":
    "The same four members, drawn twice. On the left a single rule opens all four at once: that is a public answer, written to fit everyone. On the right each member has a rule of their own. What changes is not the amount of work, it is the number of people the answer is addressed to.",
  "communities.fig_lane.thread_label": "IN THE THREAD",
  "communities.fig_lane.tier_label": "ON THE COACHED TIER",
  "communities.fig_lane.thread_caption": "one answer, for everybody",
  "communities.fig_lane.tier_caption": "an answer of their own",

  // ── LE PALIER — ce qu'on ajoute, et ce qu'on ne touche pas ───────────────
  // Sa première phrase est « vous ne changez rien ». Quelqu'un qui a 500
  // membres payants n'achète pas une migration : il achète une ligne de plus
  // sur sa page de vente, vendue à une base dont l'acquisition est déjà payée.
  "communities.tier.kicker": "What you add",
  "communities.tier.title": "One tier above what you already sell. Nothing underneath moves.",
  "communities.tier.body":
    "Same platform, same entry price, same posts, same people. Above them you open one more option: everything they already have, plus an agent that coaches them one to one in your method. The members who want that upgrade. The ones who don't never notice it exists.",

  "communities.fig_tier.label": "THE SAME OFFER, PLUS ONE BAND",
  "communities.fig_tier.alt_title": "The tier sits on top; the offer underneath does not move",
  "communities.fig_tier.alt_desc":
    "The same offer drawn twice, from a single element used twice over. The upper one carries one extra band: each member's own agent. Nothing else changes — not the platform, not the entry price, not the posts.",
  "communities.fig_tier.band": "their own agent, every day",
  "communities.fig_tier.tier_label": "THE COACHED TIER",
  "communities.fig_tier.tier_value": "41 €",
  "communities.fig_tier.base_label": "YOUR COMMUNITY",
  "communities.fig_tier.base_value": "29 €",
  "communities.fig_tier.cost_label": "YOUR COST",
  "communities.fig_tier.cost_value": "7 €",

  // L'arithmétique, à revérifier si l'un de ces nombres bouge :
  //   500 membres × 30 % = 150   |   écart 41 − 29 = 12 €
  //   150 × 12 € = 1 800 €   |   150 × 7 € = 1 050 €   |   1 800 − 1 050 = 750 €
  // Et 150 est aussi la cohorte de la figure du lundi : deux nombres qui ne
  // concordent pas sur une page de vente, et toute la page devient approximative.
  // L'écart est de 12 € et pas de 30 : on ne demande pas à un membre de doubler
  // sa dépense pour ajouter une couche, et un écart qu'il ne croit pas
  // discrédite le reste de la page — y compris ce qui est vrai.
  "communities.tier.example":
    "A worked example. Five hundred members, three in ten take the tier: 150 × 12 €, minus 150 seats at 7 €. About 750 € a month, on people whose acquisition you have already paid for.",
  "communities.tier.example_caption":
    "It says example because it is one: your price and your take-up decide the total, and both of those are yours. What is not an estimate is the 7 €, and that it only ever applies to the members who upgrade.",
  "communities.tier.billing":
    "You keep charging them where you already charge them. No member ever pays Sophia, or even sees us as something to pay for.",

  // ── LES BORNES, DITES ICI ET PAS APRÈS LE PRIX ───────────────────────────
  // Il arrive avec une question qu'il ne posera pas à voix haute : « qu'est-ce
  // que je vais devoir brancher, migrer, refaire ». La réponse est RIEN, et
  // elle vaut mieux que n'importe quel argument — mais seulement si on donne
  // aussi ce qu'on n'a pas, dans la même respiration. Un « non » découvert
  // après le chiffre annule le chiffre.
  "communities.tier.not_label": "And before you ask what you would have to rebuild: nothing",
  "communities.tier.not1_title": "No integration with your platform",
  "communities.tier.not1_body":
    "There is no Skool, Circle, Discord or Kajabi integration — none, and we would rather say it here than let you find out on day one. Members come in through an email invitation you send from your workspace. There is no link to copy, which is a security property rather than a missing button.",
  "communities.tier.not2_title": "No second social layer",
  "communities.tier.not2_body":
    "Members never see each other in Sophia: no feed, no rooms, no comments. It cannot become the place your people gather, because there is no such place in it. Your community is the social layer, and it stays yours.",
  "communities.tier.not3_title": "No checkout for your members",
  "communities.tier.not3_body":
    "You set the price of your tier, and you collect it where you already collect it. There is no member checkout anywhere in the product.",
  "communities.tier.not4_title": "Not a counter",
  "communities.tier.not4_body":
    "Energy numbers are off by default on a member's account, and a chain of guards decides whether they can be switched on at all. What comes back to them is what they ate, when, and how big.",

  // ── LES RÔLES — la section la plus facile à rater ────────────────────────
  // « Tes membres partent, on les retient » se lit comme « ta communauté ne
  // marche pas » — or elle marche : il a prouvé qu'il sait vendre du récurrent.
  // Et son objection n°1, rarement dite frontalement, est « si un bot répond,
  // plus personne ne se répond entre membres » : l'IA menace précisément le
  // mécanisme qu'il facture. La réponse n'est pas une promesse, c'est une
  // absence de surface — pas de fil, pas de salon, pas de commentaire.
  "communities.roles.kicker": "Why they stay",
  "communities.roles.title": "Keep the peers. Add the one thing a group was never going to do.",
  "communities.roles.body":
    "A community is good at what a community is good at: people going through the same thing at the same time, answering each other at midnight, noticing when someone drops off for a week. Sophia does not touch that, and could not take it if it tried — it has no feed and no rooms to take it into. What a group cannot do is answer one person, at 9pm, about the dinner actually in front of them.",
  "communities.roles.group_title": "Stays in your community",
  "communities.roles.group_body":
    "The peers. The culture you built. Your posts, your calls, the wins people put up on a Friday. That is what they joined for, and no agent produces it.",
  "communities.roles.agent_title": "Goes into their own lane",
  "communities.roles.agent_body":
    "The 9pm question about their own plate. The week built out of your method, for their kitchen and their schedule. And on the third quiet day, one message written from the method you published — that one is held outside 9pm to 8am, so it lands in their morning rather than on top of their evening.",

  // ── FIGURE C — le troisième jour ─────────────────────────────────────────
  "communities.fig_third_day.label": "THE THIRD QUIET DAY",
  "communities.fig_third_day.alt_title": "The third quiet day",
  "communities.fig_third_day.alt_desc":
    "A timeline. On the left, a member's last message. Three days with nothing on them. On the third day one message goes out, written from the coach's published method. Then the line runs bare again: only one is ever sent.",
  "communities.fig_third_day.last_label": "THEIR LAST MESSAGE",
  "communities.fig_third_day.last_value": "then nothing",
  "communities.fig_third_day.message_label": "ONE MESSAGE",
  "communities.fig_third_day.message_value": "in your method",
  "communities.fig_third_day.silence": "three quiet days",
  "communities.fig_third_day.after": "then it stops",
  "communities.roles.figure_caption":
    "Seventy-two hours of silence, one message, and then it stops: one per episode, and at most one a week. A member who slipped hears from you while they are still reachable, instead of the month their card is declined.",
  "communities.roles.close":
    "You are not choosing between us and another AI. You are choosing between one more room — still a room, still answered in public — and one more salary, who has to be taught your method and does not hold five hundred members.",

  // ── LE LUNDI — l'angle est le SILENCE ────────────────────────────────────
  // Dans un fil il ne voit que les bavards, et les dix qui postent cachent les
  // quatre-vingt-dix qui décrochent. Chaque ligne de la figure correspond à ce
  // que `renderSynthesisText` émet vraiment.
  "communities.monday.kicker": "What a thread never tells you",
  "communities.monday.title": "In a thread you only ever see the ten who post.",
  "communities.monday.body":
    "Ten people posting can hide ninety who quietly stopped, and nothing in a feed separates a member doing fine in silence from one who left in their head six weeks ago. On Monday you get one page, rendered from a template out of what actually happened and never narrated by a model, and the first thing on it is the people who said nothing.",

  "communities.fig_monday.alt_title": "The Monday page",
  "communities.fig_monday.alt_desc":
    "A schematic of the weekly page: first who is still talking — in touch, slipping, silent — then how the week was lived, and last how many members built themselves a week from the coach's method. The silent ones are on the first line, before anything else.",
  "communities.fig_monday.screen_title": "This week",
  "communities.fig_monday.contact_label": "WHO IS STILL TALKING",
  "communities.fig_monday.in_touch": "In touch",
  "communities.fig_monday.in_touch_hint": "answered within 2 days",
  "communities.fig_monday.slipping": "Slipping",
  "communities.fig_monday.slipping_hint": "quiet 2 to 5 days",
  "communities.fig_monday.silent": "Silent",
  "communities.fig_monday.silent_hint": "quiet 5 days or more",
  "communities.fig_monday.felt_label": "HOW THE WEEK WAS LIVED",
  "communities.fig_monday.holding": "Holding up",
  "communities.fig_monday.strained": "Strained",
  "communities.fig_monday.hard": "Having a hard time",
  "communities.fig_monday.unknown": "Not enough check-ins to say",
  // « built », le mot du moteur — jamais « wrote » (AUDIT B13 : la page
  // actuelle prétend citer et paraphrase).
  "communities.fig_monday.intent_line": "88 of 150 built themselves a week from your method.",
  "communities.monday.figure_caption":
    "A schematic of the Monday page. The thresholds are the product's own: quiet for two days opens slipping, five days opens silent, both measured on their last message in. The cohort is the example above — the 150 members of a 500-person community who took the tier.",
  "communities.monday.close":
    "And when there is not enough to say something, the page says so. A member who tapped twice has not given you a week, and comes back as “not enough check-ins” rather than as “doing fine”.",

  // ── LA VOIX — l'actif, et la seule section qui n'existe que sur cette page ─
  // Un propriétaire de communauté a une marque, un ton, des formules que ses
  // membres reconnaissent au premier paragraphe. Sa peur a un nom dans son
  // milieu : le « tone flattening », la voix lisse et vaguement
  // professionnelle. Il ne loue pas un modèle, il prête sa voix.
  //
  // ⚠️ On ne dit NI « votre marque » NI « votre nom sur les messages » (AUDIT
  // B18) : zéro personnalisation de marque existe, l'agent s'appelle Sophia
  // partout. Ce qui est vrai et suffit : ce sont VOS MOTS qui sortent.
  "communities.voice.kicker": "Your voice is the asset",
  "communities.voice.title": "It answers in your words. Not in ours, and not in a house style.",
  "communities.voice.body":
    "Your members can tell your writing from a generic health post at a glance, and that recognition is most of what they are paying for. So Sophia does not get a personality of its own — it gets your method: how you address people, how long you go on, the words you use and what you mean by them, the positions you hold, and what you say instead when someone asks for something you don't recommend. You write it once, in a guided interview, and you read back what it understood before any of it is published.",

  "communities.fig_voice.alt_title": "What Sophia holds of your voice",
  "communities.fig_voice.alt_desc":
    "Four fields of the doctrine as they are written: how you address people, one of your own terms with the meaning you give it, one red line, and what you say instead of that red line. The last card is opened by a rule, because it is the one your member receives.",
  "communities.fig_voice.screen_title": "Your voice",
  "communities.fig_voice.address_label": "HOW YOU SPEAK TO THEM",
  "communities.fig_voice.address_value": "First name, informal. Two or three sentences. No emojis.",
  "communities.fig_voice.term_label": "ONE OF YOUR TERMS",
  "communities.fig_voice.term_value1": "“Reset day” — a day you plan light on purpose.",
  "communities.fig_voice.term_value2": "Not a day you failed.",
  "communities.fig_voice.line_label": "ONE OF YOUR RED LINES",
  "communities.fig_voice.line_value": "Never recommend grazing between meals.",
  "communities.fig_voice.instead_label": "AND WHAT YOU SAY INSTEAD",
  "communities.fig_voice.instead_value1": "Three real meals. If you are hungry between them,",
  "communities.fig_voice.instead_value2": "the meal before was too small.",
  "communities.voice.traceable":
    "And when a member builds their own week out of your method, every line names the conviction it applies. The database refuses a line that names none — that is a constraint, not a convention.",
  "communities.voice.revise":
    "Revise any of it whenever you like, and roll back to an earlier version without losing what your members actually received.",
  "communities.voice.close":
    "Which raises the only question worth asking once you have handed your voice to software: what happens the day it writes something you would never write, in front of the people who know how you write.",

  // ── LE DOUBLE VERROU — le seul bloc sombre de la page ────────────────────
  // Il vient APRÈS la voix, parce qu'il protège l'actif qu'elle vient de
  // nommer : dans l'autre ordre, la garantie garderait quelque chose que le
  // lecteur n'a pas encore vu.
  //
  // ⚠️ FORMULATION B8b, ET PAS CELLE DES PAGES ACTUELLES. « La doctrine entre
  // à chaque message » est faux (B7 : `withKeelDoctrineBlock` n'a qu'un
  // appelant) et « chaque message sortant est scanné » est faux pour
  // « chaque » (B8 : 4 surfaces scannées, 4 non scannées — relance, récap du
  // soir, bilan du dimanche, broadcast). Ce qui reste, et qui est vrai, est
  // déjà l'argument le plus fort du produit.
  "communities.lock.kicker": "The part you should be most afraid of",
  "communities.lock.title":
    "An AI writing in your method, to your own members, is a risk. We treat it as one.",
  "communities.lock.body":
    "A prompt is an instruction, not a guarantee. Tell any model “never recommend grazing between meals” and it will comply almost always — and almost always is the wrong number when one public contradiction of you is the screenshot that gets posted in your own community. So your method is held twice, by two mechanisms that fail differently.",
  "communities.lock.lock1_tag": "Injected",
  "communities.lock.lock1":
    "Your method goes into the chat, into every week and into every meal Sophia writes.",
  "communities.lock.lock2_tag": "Read back",
  "communities.lock.lock2":
    "What it writes in the chat is read back against your red lines before it is sent. Deterministic, with no model in that loop. That one is the guarantee.",

  "communities.fig_lock.label": "ONE MESSAGE, READ BACK",
  "communities.fig_lock.alt_title": "What was held, and what went out",
  "communities.fig_lock.alt_desc":
    "Three moments, top to bottom: a member's question, the draft the read-back held because it contradicts a red line, and the message actually sent — the one the coach wrote instead. The third is opened by a rule, because it is the only one the member receives.",
  "communities.fig_lock.ask_label": "A MEMBER ASKS",
  "communities.fig_lock.ask_value": "Should I add a snack between lunch and dinner?",
  "communities.fig_lock.draft_label": "THE DRAFT SAID",
  "communities.fig_lock.draft_value": "A small snack mid-afternoon can help.",
  "communities.fig_lock.held": "held",
  "communities.fig_lock.sent_label": "WHAT WENT OUT",
  "communities.fig_lock.sent_value1": "Three real meals. If you are hungry between them,",
  "communities.fig_lock.sent_value2": "the meal before was too small.",
  "communities.lock.trace_note":
    "That replacement is not ours. Each red line carries what you do instead, in your words, and that is what your member receives.",
  "communities.lock.close":
    "Your member never gets a refusal, and never gets “ask in the group” — which would hand them straight back to the thread you added this layer to get past.",

  // ── LE PRIX ──────────────────────────────────────────────────────────────
  // Une seule carte : deux cartes obligent à faire une addition, et une
  // addition sur une page de vente est un endroit où se tromper. Le tarif
  // annuel est une LIGNE sous la carte — une modalité de paiement, pas une
  // seconde offre. ⚠️ Et il porte sur un SIÈGE payé à l'année, jamais sur
  // l'année d'un membre (AUDIT B2/B3) : c'est l'intervalle du coach.
  "communities.pricing.kicker": "Pricing",
  "communities.pricing.title": "One line, and only for the members who upgrade.",
  "communities.pricing.seat": "7 €",
  "communities.pricing.seat_period": "per member, per month",
  "communities.pricing.seat_label": "No platform fee. No setup. Nothing else.",
  "communities.pricing.annual": "6 € for a seat paid a year up front.",
  "communities.pricing.why":
    "You pay for the members you have put on the coached tier, and you stop paying the month you turn a seat off. The rest of your community costs you nothing, because they are not here.",
  // La meilleure ligne des trois pages de vente, et elle vaut double sur ce
  // marché : les taux de rétention qui circulent dans son écosystème sont des
  // chiffres de blogs d'éditeurs, sans échantillon ni méthode. Rien dans ce
  // dépôt ne mesure le churn contre un témoin. À CONSERVER (AUDIT B31).
  "communities.pricing.no_number":
    "We don't have a retention number to sell you, and we are not going to invent one. The number that decides this is yours: what one member who stays three months longer is worth, at your own price.",
  "communities.pricing.trial_note": "14 days, up to 3 members, then it stops on its own.",

  // ── LA CLÔTURE ───────────────────────────────────────────────────────────
  // Elle referme sur le titre du hero et sur la formule que la page a déjà
  // employée deux fois, « an answer of their own ». ⚠️ Pas de métaphore ici :
  // une clôture est la dernière phrase qu'on lit avant de cliquer, c'est le
  // pire endroit du site pour faire travailler le lecteur.
  "communities.closing.title":
    "You already have the members, the price and the method. What a thread cannot give them is an answer of their own.",
  "communities.closing.cta": "Start the 14-day trial",
  "communities.closing.signin_prompt": "Already using Sophia?",
  "communities.closing.signin_link": "Sign in",
} as const;
