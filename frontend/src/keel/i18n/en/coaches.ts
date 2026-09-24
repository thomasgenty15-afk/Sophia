// Seed anglais — le namespace `coaches`, et lui seul.
// Assemblé dans `../en.ts`; une clé `coaches.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enCoaches = {
  // ── POURQUOI CETTE PAGE VEND UN REVENU ET PLUS UNE FATIGUE ÉVITÉE ────────
  //
  // ⚠️ CE BLOC EST ARRIVÉ ICI LE 2026-08-13, ET IL ÉTAIT ORPHELIN. Il vivait en
  // tête du bloc `home`, sous le titre « Landing — hero »: le raisonnement de
  // vente d'une page PRO, posé à décrire le hall du FOYER. La page qu'il
  // décrit a déménagé vers `/coaches` (audit D3); son raisonnement la suit.
  //
  // La version précédente ouvrait sur « You can't answer two hundred students »:
  // un argument de CHARGE DE TRAVAIL, donc de COÛT. Trois conséquences, toutes
  // mesurables sur la page:
  //
  //   1. un argument de coût se compare à un coût. Le prospect nous rangeait à
  //      côté de TrueCoach (49 $/mois tout compris à 20 clients) alors qu'on
  //      sort à 289 $, et la comparaison était perdue avant d'être ouverte;
  //   2. un argument de coût plafonne au temps du coach. Un argument de revenu
  //      ne plafonne pas;
  //   3. seule la promesse de revenu est recopiable sur la page de vente DU
  //      COACH — c'est le seul vecteur de distribution que ce produit possède.
  //
  // ⚠️ LA LIMITE QU'AUCUNE LIGNE NE DOIT FRANCHIR: il n'existe AUCUN SKU élève
  // dans `stripe-create-checkout-session` (seulement `plan='keel_coach'` et les
  // tiers hérités du B2C). On ne facture donc PAS l'élève, et rien ici ne doit
  // le laisser croire (silence S12). Ce qu'on promet est exact et suffisant: le
  // coach obtient quelque chose QUI VAUT un abonnement. Il l'encaisse avec ses
  // propres outils.
  //
  // La cible est double et le titre les couvre toutes les deux: celui qui vend
  // une formation one-shot (Sophia lui crée la ligne récurrente), et le coach
  // 1:1 avec une liste d'attente (Sophia lui crée le palier SOUS son 1:1).

  //
  // ── QUATRE BANDES, TROIS DOULEURS, ET DEUX SECTIONS MORTES ────────────────
  // La page passe de sept sections à quatre. Une section = une ligne de la
  // grille des douleurs, et `/coaches` n'en a que trois:
  //
  //   BANDE 1 — 01 « Ma formation se termine, l'accompagnement meurt avec elle »
  //   BANDE 2 — 02 « Mes élèves ont une question le mardi soir »
  //   BANDE 3 — 03 « Une IA dira le contraire de ce que j'enseigne »
  //   BANDE 4 — le prix ET la clôture, fusionnés.
  //
  // SONT MORTES ICI: `coaches.monday.*` + `coaches.fig.monday.*` (le lundi en une
  // page appartient à `/gyms` douleur 02 et au hall `/pro` ligne 04) et
  // `coaches.note.*` (la grille a explicitement ÉCARTÉ la note 1:1 du monde pro:
  // « utilisée jamais citée » est une promesse de prompt sans vérificateur —
  // B26, `coach_note.ts:126-128`). Ni l'une ni l'autre n'est fausse; aucune des
  // deux n'est une des trois lignes de cette page.
  //
  // VOCABULAIRE: cette page est la SEULE du monde pro à dire « students ».
  // `/pro` et `/gyms` disent « clients ». « Personalised follow-up » reste
  // interdit partout (S2, amendé le 2026-08-13).
  // ── SEO ─────────────────────────────────────────────────────────────────
  "coaches.seo_title": "Sophia — your method answers your students, every day",
  // B8b MOT POUR MOT DANS SON SENS: la méthode entre dans le chat, dans chaque
  // semaine et dans chaque repas; SEUL le chat est relu avant envoi. Ne jamais
  // écrire « chaque message est vérifié » (4 surfaces scannées sur 8, B8) ni
  // « la doctrine entre à chaque message » (B7).
  "coaches.seo_description":
    "You recorded your method once. Sophia answers your students in it every day — in the chat, in every week and every meal she drafts. What she writes in the chat is read back against your red lines before it is sent, with no model in that loop. €7 per student, per month, no platform fee.",

  // ── BANDE 1 — DOULEUR 01 ────────────────────────────────────────────────
  // Le titre survit à la refonte: il nomme la douleur (le cours finit) et la
  // promesse (le coaching, non) en six mots, et il n'a jamais été le problème.
  "coaches.hero.kicker": "For coaches who sell a method, not hours",
  "coaches.hero.title": "Your course ends. Your coaching doesn’t.",
  "coaches.hero.lede":
    "You recorded the method once. Sophia answers your students with it, every day — the question at nine at night, the week they build, the meals she drafts. What you could only sell once becomes something you can bill every month.",
  "coaches.hero.cta": "Start the 14-day trial",
  // B5 (14 jours / 3 élèves) · B32 (invitation e-mail, pas de lien à copier) ·
  // S1 (aucune boîte de réception, et l'absence EST le produit — dite à
  // l'affirmative, parce qu'un coach cherche la boîte avant de la croire absente).
  "coaches.hero.note":
    "14 days, up to 3 students, then it stops on its own. They join by email invitation and get a space of their own. Nothing comes back to an inbox on your side — there isn’t one.",
  // B28 — révision et rollback: la clé de cache est le hash du contenu, donc
  // une correction est visible au message suivant (`doctrine.ts:38-43`).
  "coaches.hero.fig_caption":
    "You record it once, in a guided interview. Revise it whenever you like — an edit lands on the next message — and roll back to an earlier version without losing what your students already received.",

  "coaches.fig.after.title": "The course stops; the method keeps answering",
  "coaches.fig.after.desc":
    "Two rows on one timeline. The course is a closed box that ends at the last video. The method, recorded at the same moment, does not close on the right: it runs on past that point, answering day after day.",
  "coaches.fig.after.eq": "AFTER THE LAST VIDEO",
  "coaches.fig.after.course": "YOUR COURSE",
  "coaches.fig.after.modules": "the modules",
  "coaches.fig.after.end": "IT STOPS HERE",
  "coaches.fig.after.method": "YOUR METHOD",
  "coaches.fig.after.recorded": "recorded once",
  "coaches.fig.after.every_day": "answering, day after day",

  // ── BANDE 2 — DOULEUR 02 ────────────────────────────────────────────────
  "coaches.day.kicker": "Tuesday, nine at night",
  "coaches.day.title": "The questions that arrive when you are not there.",
  // ⚠️ LA PREMIÈRE QUESTION MISAIT SUR LA MAUVAISE CHAÎNE, et c'était la seule
  // des trois. Elle disait « Can I swap the rice for pasta tonight? ». Le
  // résolveur existe (`plan_question/swap_resolver.ts`) — mais il lit des
  // `plan_commitments`, que `keel_plan_context.ts:695-712` ne rend qu'avec un
  // `plan_version_id` PUBLIÉ: la chaîne de prescription 1:1, dont `CLAUDE.md`
  // dit qu'elle n'est PAS le modèle. Un élève de cohorte — ce que cette page
  // vend — tombe sur `commitment_not_identified` et reçoit la MÊME phrase
  // générique chez quatre coachs opposés. L'exemple d'ouverture d'une bande qui
  // promet « la réponse est la tienne » démontrait donc le contraire.
  //
  // Le petit-déjeuner est LE partage de doctrine, et il tombe sur le composeur —
  // la seule lane où le bloc de doctrine est injecté (B7).
  "coaches.day.q1": "“Do I really need breakfast?”",
  "coaches.day.q2": "“I’m starving at 4pm — is that normal?”",
  "coaches.day.q3": "“I ate badly at a wedding. Have I wrecked the week?”",
  "coaches.day.body":
    "None of them is in a module: they are about tonight, this kitchen, this week. Each one has an answer, and the answer is yours — you have made that call a hundred times. Students drift because on Tuesday night, nobody who thinks like you was there.",
  // S1 + S3 — l'absence de canal retour, dite à l'affirmative, et le PULL.
  // ⚠️ « et c’est déjà répondu » PROMETTAIT UNE RÉPONSE AVANT LA QUESTION.
  // Rien ne pré-répond: l’élève demande, l’agent répond — et c’est déjà tout
  // l’argument. La phrase disait par accident la seule chose de cette page que
  // le produit ne fait pas. Le reste du paragraphe (S1: ni boîte de réception,
  // ni file de réponses) est vrai et se garde tel quel.
  "coaches.day.reserve":
    "None of it comes back to you. There is no inbox, no reply queue, no thread waiting on your evening: your students ask in their own space, and the answer comes back — without going through you.",

  "coaches.fig.method.title": "One method, four places it is written into",
  "coaches.fig.method.desc":
    "The published method on the left. On the right, the four things Sophia composes for a student: their chat, the week they build, the meals she drafts, their household’s meals — each one composed with the method in it.",
  "coaches.fig.method.eq": "RECORDED ONCE",
  "coaches.fig.method.source": "YOUR METHOD",
  "coaches.fig.method.l1": "your convictions",
  "coaches.fig.method.l2": "your red lines",
  "coaches.fig.method.l3": "what you say instead",
  "coaches.fig.method.l4": "your vocabulary",
  // ⚠️ TROIS SORTIES DEPUIS LE 2026-08-19, pas quatre. « the week they build »
  // était la lane `generate-week-plan-v1`, retirée faute d'appelant vivant.
  // Les trois restantes sont vérifiées: run.ts:2448 · generate-meal-v1:1729 ·
  // generate-household-meal-v1:3569, les trois `doctrineBlockFor(doctrine)`.
  "coaches.fig.method.out1": "their chat",
  "coaches.fig.method.out2": "the meals she drafts",
  "coaches.fig.method.out3": "their household meals",

  // ── BANDE 3 — DOULEUR 03 · LE BLOC SOMBRE ───────────────────────────────
  "coaches.lock.kicker": "The part you should be most afraid of",
  "coaches.lock.title": "An AI speaking in your name is a risk. We treat it as one.",
  "coaches.lock.body":
    "A prompt is an instruction, not a guarantee. Tell any model “never recommend six small meals” and it will comply almost always — and almost always is the wrong number when one public contradiction of you is the thing your students remember.",
  // ⚠️ B8b — FORMULATION IMPOSÉE. L'asymétrie EST l'argument: nommer ce qui
  // n'est qu'une consigne protège la seule phrase de la page qui est une
  // garantie. « Chaque message sortant est vérifié » est FAUX (B8).
  "coaches.lock.scope":
    "So your method is written into the chat and into every meal Sophia drafts. That much is an instruction. This part is not: what she writes in the chat is read back against your red lines before it is sent, by code, with no model in that loop.",
  // La réserve honnête, sous la démonstration: le repli générique n'est JAMAIS
  // signé (`keel_output_locks.ts:202-209`), et il n'y a pas de porte de retour.
  "coaches.lock.reserve":
    "Your student never gets a refusal, and never “ask your coach” — in a masterclass that points at a door which doesn’t exist. Where you left the replacement blank, what goes out is our own sentence, unsigned: we don’t put your name on words you didn’t write.",

  // ── LA DÉMONSTRATION ────────────────────────────────────────────────────
  // Le MÉCANISME est le produit; l'EXEMPLE est un champ que le coach remplit.
  // D'où la forme d'une fiche à champs remplis, jamais celle d'une capture.
  "coaches.lock.demo.eq": "IN THE CHAT, BEFORE IT IS SENT",
  "coaches.lock.demo.written_label": "WHAT YOU WROTE, ONCE",
  "coaches.lock.demo.line_label": "your red line",
  "coaches.lock.demo.line_value": "six small meals",
  "coaches.lock.demo.instead_label": "what you say instead",
  // Cette phrase est celle du dépôt, mot pour mot — le commentaire de
  // `signAsCoach` (`sophia-brain/skills/_shared/keel_output_locks.ts:216-218`).
  "coaches.lock.demo.instead_value":
    "Three real meals. If you’re hungry between them, the meal before was too small.",
  "coaches.lock.demo.group_label": "IF THE MODEL WRITES",
  "coaches.lock.demo.draft_a": "“Try six small meals across the day.”",
  // L'exception de négation, mot pour mot (`doctrine.ts:30-31`).
  "coaches.lock.demo.draft_b": "“Your coach doesn’t do six small meals.”",
  "coaches.lock.demo.out_label": "WHAT YOUR STUDENT READS",
  "coaches.lock.demo.verdict_a": "Held, and replaced.",
  "coaches.lock.demo.verdict_b": "Sent as it stands.",
  "coaches.lock.demo.why_a":
    "The whole message is replaced by your sentence, and signed with your name.",
  "coaches.lock.demo.why_b":
    "Naming your red line to explain it is your method working, so nothing touches it.",
  // ⚠️ « — Marc » CONCLUAIT UNE FICHE ÉCRITE EN « TU », juste sous
  // « signé de ton nom »: le lecteur cherchait qui est Marc. Les étiquettes de
  // cette démonstration disent « ce que TU as écrit » — c’est donc SA fiche, et
  // la signature doit être la sienne.
  "coaches.lock.demo.sign": "— your name",
  "coaches.lock.demo.foot":
    "Two drafts, one red line. The check is a rule you wrote, matched in code: no model decides whether a message goes out.",

  // ── BANDE 4 — LE PRIX ET LA CLÔTURE, FUSIONNÉS ──────────────────────────
  "coaches.price.kicker": "Pricing",
  "coaches.price.title":
    "You have already written the method. This is what makes it worth paying for every month.",
  "coaches.price.seat_period": "per student, per month",
  "coaches.price.seat_label": "No platform fee. No setup. No tier to outgrow.",
  // B3, et jamais B2: l'intervalle annuel est celui du COACH, pas de l'élève.
  "coaches.price.yearly": "a seat when you pay yearly — your billing interval, not your student’s.",
  // B4 (on arrête le mois où on éteint) · B6 (zéro élève est refusé au
  // checkout, donc « positif dès le premier élève » ne s'écrit pas) · S12.
  "coaches.price.body":
    "You pay for the students you have enrolled, and you stop paying the month you turn a seat off. What you charge them is yours — we never bill your student. To subscribe you need at least one student enrolled: the seat is the thing you pay for.",
  // B31 — la meilleure ligne des trois pages actuelles. Conservée verbatim.
  "coaches.price.no_number":
    "What one student who stays instead of drifting is worth is your number, not ours. We have no retention figure to sell you, and we are not going to invent one.",
  "coaches.price.cta": "Start the 14-day trial",
  "coaches.price.trial_note": "14 days, up to 3 students, then it stops on its own.",
} as const
