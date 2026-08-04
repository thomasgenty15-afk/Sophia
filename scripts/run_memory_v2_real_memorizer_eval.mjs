#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenarioName = process.argv.find((arg) => arg.startsWith("--scenario="))
  ?.split("=")[1] ?? "sophia";
const runId = `memory-real-eval-${scenarioName}-${Date.now().toString(36)}`;

function readLocalEnv() {
  const envPath = path.join(cwd, "supabase", ".env");
  const out = {};
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readLocalEnv();
const apiUrl = env.SUPABASE_URL || "http://127.0.0.1:54321";
const functionsUrl = `${apiUrl}/functions/v1`;
const anonKey = env.SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const internalSecret = env.INTERNAL_FUNCTION_SECRET;

if (!anonKey || !serviceRoleKey || !internalSecret) {
  throw new Error("Missing SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY or INTERNAL_FUNCTION_SECRET in supabase/.env");
}

async function requestJson(url, opts = {}) {
  const response = await fetch(url, opts);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`${opts.method ?? "GET"} ${url} -> ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function adminRequest(pathname, opts = {}) {
  return await requestJson(`${apiUrl}${pathname}`, {
    ...opts,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function rest(pathname, opts = {}) {
  return await adminRequest(`/rest/v1/${pathname}`, {
    method: opts.method ?? "GET",
    body: opts.body,
    headers: {
      ...(opts.prefer ? { prefer: opts.prefer } : {}),
      ...(opts.headers ?? {}),
    },
  });
}

async function insertRows(table, rows) {
  return await rest(`${table}?select=*`, {
    method: "POST",
    body: rows,
    prefer: "return=representation",
  });
}

async function createUser() {
  const email = `${runId}@example.com`;
  const password = `MemoryEval-${Date.now()}!`;
  const created = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { fixture: runId, full_name: "Memory Real Eval" },
    },
  });
  const userId = created?.id;
  if (!userId) throw new Error("Could not create auth user");
  await rest("profiles?on_conflict=id", {
    method: "POST",
    body: {
      id: userId,
      full_name: "Memory Real Eval",
      onboarding_completed: true,
      timezone: "Europe/Paris",
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  return { userId, email };
}

function isoMinutesAgo(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function buildMessages(userId) {
  const userTurns = [
    "Je veux que tu retiennes un contexte durable: je travaille sur un projet qui s'appelle Sophia, une app de coaching WhatsApp avec memoire longue.",
    "Mon objectif principal ce mois-ci est de rendre Sophia plus fiable sur le suivi quotidien, surtout les bilans et les relances WhatsApp.",
    "Je procrastine beaucoup quand la prochaine action est floue; si tu me proposes une action, elle doit etre minuscule et concrete.",
    "Hier soir, j'ai marche 27 minutes apres le diner et ca m'a aide a redescendre la pression.",
    "Depuis deux semaines, je dors mal quand je scrolle apres minuit, surtout les soirs ou je code tard.",
    "Au travail, mon manager Karim me met une grosse pression en reunion et je me sens parfois humilie.",
    "Karim est mon manager, pas mon associe.",
    "Nadia est ma soeur et elle m'aide a relativiser quand je dramatise une rechute.",
    "Correction importante: Tania est mon ex, pas ma soeur.",
    "Je prefere que Sophia me parle franchement mais sans ton dur quand je suis fatigue.",
    "Quand je dis 'je suis nul', c'est une emotion du moment, pas un fait sur mon identite.",
    "Je consomme parfois du cannabis le soir quand je veux couper la pression, et je veux que ce sujet reste sensible.",
    "Je ne veux pas que tu ressortes le sujet cannabis dans une conversation neutre sur la marche ou le travail.",
    "J'aimerais garder trois marches par semaine, mais sans culpabiliser si j'en rate une.",
    "Avant-hier matin, j'ai reporte une tache importante parce que je ne savais pas par ou commencer.",
    "Quand Sophia me donne un plan en trois etapes visibles, j'execute mieux.",
    "J'ai peur de demander de l'aide parce que j'ai l'impression que ca me rend faible.",
    "Ma routine ideale du matin: eau, douche, dix minutes de marche, puis seulement ensuite ouvrir le telephone.",
    "Si je suis en surcharge, il faut me proposer une reduction de pression plutot qu'un challenge.",
    "Je veux mesurer mes progres sur une semaine, pas sur une journee isolee.",
    "Dimanche soir, j'ai eu une discussion tendue avec ma mere sur mon rythme de travail.",
    "Ma mere me critique souvent sur ma discipline, et ca active beaucoup de doute.",
    "J'ai remarque que preparer mes affaires la veille rend la marche du matin beaucoup plus probable.",
    "Le projet Sophia est prioritaire par rapport aux autres idees produit pour les prochaines semaines.",
    "Ne memorise pas que je suis indecis comme trait stable; c'est juste ce que je ressens aujourd'hui.",
    "Je veux que les bilans hebdo me montrent les patterns, pas seulement une liste d'actions faites ou ratees.",
    "Quand je suis fatigue, les reponses courtes et directes m'aident plus que les grands raisonnements.",
    "Aujourd'hui j'ai annule une session de code parce que j'etais epuise, mais j'ai quand meme clarifie la prochaine action.",
  ];

  const rows = [];
  let minute = userTurns.length * 6;
  userTurns.forEach((content, index) => {
    rows.push({
      user_id: userId,
      role: "user",
      content,
      created_at: isoMinutesAgo(minute),
      metadata: { fixture: runId, fixture_index: index },
    });
    minute -= 3;
    rows.push({
      user_id: userId,
      role: "assistant",
      content: "Je note le contexte utile et je continue sans conclure trop vite.",
      created_at: isoMinutesAgo(minute),
      metadata: { fixture: runId, fixture_index: index, assistant_context: true },
    });
    minute -= 3;
  });
  return rows;
}

function buildDiverseMessages(userId) {
  const userTurns = [
    "Je veux que tu retiennes un contexte durable: je vis maintenant a Lyon et je reorganise mon quotidien autour de mon budget, de ma sante et de mon apprentissage du japonais.",
    "Mon objectif ce trimestre est de garder mes depenses variables sous 350 euros par mois, hors loyer et factures fixes.",
    "J'ai tendance a acheter des accessoires photo quand je suis stresse, donc aide-moi a attendre 24 heures avant les achats non essentiels.",
    "Mardi apres-midi, j'ai eu une migraine avec aura et j'ai du annuler un rendez-vous.",
    "Depuis mars, les migraines arrivent surtout quand je dors moins de six heures deux nuits de suite.",
    "Je prends du magnesium le soir, mais je ne veux pas que tu me donnes de conseil medical non sollicite.",
    "Hugo est un ami proche avec qui je fais parfois de la photo de rue, pas mon frere.",
    "Correction importante: Chloe est ma colocataire, pas ma compagne.",
    "Avec Chloe, je veux garder une limite claire: pas de discussion logistique apres 22h.",
    "J'apprends le japonais pour passer le JLPT N5 en decembre.",
    "Quand je revise le japonais, 20 minutes avec des flashcards fonctionnent mieux qu'une grosse session floue.",
    "Hier matin, j'ai fait 18 minutes d'Anki avant le travail et j'etais content de ne pas casser la chaine.",
    "Mon professeur de japonais s'appelle Mika et il me corrige surtout sur la prononciation.",
    "Je veux que les rappels budget soient factuels, sans ton moralisateur.",
    "Quand je dis 'je suis irresponsable avec l'argent', c'est une frustration du moment, pas un trait stable.",
    "Ne memorise pas que je suis depensier comme trait de personnalite; retiens plutot que les achats impulsifs augmentent quand je suis fatigue.",
    "Dimanche soir, j'ai trie mes papiers administratifs et retrouve une facture d'assurance a payer avant le 20.",
    "La facture d'assurance habitation doit etre payee avant le 20 de ce mois.",
    "Je prefere preparer les repas du midi le dimanche, sinon je finis par acheter dehors trois fois dans la semaine.",
    "Je ne veux pas que mes dettes ou mon budget ressortent dans une conversation neutre sur le japonais ou la photo.",
    "Vendredi dernier, j'ai oublie mes clefs chez Hugo et ca m'a fait perdre une heure.",
    "Pour la photo, je veux garder ca comme loisir creatif, pas comme nouveau projet pro.",
    "Si je suis fatigue, les messages en trois points maximum m'aident plus qu'une longue analyse.",
    "Aujourd'hui j'ai annule une sortie photo parce que la migraine commencait, mais j'ai quand meme fait mes flashcards.",
  ];

  const rows = [];
  let minute = userTurns.length * 6;
  userTurns.forEach((content, index) => {
    rows.push({
      user_id: userId,
      role: "user",
      content,
      created_at: isoMinutesAgo(minute),
      metadata: { fixture: runId, scenario: scenarioName, fixture_index: index },
    });
    minute -= 3;
    rows.push({
      user_id: userId,
      role: "assistant",
      content: "Je garde uniquement ce qui semble durable, contextualise ou utile pour la suite.",
      created_at: isoMinutesAgo(minute),
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        fixture_index: index,
        assistant_context: true,
      },
    });
    minute -= 3;
  });
  return rows;
}

function buildParaphraseMessages(userId) {
  const userTurns = [
    "Contexte a retenir: je prepare un voyage a Lisbonne en juin, je surveille mon allergie aux noix, et j'apprends la guitare.",
    "Pour Lisbonne, je veux garder un budget maximum de 600 euros hors billets d'avion.",
    "Je prefere des hebergements calmes, loin des quartiers trop festifs.",
    "Lundi matin, j'ai reserve le train pour aller a l'aeroport.",
    "J'ai une allergie aux noix; evite de me proposer des snacks avec noix, noisettes ou amandes.",
    "Mardi soir, j'ai eu des plaques rouges apres un dessert dont je ne connaissais pas la composition.",
    "Mon medecin s'appelle Dr Morel, mais je ne veux pas de conseil medical non sollicite.",
    "J'apprends la guitare avec l'objectif de jouer Blackbird en septembre.",
    "Pour la guitare, douze minutes au metronome m'aident plus qu'une longue session vague.",
    "Hier, j'ai pratique 14 minutes d'arpeges et ca m'a remis en confiance.",
    "Au travail, le client Orion me stresse quand il change le brief au dernier moment.",
    "Le dossier Orion est un sujet professionnel, pas un projet personnel.",
    "Ma cousine Lina m'aide a choisir des restaurants compatibles avec mon allergie.",
    "Correction: Lina est ma cousine, pas ma collegue.",
    "Quand je prepare un deplacement, je veux des reponses sous forme de checklist.",
    "Quand je dis 'je suis incapable de gerer mes voyages', c'est du stress, pas un fait.",
    "Ne memorise pas que je suis desorganise comme trait stable; retiens plutot que je perds mes moyens quand plusieurs reservations s'empilent.",
    "Vendredi dernier, j'ai oublie de confirmer l'hotel et j'ai du appeler en urgence.",
    "Je ne veux pas que mon allergie ressorte dans une conversation neutre sur la guitare.",
    "Aujourd'hui j'ai annule une repetition de guitare parce que j'etais epuise, mais j'ai quand meme prepare ma valise.",
  ];

  const rows = [];
  let minute = userTurns.length * 6;
  userTurns.forEach((content, index) => {
    rows.push({
      user_id: userId,
      role: "user",
      content,
      created_at: isoMinutesAgo(minute),
      metadata: { fixture: runId, scenario: scenarioName, fixture_index: index },
    });
    minute -= 3;
    rows.push({
      user_id: userId,
      role: "assistant",
      content: "Je garde le contexte utile sans transformer les emotions en faits stables.",
      created_at: isoMinutesAgo(minute),
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        fixture_index: index,
        assistant_context: true,
      },
    });
    minute -= 3;
  });
  return rows;
}

async function seedContext(userId) {
  await insertRows("user_topic_memories", [
    {
      user_id: userId,
      slug: "projet_sophia",
      title: "Projet Sophia",
      status: "active",
      lifecycle_stage: "durable",
      search_doc: "Sophia app coaching WhatsApp memoire bilans relances projet produit",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        domain_keys: [
          "travail.carriere",
          "travail.performance",
          "objectifs.court_terme",
          "habitudes.planification",
        ],
      },
    },
    {
      user_id: userId,
      slug: "routine_execution",
      title: "Routine et execution",
      status: "active",
      lifecycle_stage: "durable",
      search_doc: "routine marche procrastination prochaine action fatigue discipline execution",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        domain_keys: [
          "habitudes.execution",
          "habitudes.procrastination",
          "habitudes.environnement",
          "habitudes.planification",
          "psychologie.motivation",
          "psychologie.discipline",
          "psychologie.emotions",
          "sante.activite_physique",
          "sante.energie",
          "sante.sommeil",
          "addictions.ecrans",
          "objectifs.court_terme",
        ],
      },
    },
    {
      user_id: userId,
      slug: "relations_travail_famille",
      title: "Relations travail et famille",
      status: "active",
      lifecycle_stage: "durable",
      search_doc: "manager Karim Nadia soeur Tania ex mere critique relation travail famille",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        domain_keys: [
          "relations.famille",
          "relations.couple",
          "relations.conflit",
          "relations.limites",
          "travail.conflits",
          "travail.charge",
          "psychologie.estime_de_soi",
          "psychologie.emotions",
          "psychologie.discipline",
          "habitudes.reprise_apres_echec",
        ],
      },
    },
    {
      user_id: userId,
      slug: "sensible_cannabis",
      title: "Sujets sensibles",
      status: "active",
      lifecycle_stage: "durable",
      search_doc: "cannabis pression sensible ne pas ressortir conversation neutre",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        domain_keys: [
          "addictions.cannabis",
          "relations.limites",
          "psychologie.emotions",
        ],
      },
    },
    {
      user_id: userId,
      slug: "coaching_preferences",
      title: "Preferences de coaching",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "Sophia ton direct fatigue reponses courtes reduction pression challenge plan trois etapes preferences coaching",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        domain_keys: [
          "relations.limites",
          "sante.energie",
          "psychologie.motivation",
          "habitudes.execution",
          "habitudes.planification",
          "travail.charge",
        ],
      },
    },
    {
      user_id: userId,
      slug: "psychologie_identite",
      title: "Identite emotions et confiance",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "identite emotion nul faible demander aide doute estime peur echec indecision trait stable discipline",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        domain_keys: [
          "psychologie.identite",
          "psychologie.estime_de_soi",
          "psychologie.peur_echec",
          "psychologie.emotions",
          "psychologie.discipline",
        ],
      },
    },
  ]);

  await insertRows("user_entities", [
    {
      user_id: userId,
      entity_type: "project",
      display_name: "Sophia",
      aliases: ["projet Sophia", "app Sophia"],
      relation_to_user: null,
      status: "active",
      metadata: { fixture: runId },
    },
    {
      user_id: userId,
      entity_type: "person",
      display_name: "Karim",
      aliases: ["manager Karim", "mon manager"],
      relation_to_user: "manager",
      status: "active",
      metadata: { fixture: runId },
    },
    {
      user_id: userId,
      entity_type: "person",
      display_name: "Nadia",
      aliases: ["ma soeur", "Nadia"],
      relation_to_user: "sister",
      status: "active",
      metadata: { fixture: runId },
    },
    {
      user_id: userId,
      entity_type: "person",
      display_name: "Tania",
      aliases: ["mon ex", "Tania"],
      relation_to_user: "ex_partner",
      status: "active",
      metadata: { fixture: runId },
    },
  ]);

  await insertRows("chat_messages", buildMessages(userId));
}

async function seedDiverseContext(userId) {
  await insertRows("user_topic_memories", [
    {
      user_id: userId,
      slug: "budget_administratif",
      title: "Budget et administratif",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "budget depenses variables achats impulsifs factures assurance administratif dettes argent paiement",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        domain_keys: [
          "habitudes.planification",
          "objectifs.court_terme",
          "psychologie.controle_impulsions",
          "psychologie.emotions",
        ],
      },
    },
    {
      user_id: userId,
      slug: "sante_migraines",
      title: "Sante et migraines",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "migraine aura sommeil magnesium fatigue sante douleur annulation rendez-vous",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        domain_keys: [
          "sante.medical",
          "sante.douleur",
          "sante.sommeil",
          "sante.energie",
          "relations.limites",
        ],
      },
    },
    {
      user_id: userId,
      slug: "apprentissage_japonais",
      title: "Apprentissage du japonais",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "japonais JLPT N5 Mika professeur prononciation Anki flashcards revision",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        domain_keys: [
          "objectifs.long_terme",
          "objectifs.court_terme",
          "habitudes.execution",
          "habitudes.planification",
          "psychologie.motivation",
        ],
      },
    },
    {
      user_id: userId,
      slug: "relations_colocation_amis",
      title: "Relations, colocation et amis",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "Hugo ami photo rue Chloe colocataire limite logistique discussion apres 22h",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        domain_keys: [
          "relations.amitie",
          "relations.limites",
          "relations.conflit",
          "relations.appartenance_sociale",
          "habitudes.environnement",
        ],
      },
    },
    {
      user_id: userId,
      slug: "organisation_repas_logistique",
      title: "Organisation repas et logistique",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "repas midi dimanche preparation acheter dehors clefs logistique quotidien Lyon",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        domain_keys: [
          "habitudes.environnement",
          "habitudes.planification",
          "habitudes.execution",
          "objectifs.court_terme",
        ],
      },
    },
    {
      user_id: userId,
      slug: "preferences_accompagnement",
      title: "Preferences d'accompagnement",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "rappels budget factuels sans ton moralisateur messages trois points fatigue limites conseils",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        domain_keys: [
          "relations.limites",
          "sante.energie",
          "habitudes.planification",
          "psychologie.motivation",
        ],
      },
    },
  ]);

  await insertRows("user_entities", [
    {
      user_id: userId,
      entity_type: "person",
      display_name: "Hugo",
      aliases: ["Hugo", "ami Hugo"],
      relation_to_user: "friend",
      status: "active",
      metadata: { fixture: runId, scenario: scenarioName },
    },
    {
      user_id: userId,
      entity_type: "person",
      display_name: "Chloe",
      aliases: ["Chloe", "ma colocataire"],
      relation_to_user: "roommate",
      status: "active",
      metadata: { fixture: runId, scenario: scenarioName },
    },
    {
      user_id: userId,
      entity_type: "person",
      display_name: "Mika",
      aliases: ["Mika", "professeur de japonais"],
      relation_to_user: "teacher",
      status: "active",
      metadata: { fixture: runId, scenario: scenarioName },
    },
    {
      user_id: userId,
      entity_type: "project",
      display_name: "JLPT N5",
      aliases: ["N5", "JLPT"],
      relation_to_user: null,
      status: "active",
      metadata: { fixture: runId, scenario: scenarioName },
    },
  ]);

  await insertRows("chat_messages", buildDiverseMessages(userId));
}

async function seedParaphraseContext(userId) {
  await insertRows("user_topic_memories", [
    {
      user_id: userId,
      slug: "voyage_lisbonne",
      title: "Voyage a Lisbonne",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "Lisbonne voyage juin aeroport train hotel hebergement calme reservation valise budget",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        domain_keys: [
          "habitudes.planification",
          "habitudes.environnement",
          "objectifs.court_terme",
          "sante.energie",
        ],
      },
    },
    {
      user_id: userId,
      slug: "sante_allergies",
      title: "Sante et allergies alimentaires",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "allergie noix noisettes amandes dessert plaques rouges Dr Morel conseil medical snack",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        domain_keys: [
          "sante.medical",
          "sante.alimentation",
          "sante.douleur",
          "relations.limites",
        ],
      },
    },
    {
      user_id: userId,
      slug: "pratique_guitare",
      title: "Pratique de la guitare",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "guitare Blackbird septembre metronome arpeges repetition pratique confiance session",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        domain_keys: [
          "habitudes.execution",
          "habitudes.planification",
          "objectifs.court_terme",
          "psychologie.motivation",
        ],
      },
    },
    {
      user_id: userId,
      slug: "travail_orion",
      title: "Travail et client Orion",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "travail client Orion brief dossier professionnel stress projet personnel changement",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        domain_keys: [
          "travail.charge",
          "travail.performance",
          "travail.conflits",
          "psychologie.emotions",
        ],
      },
    },
    {
      user_id: userId,
      slug: "famille_lina",
      title: "Famille et soutien de Lina",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "Lina cousine famille restaurants allergie soutien pas collegue",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        domain_keys: [
          "relations.famille",
          "relations.limites",
          "sante.alimentation",
        ],
      },
    },
    {
      user_id: userId,
      slug: "preferences_deplacement",
      title: "Preferences pour les deplacements",
      status: "active",
      lifecycle_stage: "durable",
      search_doc:
        "checklist deplacement reponses courtes reservations fatigue plusieurs etapes organisation",
      pending_changes_count: 0,
      metadata: {
        fixture: runId,
        scenario: scenarioName,
        domain_keys: [
          "relations.limites",
          "habitudes.planification",
          "habitudes.execution",
          "sante.energie",
        ],
      },
    },
  ]);

  await insertRows("user_entities", [
    {
      user_id: userId,
      entity_type: "person",
      display_name: "Lina",
      aliases: ["Lina", "ma cousine"],
      relation_to_user: "cousin",
      status: "active",
      metadata: { fixture: runId, scenario: scenarioName },
    },
    {
      user_id: userId,
      entity_type: "person",
      display_name: "Dr Morel",
      aliases: ["Docteur Morel", "Dr Morel", "mon medecin"],
      relation_to_user: "doctor",
      status: "active",
      metadata: { fixture: runId, scenario: scenarioName },
    },
    {
      user_id: userId,
      entity_type: "organization",
      display_name: "Orion",
      aliases: ["client Orion", "dossier Orion", "Orion"],
      relation_to_user: "client",
      status: "active",
      metadata: { fixture: runId, scenario: scenarioName },
    },
  ]);

  await insertRows("chat_messages", buildParaphraseMessages(userId));
}

async function callMemorizer(userId) {
  return await requestJson(`${functionsUrl}/trigger-memorizer-daily`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "content-type": "application/json",
      "x-internal-secret": internalSecret,
      "x-request-id": runId,
    },
    body: JSON.stringify({
      user_id: userId,
      hours: 24,
      since_iso: isoMinutesAgo(24 * 60),
    }),
  });
}

async function fetchResults(userId, extractionRunId) {
  const items = await rest(
    `memory_items?user_id=eq.${userId}&extraction_run_id=eq.${extractionRunId}&select=id,kind,status,content_text,normalized_summary,domain_keys,confidence,importance_score,sensitivity_level,sensitivity_categories,requires_user_initiated,source_message_id,event_start_at,time_precision,canonical_key,metadata,created_at&order=created_at.asc`,
  );
  const runRows = await rest(
    `memory_extraction_runs?id=eq.${extractionRunId}&select=id,status,trigger_type,proposed_item_count,accepted_item_count,rejected_item_count,proposed_entity_count,accepted_entity_count,duration_ms,error_message,metadata`,
  );
  const topicLinks = await rest(
    `memory_item_topics?user_id=eq.${userId}&select=memory_item_id,topic_id,relation_type,confidence,metadata,user_topic_memories(slug,title)&order=confidence.desc`,
  );
  const sources = await rest(
    `memory_item_sources?user_id=eq.${userId}&select=memory_item_id,source_message_id,evidence_quote,evidence_summary,confidence`,
  );
  const messages = await rest(
    `chat_messages?user_id=eq.${userId}&role=eq.user&select=id,content,created_at&order=created_at.asc`,
  );
  return {
    items: Array.isArray(items) ? items : [],
    run: Array.isArray(runRows) ? runRows[0] : null,
    topicLinks: Array.isArray(topicLinks) ? topicLinks : [],
    sources: Array.isArray(sources) ? sources : [],
    messages: Array.isArray(messages) ? messages : [],
  };
}

function includesAny(text, terms) {
  const lower = normalizeForEval(text);
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function normalizeForEval(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function evaluate(results) {
  const joined = results.items.map((item) => `${item.kind} ${item.content_text} ${item.normalized_summary}`).join("\n").toLowerCase();
  const normalizedJoined = normalizeForEval(joined);
  if (scenarioName === "diverse") {
    const topicByItem = new Map();
    for (const link of results.topicLinks) {
      const slugs = topicByItem.get(link.memory_item_id) ?? [];
      slugs.push(link.user_topic_memories?.slug ?? null);
      topicByItem.set(link.memory_item_id, slugs);
    }
    const hasLinked = (terms, slug) =>
      results.items.some((item) =>
        includesAny(item.content_text, terms) &&
        (topicByItem.get(item.id) ?? []).includes(slug)
      );
    const byExpectation = [
      ["budget_cap", normalizedJoined.includes("350") && includesAny(joined, ["depenses", "budget"])],
      ["migraine_event", results.items.some((item) => item.kind === "event" && includesAny(item.content_text, ["migraine", "aura"]))],
      ["sleep_migraine_pattern", includesAny(joined, ["six heures", "sommeil", "dors moins"]) && joined.includes("migraine")],
      ["hugo_friend_not_brother", normalizedJoined.includes("hugo") && includesAny(joined, ["ami", "proche"]) && !normalizedJoined.includes("hugo est son frere")],
      ["chloe_roommate_not_partner", normalizedJoined.includes("chloe") && includesAny(joined, ["colocataire", "colocation"]) && !normalizedJoined.includes("chloe est sa compagne")],
      ["japanese_goal", normalizedJoined.includes("japonais") && (normalizedJoined.includes("jlpt") || normalizedJoined.includes("n5"))],
      ["anki_event", results.items.some((item) => item.kind === "event" && includesAny(item.content_text, ["anki", "flashcards", "18 minutes"]))],
      ["budget_sensitive_boundary", results.items.some((item) => includesAny(item.content_text, ["dette", "budget", "argent", "depense", "facture", "achat"]) && item.sensitivity_level !== "normal")],
      ["self_blame_not_fact", !results.items.some((item) => item.kind === "fact" && includesAny(item.content_text, ["irresponsable", "depensier", "dépensier"]))],
      ["budget_topic", hasLinked(["budget", "depenses", "facture", "assurance", "achats"], "budget_administratif")],
      ["health_topic", hasLinked(["migraine", "magnesium", "sommeil"], "sante_migraines")],
      ["japanese_topic", hasLinked(["japonais", "jlpt", "anki", "flashcards", "mika"], "apprentissage_japonais")],
      ["relations_topic", hasLinked(["hugo", "chloe", "colocataire"], "relations_colocation_amis")],
    ];
    return Object.fromEntries(byExpectation);
  }
  if (scenarioName === "paraphrase") {
    const topicByItem = new Map();
    for (const link of results.topicLinks) {
      const slugs = topicByItem.get(link.memory_item_id) ?? [];
      slugs.push(link.user_topic_memories?.slug ?? null);
      topicByItem.set(link.memory_item_id, slugs);
    }
    const hasLinked = (terms, slug) =>
      results.items.some((item) =>
        includesAny(item.content_text, terms) &&
        (topicByItem.get(item.id) ?? []).includes(slug)
      );
    const byExpectation = [
      ["lisbon_context", normalizedJoined.includes("lisbonne") && includesAny(joined, ["voyage", "hotel", "aeroport", "valise"])],
      ["budget_600_sensitive", results.items.some((item) => includesAny(item.content_text, ["600", "budget"]) && item.sensitivity_level !== "normal")],
      ["allergy_sensitive", results.items.some((item) => includesAny(item.content_text, ["allergie", "noix", "amandes"]) && item.sensitivity_level !== "normal")],
      ["allergy_event", results.items.some((item) => item.kind === "event" && includesAny(item.content_text, ["plaques", "dessert"]))],
      ["medical_boundary", includesAny(joined, ["conseil medical", "non sollicite", "non sollicité"])],
      ["guitar_goal", normalizedJoined.includes("guitare") && normalizedJoined.includes("blackbird")],
      ["guitar_event", results.items.some((item) => item.kind === "event" && includesAny(item.content_text, ["arpeges", "14 minutes"]))],
      ["orion_work", normalizedJoined.includes("orion") && includesAny(joined, ["client", "brief", "professionnel"])],
      ["lina_cousin_not_colleague", normalizedJoined.includes("lina") && includesAny(joined, ["cousine"]) && !normalizedJoined.includes("lina est sa collegue")],
      ["self_blame_not_fact", !results.items.some((item) => item.kind === "fact" && includesAny(item.content_text, ["incapable", "desorganise", "désorganisé"]))],
      ["travel_topic", hasLinked(["lisbonne", "hotel", "aeroport", "valise", "voyage"], "voyage_lisbonne")],
      ["health_topic", hasLinked(["allergie", "noix", "dessert", "plaques", "medical"], "sante_allergies")],
      ["guitar_topic", hasLinked(["guitare", "blackbird", "metronome", "arpeges"], "pratique_guitare")],
      ["work_topic", hasLinked(["orion", "brief", "client"], "travail_orion")],
      ["family_topic", hasLinked(["lina", "cousine"], "famille_lina")],
    ];
    return Object.fromEntries(byExpectation);
  }
  const byExpectation = [
    ["project_sophia", joined.includes("sophia") && joined.includes("whatsapp")],
    ["procrastination_floue", joined.includes("procrast") && (joined.includes("floue") || joined.includes("prochaine action"))],
    ["walk_event", results.items.some((item) => item.kind === "event" && includesAny(item.content_text, ["marche", "27 minutes"]))],
    ["sleep_scrolling", joined.includes("dors mal") || joined.includes("sommeil")],
    ["karim_manager", joined.includes("karim") && joined.includes("manager")],
    ["tania_ex_not_sister", joined.includes("tania") && joined.includes("ex") && !joined.includes("tania est la soeur")],
    ["cannabis_sensitive", results.items.some((item) => includesAny(item.content_text, ["cannabis"]) && item.sensitivity_level !== "normal")],
    ["self_blame_not_fact", !results.items.some((item) => item.kind === "fact" && includesAny(item.content_text, ["je suis nul", "nul"]))],
    ["do_not_memorize_indecis_trait", !results.items.some((item) => includesAny(item.content_text, ["indecis"]) && item.kind === "fact")],
    ["weekly_patterns", joined.includes("hebdo") || joined.includes("semaine") || joined.includes("patterns")],
  ];
  return Object.fromEntries(byExpectation);
}

function summarize(results) {
  const topicByItem = new Map();
  for (const link of results.topicLinks) {
    const list = topicByItem.get(link.memory_item_id) ?? [];
    list.push({
      slug: link.user_topic_memories?.slug ?? null,
      confidence: link.confidence,
      reason: link.metadata?.reason ?? null,
    });
    topicByItem.set(link.memory_item_id, list);
  }
  const sourceByItem = new Map(results.sources.map((source) => [source.memory_item_id, source]));
  return results.items.map((item) => ({
    kind: item.kind,
    status: item.status,
    sensitivity_level: item.sensitivity_level,
    confidence: item.confidence,
    domain_keys: item.domain_keys,
    content_text: item.content_text,
    event_start_at: item.event_start_at,
    time_precision: item.time_precision,
    topic_links: topicByItem.get(item.id) ?? [],
    evidence_quote: sourceByItem.get(item.id)?.evidence_quote ?? null,
  }));
}

async function main() {
  const { userId, email } = await createUser();
  if (scenarioName === "diverse") {
    await seedDiverseContext(userId);
  } else if (scenarioName === "paraphrase") {
    await seedParaphraseContext(userId);
  } else {
    await seedContext(userId);
  }
  const trigger = await callMemorizer(userId);
  const memorizer = trigger?.processed?.[0]?.memorizer ?? null;
  const extractionRunId = memorizer?.extraction_run_id;
  if (!extractionRunId) {
    throw new Error(`Memorizer did not return an extraction_run_id: ${JSON.stringify(trigger)}`);
  }
  const results = await fetchResults(userId, extractionRunId);
  const report = {
    ok: true,
    run_id: runId,
    scenario: scenarioName,
    user: { id: userId, email },
    trigger_summary: {
      processed_count: trigger.processed_count,
      message_count: trigger.processed?.[0]?.message_count,
      memorizer,
    },
    extraction_run: {
      id: results.run?.id,
      status: results.run?.status,
      proposed_item_count: results.run?.proposed_item_count,
      accepted_item_count: results.run?.accepted_item_count,
      rejected_item_count: results.run?.rejected_item_count,
      proposed_entity_count: results.run?.proposed_entity_count,
      accepted_entity_count: results.run?.accepted_entity_count,
      duration_ms: results.run?.duration_ms,
      error_message: results.run?.error_message,
      rejected_observations: results.run?.metadata?.rejected_observations ?? [],
      write_decisions: results.run?.metadata?.write_decisions ?? [],
    },
    counts: {
      input_user_messages: results.messages.length,
      persisted_items: results.items.length,
      active_items: results.items.filter((item) => item.status === "active").length,
      candidate_items: results.items.filter((item) => item.status === "candidate").length,
    },
    expectation_checks: evaluate(results),
    memory_items: summarize(results),
  };
  const outPath = path.join(cwd, "tmp", `${runId}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    run_id: runId,
    scenario: scenarioName,
    user_id: userId,
    email,
    report_path: outPath,
    counts: report.counts,
    extraction_run: report.extraction_run,
    expectation_checks: report.expectation_checks,
    memory_items: report.memory_items,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    body: error?.body ?? null,
  }, null, 2));
  process.exit(1);
});
