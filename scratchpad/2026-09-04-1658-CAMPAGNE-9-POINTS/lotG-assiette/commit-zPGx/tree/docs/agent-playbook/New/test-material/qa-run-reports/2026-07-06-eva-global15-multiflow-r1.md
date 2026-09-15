# QA Run Report - eva-global15-multiflow-r1 (2026-07-06)

## 1. Contexte Du Test

- Date: 2026-07-06
- Run: `eva-global15-multiflow-r1-20260706`
- Persona: Eva (`bfa52a7a-8aaf-432a-b702-7d739df0f478`, `eva@gmail.com`), thème "habitude numérique / scroll du soir". Scope dédié `qa-eva-g16-20260706` (isolation du transcript).
- Objectif: run conversationnel de 15 tours balayant plusieurs flows/options (soutien émotionnel, operation suggestion / cartes attaque+défense, génération/ajustement de plan, track progress succès + échec, mémoire, register émotionnel sensible).
- Trajectoire: ouverture émotionnelle → recommandation (texte magique / mot de bascule) → demande de plan → routage ajustement → report d'action faite (commit) → report d'échec (gated) → intention mémoire → creux émotionnel → carte de défense sur le déclencheur précis → récap.
- Surfaces visées: dispatcher / `response_owner`, `coaching_recommendation`, `plan_realignment`, tool skill `track_progress_plan_item`, safety pregate, mémorisation nocturne (`trigger-memorizer-daily`), effets durables (`user_plan_item_entries`, `memory_items`).
- Cadre IA reel: `POST /functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, chemin IA réel local. Auth: login password local + `x-user-authorization`, token vérifié via `/auth/v1/user` (JWT jamais affiché). Aucun fallback déterministe, aucun renderer, aucun executor appelé directement.
- Validite QA: **valide**. 15/15 tours HTTP 200, `ok=true`, réponses assistant produites par le chemin IA réel. Effets durables vérifiés en DB. État remis à zéro en fin de run.

## 2. Tours De Conversation

### Tour 1
**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 — Mauvais owner sélectionné (altitude d'entrée)

**User**
> Salut... je sais pas trop par où commencer en vrai. Ça fait plusieurs soirs que je rentre, je m'affale sur le canapé et je reprends mon tel 'deux minutes', et quand je relève les yeux il est 23h30 et j'ai rien fait de ma soirée. Je commence à me trouver un peu pathétique là.

**Sophia**
> Je comprends, c'est un vrai piège automatique, et ça ne veut pas dire que tu es pathétique. Je partirais sur une carte d'attaque, technique texte magique : une phrase courte pour couper le récit du « deux minutes » et lancer tout de suite une alternative au scroll au moment où tu rentres.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `risk_band=low`, reason_codes=[]
- direct_effects: []
- operation: none (aucun commit)
- pending_confirmation: none
- memory_plan: none
- executed_tools: skill_run `coaching_recommendation` (status=continue)
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: sur un premier message qui est d'abord une divulgation émotionnelle + auto-jugement ("pathétique"), Sophia valide une demi-ligne puis saute immédiatement à une tactique produit, avec du jargon interne non traduit ("carte d'attaque", "technique texte magique") qu'une vraie utilisatrice ne connaît pas.
- Source amont probable: le dispatcher choisit `coaching_recommendation` comme owner dès T1 sans beat d'exploration/validation, et le rendu laisse fuiter le vocabulaire système des cartes.
- Owner runtime: dispatcher / route policy (choix d'owner + altitude d'entrée du skill recommandation).
- Meilleure correction selon les guidelines: la charte anti-patching interdit un patch de phrase; corriger en amont la politique d'entrée du skill recommandation pour exiger un beat de compréhension/miroir avant de proposer une carte quand le tour porte un marqueur émotionnel fort, et masquer le vocabulaire interne ("carte d'attaque"/"texte magique") derrière un langage naturel tant que l'utilisateur n'a pas adopté le terme.
- Pourquoi ce n'est pas un patch local: le problème est l'altitude de handoff émotionnel→produit décidée par le dispatcher, pas une formulation isolée; une regex sur "pathétique" ne couvrirait pas la famille.

### Tour 2
**Verdict du tour:** green

**User**
> Attends, 'carte d'attaque', 'texte magique', je te suis pas trop là 😅. En vrai le moment où ça part c'est même pas devant une appli précise. C'est juste quand je passe la porte, je pose mes clés, et là y a un espèce de vide, je sais pas quoi faire de moi. Le tel c'est juste le truc le plus facile à attraper à ce moment-là.

**Sophia**
> Oui, je te traduis simplement :
> - carte d'attaque = un coup de pouce pour démarrer l'action quand ça bloque au départ
> - texte magique = une petite phrase courte pour couper le mode automatique et lancer le bon geste
> Dans ton cas, le vrai point de friction n'est pas une appli précise, c'est le vide juste en entrant. Donc l'idée reste bien une carte d'attaque, avec une phrase qui aide à passer ce moment de bascule.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason: `active_coaching_recommendation`
- safety: `risk_band=none` · direct_effects: [] · durable_effect: aucun

Bonne récupération: Sophia explique le jargon en clair (conforme à "expliquer simplement la différence") et ré-ancre la technique sur le vrai déclencheur (le vide au passage de la porte = fenêtre de bascule). Technique cohérente avec le contexte.

### Tour 3
**Verdict du tour:** green

**User**
> Ok d'accord, vu comme ça. Mais concrètement ça donnerait quoi cette phrase ? J'ai du mal à voir ce que je pourrais me dire à moi-même qui changerait vraiment quelque chose sur le moment.

**Sophia**
> Oui — vise une phrase très courte, qui coupe le pilote automatique et te remet en mouvement. Par exemple : « Je pose les clés, pas le tel. Je choisis 10 minutes pour moi d'abord. » Si tu veux, je peux t'en proposer 3 versions plus naturelles, selon ton ton.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · safety: none · durable_effect: aucun

Concret, sans jargon, propose d'affiner selon le ton. Naturel.

### Tour 4
**Verdict du tour:** green

**User**
> Vas-y propose-m'en 3. Mais plutôt un ton un peu cash, direct, limite qui me secoue. Les trucs trop doux genre 'sois bienveillante avec toi' ça me glisse dessus.

**Sophia**
> Oui — en mode cash, je te propose :
> 1. « Clés posées. Tel rangé. Je fais le premier vrai geste maintenant. »
> 2. « Pas de pilote automatique : je bouge avant de scroller. »
> 3. « J'ai le vide, pas l'excuse. Je lance ma soirée en 10 minutes. »
> La plus solide, à mon avis : la 2, parce qu'elle tape directement sur le réflexe au moment où tu passes la porte.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · durable_effect: aucun

Slot "ton = cash" respecté, 3 variantes + recommandation justifiée reliée au déclencheur. Green.

### Tour 5
**Verdict du tour:** green

**User**
> Ok la 2 me plaît bien. Mais franchement une phrase toute seule je sais que ça va pas tenir... J'aimerais un truc un peu plus construit, genre sur les deux prochaines semaines, pour vraiment reprendre mes soirées en main. Tu peux m'aider à poser un plan comme ça ?

**Sophia**
> Oui. Là, ce que tu demandes n'est plus juste une phrase de départ : tu veux recalibrer l'action sur 2 semaines pour qu'elle tienne vraiment. Je partirais donc sur un ajustement du plan, parce qu'on va surtout vérifier le rythme, la place dans tes soirées et ce qui est réaliste à tenir, puis le remettre à ta taille.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · durable_effect: aucun

Eva formule une création ("poser un plan"), mais elle a déjà un plan actif (vérifié DB: `user_plans_v2` actif, 9 items). Steerer vers un ajustement plutôt que dupliquer est défendable (cohérent avec la doctrine adjust-plan-v1: éviter duplication). Note UX mineure: Sophia ne rappelle pas ce qu'est le plan existant. Non bloquant.

### Tour 6
**Verdict du tour:** green

**User**
> Ah ouais c'est vrai qu'on avait commencé un truc ensemble, j'avoue que j'avais un peu lâché. Ok vas-y on l'ajuste alors. Là honnêtement c'est trop chargé pour moi, j'aimerais alléger : garder juste 2-3 soirs par semaine où je fais un truc concret à la place du scroll, pas tous les soirs.

**Sophia**
> Oui, c'est exactement le bon endroit pour ça : va dans Dashboard > Plan > Ajuster mon plan. Dans le cadre, écris surtout : ce qui n'a pas tenu, pourquoi ça a coincé, ce que tu veux garder, ce qui est devenu trop lourd, et le rythme que tu vois vraiment comme tenable. Là, ton idée clé est claire : passer de tous les soirs à 2–3 soirs par semaine.

**Trace courte**
- http_status: 200 · response_owner: `plan_realignment` · selected_handler: `plan_realignment`
- direct_effects: [] · operation: none · durable_effect: aucun patch appliqué

Owner bascule correctement vers `plan_realignment`. Conforme à la doctrine adjust-plan-v1 (cadre d'ajustement dédié) et à la règle "aucun patch de plan sans confirmation": aucun effet durable appliqué depuis le chat. Handoff vers l'UI = friction UX (voir §3) mais routage/side-effects corrects.

### Tour 7
**Verdict du tour:** green

**User**
> Ah ok, j'irai voir ça. Mais tiens, en attendant, faut que je te dise : hier soir j'ai réussi un truc. Au lieu de scroller j'ai carrément posé le tel dans l'autre pièce et j'ai lu genre 20 minutes. C'était pas énorme mais je me suis couchée à une heure normale pour une fois. Note-le quelque part, ça me motive de voir que j'y arrive.

**Sophia**
> Tu parles de quelle action exactement ? Je pensais à « Faire une coupure écran avant le lit », mais je préfère que tu me la nommes avant de la noter. En tout cas, c'est un vrai bon move : tu as coupé le scroll, tu as lu, et tu t'es couchée à une heure normale 🙂

**Trace courte**
- http_status: 200 · response_owner: `normal_reply`
- executed_tools: tool_skill `track_progress_plan_item` → **status=needs_clarify, reason=target_not_evidenced**
- requested_effects: 1 (item `754f1544` "Faire une coupure écran avant le lit", progress=completed, date_hint=2026-07-05) · committed: 0 · blocked: 1
- durable_effect: aucun (commit gated, en attente de confirmation)

Comportement exemplaire: le tool skill mappe un item réel du plan mais **bloque** le commit (`target_not_evidenced`) et demande confirmation, au lieu d'un "c'est noté" sans preuve. Pas de faux accusé.

### Tour 8
**Verdict du tour:** green

**User**
> Oui c'est exactement ça, la coupure écran avant le lit. Valide-la pour hier soir, je l'ai bien faite.

**Sophia**
> C'est validé pour hier soir : tu as bien fait ta coupure écran avant le lit ✅

**Trace courte**
- http_status: 200 · response_owner: `normal_reply`
- executed_tools: tool_skill `track_progress_plan_item` → **status=logged, committed=1**, `logged_progress_id=8bfcab16…`
- durable_effect: **vérifié DB** — `user_plan_item_entries` (entry_kind=`checkin`, outcome=`completed`, plan_item_id=`754f1544`, effective_at=`2026-07-05`, source=`router_parallel_tracking_v2`, channel=web). Intention utilisateur = effet durable, exactement.

Boucle track_progress complète et correcte: gate (T7) → confirmation (T8) → commit durable sur le bon item et la bonne date.

### Tour 9
**Verdict du tour:** green

**User**
> Bon après faut être honnête, les autres soirs c'était pas glorieux. Mardi surtout j'étais crevée en rentrant et j'ai replongé direct, genre 1h30 sur Insta sans m'en rendre compte. Du coup je sais pas trop comment le noter ça, c'est un échec quoi.

**Sophia**
> Non, c'est pas un échec. C'est plutôt une rechute très classique dans un moment de fatigue : tu as vu le déclencheur, et ça te donne justement une info utile sur ton réflexe téléphone. Si tu veux le noter proprement, je le prendrais comme un soir difficile avec scroll non voulu, pas comme "tout est raté" 😌

**Trace courte**
- http_status: 200 · response_owner: `normal_reply`
- executed_tools: tool_skill `track_progress_plan_item` → **status=needs_clarify, reason=target_not_evidenced**
- requested_effects: 1 (progress=missed, date_hint=2026-07-01) · committed: 0 · blocked: 1
- durable_effect: aucun (miss non commité sans confirmation)

Recadrage émotionnel juste (dé-dramatise "échec", extrait l'info du déclencheur), et surtout **aucun commit d'échec** sans confirmation. Note mineure (non bloquante): la date proposée (2026-07-01) et l'item ciblé (coupure écran, alors que le miss concerne plutôt "moins d'1h de réseaux") sont approximatifs — mais gated, donc aucun effet durable faux.

### Tour 10
**Verdict du tour:** green

**User**
> Bon en tout cas y a un truc que j'aimerais que tu retiennes sur moi pour la suite : les soirs où je rentre après 21h, c'est fichu d'avance, j'ai plus aucune volonté. C'est jamais ces soirs-là que je vais réussir quoi que ce soit, faut pas qu'on compte dessus.

**Sophia**
> C'est noté, je le garde en tête : après 21h, tes soirs sont des soirs à risque et il ne faut pas les traiter comme des soirs "productifs" 🙂 Ça m'aidera à être plus juste avec toi sur la suite.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · executed_tools: aucun · durable_effect: aucun in-turn (attendu)
- memory: vérifié **après** batch nocturne (voir §4) — `trigger-memorizer-daily` → `memory_items` contient le fait fidèle "L'utilisateur perd toute volonté et capacité à agir s'il rentre chez lui après 21h."

Accusé de mémorisation conforme au contrat memorizer nocturne (pas d'écriture in-turn). Fidélité vérifiée post-batch.

### Tour 11
**Verdict du tour:** green

**User**
> Ouais... franchement des fois je me dis que je vais jamais vraiment changer. Je me trouve faible, je me trouve toujours des excuses, et ça me saoule de moi-même. J'ai un peu honte d'en être encore là à 29 ans à galérer sur un truc aussi con qu'un téléphone.

**Sophia**
> Ça ne fait pas de toi quelqu'un de faible. Ça montre surtout qu'un vieux réflexe tient encore quand tu es fatiguée, pas que tu es nulle. Et à 29 ans, galérer sur le téléphone, c'est loin d'être "con" : c'est juste un vrai point de friction pour beaucoup de gens. 🙂 Le seul truc que je retiens là, c'est que la honte te met encore plus de pression que le téléphone lui-même.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · safety: `risk_band=none`
- executed_tools: aucun · operation: none · durable_effect: aucun

Soutien émotionnel soutenu et juste sur un creux (honte / faible estime), **sans** sur-déclenchement safety (pas de hotline mécanique, risk_band correctement `none`) et **sans** pousser un tool/plan. Comportement attendu.

### Tour 12
**Verdict du tour:** green

**User**
> Merci... ça fait du bien de le poser comme ça franchement. Bon je veux pas rester à me plaindre non plus. Aide-moi plutôt à sécuriser le moment où je passe la porte le soir, parce que c'est vraiment LÀ que tout se joue : si je tiens ces 30 premières secondes, le reste de la soirée passe mieux.

**Sophia**
> Oui, là je partirais sur une carte de défense : le vrai enjeu, c'est le moment critique en rentrant, pas le plan lui-même. On va viser 4 choses : le moment exact où ça déraille, le piège visible qui t'embarque, un geste de retour faisable en moins de 30 secondes, et un plan B tout simple si tu sens que tu pars déjà dans le téléphone.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · durable_effect: aucun

Handoff émotion→action naturel (Eva signale qu'elle est prête). Bonne bascule de technique: **carte de défense** (distincte de la carte d'attaque de T1-T4), avec la structure exacte attendue (moment de rupture / piège concret / geste <30s / plan B) — conforme aux guidelines sur les cartes de défense.

### Tour 13
**Verdict du tour:** green

**User**
> Ok alors : le moment exact c'est quand je pose mes clés dans l'entrée et que le silence de l'appart me tombe dessus, ce petit vide là. Le piège c'est que mon tel est déjà dans ma main, je l'ai sorti dans le métro et je l'ai jamais rangé, donc il est juste là. Comme geste de retour en 30 secondes... franchement je sais pas, dis-moi ce qui pourrait marcher.

**Sophia**
> Oui — dans ton cas, le geste de retour le plus simple, c'est : poser tes clés et poser aussi ton téléphone, volontairement, dans un autre point de l'entrée avant de faire quoi que ce soit d'autre. Comme ça, tu coupes le réflexe "main déjà dessus" au moment du vide. Si tu veux, on peut maintenant préciser le plan B simple pour les soirs où tu sens que tu as déjà décroché.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · durable_effect: aucun

Geste de retour taillé sur son piège réel ("main déjà dessus"). Personnalisé, concret.

### Tour 14
**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-01 — Claim sans commit (surface produit sur-promise)

**User**
> Ah ouais le poser loin, pas juste le tenir, ça change déjà pas mal en fait. Pour le plan B, admettons que je réalise que je suis déjà en train de scroller depuis 10 min : je fais quoi à ce moment-là ? Et surtout, tu peux me garder cette carte quelque part pour que je la retrouve facilement le soir ?

**Sophia**
> Pour le plan B, si tu réalises que tu scrolles déjà depuis 10 min, fais une reprise ultra simple : pose le téléphone hors de portée, lève-toi, va boire un verre d'eau, puis reviens décider de la suite sans toucher à l'écran pendant 1 minute. Le but n'est pas de "rattraper" la soirée, juste de casser l'inertie. Et pour la retrouver le soir, une carte de défense liée à cette action se consulte ensuite dans Dashboard > Ressources. Si tu veux, je peux maintenant t'aider à choisir le plus petit plan B possible pour que ce soit facile à tenir.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation`
- executed_tools: skill_run `coaching_recommendation` seul · operation: none · direct_effects: []
- durable_effect: **aucun** (aucune carte/opération persistée sur tout l'arc recommandation T1→T14)

**Analyse si yellow/red**
- Symptome: Eva demande explicitement "tu peux me garder cette carte quelque part ?". Sophia répond que "une carte de défense liée à cette action se consulte ensuite dans Dashboard > Ressources" — ce qui laisse entendre qu'un artefact consultable existera, alors qu'aucune opération n'a été proposée ni commitée pendant toute la conversation. Risque d'attente déçue: Eva va chercher "sa" carte et ne la trouvera pas.
- Source amont probable: le skill `coaching_recommendation` reste purement conversationnel; il ne matérialise pas la carte co-construite en une opération durable (avec confirmation), mais renvoie vers une surface produit générique comme si l'artefact y était déjà.
- Owner runtime: skill `coaching_recommendation` + contrat operation-suggestion (frontière recommandation verbale ↔ opération persistée) + final response guard (EffectLedger).
- Meilleure correction selon les guidelines: soit le skill propose réellement l'opération "carte de défense" (draft → confirmation → commit, surfacé dans Dashboard > Ressources) et le ledger garantit qu'on ne pointe vers une ressource que si elle est commitée; soit, si l'architecture veut que ces cartes ne se créent que via le système d'operation suggestion attaché à une action de plan, alors le langage doit cesser d'impliquer un artefact "à retrouver" et proposer explicitement le vrai chemin de création. Owner à trancher: est-ce un `BF-LEDGER-01` (on pointe une ressource non commitée) ou un choix produit assumé ?
- Pourquoi ce n'est pas un patch local: retirer la phrase "Dashboard > Ressources" masquerait le symptôme sans régler la frontière recommandation→opération; le fix doit décider où et comment la carte co-construite devient (ou non) un effet durable.

### Tour 15
**Verdict du tour:** green

**User**
> Ok c'est bon pour moi ce soir, ça m'a bien aidée franchement. Tu peux me faire un récap tout simple de ce qu'on a posé aujourd'hui ? Histoire que je parte avec juste les 2-3 trucs concrets à retenir pour ce soir en rentrant.

**Sophia**
> Oui — très simple :
> - En rentrant, tu poses tes clés et ton téléphone à un endroit séparé dès l'entrée.
> - Tu ne gardes pas le tel en main : c'est le gros piège à couper.
> - Si tu te mets déjà à scroller, tu coupes net : téléphone hors de portée, un verre d'eau, puis tu reprends sans te jeter sur l'écran.
> Le point clé du soir, c'est le sas d'entrée. Pas la motivation. 🙂

**Trace courte**
- http_status: 200 · response_owner: `normal_reply`
- executed_tools: skill_run `coaching_recommendation` avec `exit_target` / `exit_note_information` (sortie propre du flow)
- durable_effect: aucun

Récap fidèle et concret des 3 gestes clés, sortie du mode recommandation propre (pas de flow résiduel). Bonne clôture.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Soutien émotionnel juste et non moralisateur (T2, T9, T11): dé-dramatise l'auto-jugement sans nier le problème.
- Personnalisation forte: à partir de T2, la technique et les gestes sont taillés sur le vrai déclencheur d'Eva (passage de la porte, tel déjà en main).
- Respect du ton demandé (T4, "cash").
- Handoffs émotion→action naturels (T11→T12), et bascule pertinente de la carte d'attaque vers la carte de défense (T12) sur le bon moment de rupture.
- Récap final clair et actionnable (T15), sortie de mode propre.

**Problemes**
- Tour 1: saut immédiat vers une tactique produit + jargon interne non traduit ("carte d'attaque", "texte magique") sur un premier message émotionnel. Famille: BF-ROUTE-01. Impact: l'utilisatrice doit demander une traduction (T2) et peut se sentir "process-ée". Severite: yellow.
- Tour 14: réponse qui laisse croire qu'une carte est consultable dans "Dashboard > Ressources" alors que rien n'a été persisté. Famille: BF-LEDGER-01. Impact: attente déçue potentielle, perte de confiance. Severite: yellow.
- Tour 6: bascule correcte mais renvoi vers l'UI ("Dashboard > Plan > Ajuster mon plan") en plein élan conversationnel — friction de handoff produit (par design adjust-plan-v1, donc acceptable, mais coûteux côté fluidité). Severite: green (non bloquant).

**Fix propose**
- Source amont: politique d'entrée du skill `coaching_recommendation` (altitude T1) + frontière recommandation→opération/ledger (T14).
- Correction recommandée: exiger un beat de compréhension avant de nommer une carte quand le tour porte un marqueur émotionnel; masquer le vocabulaire système tant qu'il n'est pas adopté; ne référencer une ressource produit consultable que si une opération est réellement commitée.
- Tests d'invariant attendus: (a) premier tour émotionnel → owner/altitude n'introduit pas de terme "carte/technique" avant validation; (b) toute mention d'une ressource "à retrouver" implique un effet durable commité dans le ledger.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Le dispatcher choisit majoritairement le bon `response_owner`: `coaching_recommendation` pour les demandes de technique (T1-T5, T12-T14), `plan_realignment` pour l'ajustement (T6), `normal_reply` + tool skill pour le track progress (T7-T9), `normal_reply` pour l'émotionnel/mémoire (T10-T11) et le récap (T15).
- Réserve T1: la sélection `coaching_recommendation` dès le premier message émotionnel est prématurée (BF-ROUTE-01) — owner correct sur le fond "habitude", mais altitude d'entrée trop rapide.
- Le flow actif `coaching_recommendation` se relâche proprement en fin de run (T15 `exit_target`), pas de capture parasite type BF-ROUTE-02 observée.

**Skills / Operations / Tools**
- `track_progress_plan_item`: exemplaire. T7 gate `needs_clarify` (target_not_evidenced), T8 commit après confirmation, T9 miss gated sans commit. Slots collectés avant exécution, aucune écriture non consentie.
- `plan_realignment` (T6): aucun patch appliqué sans confirmation (conforme). Renvoi vers le cadre dédié.
- `coaching_recommendation` (T1-T5, T12-T14): purement verbal, ne produit aucune opération durable. À trancher côté contrat: c'est le point BF-LEDGER-01 de T14 (on renvoie vers une ressource non matérialisée).

**Memory / Effets durables**
- Mémoire: contrat memorizer nocturne respecté (aucune écriture in-turn à T10). Après `trigger-memorizer-daily` en fin de run: 6 `memory_items` fidèles, dont le fait "après 21h" (T10), la préférence 2-3 soirs (T6), le succès du 5 juillet (event, T7-T8), le moment de rupture d'entrée (T13), la préférence de ton cash (T4). Pas de BF-MEMORY-01.
- Effet durable track progress vérifié en DB (T8) et cohérent avec l'intention. Aucun effet durable faux, aucun side effect pendant les tours émotionnels (T9, T11).
- Safety: `risk_band` proportionné (none/low), aucun sur-déclenchement, aucun blocage nécessaire non appliqué.

**Problemes**
- Tour 1: owner/altitude d'entrée. Famille: BF-ROUTE-01. Impact systeme: handoff émotionnel→produit trop précoce décidé par la route policy. Severite: yellow.
- Tour 14: renvoi vers "Dashboard > Ressources" sans opération commitée. Famille: BF-LEDGER-01. Impact systeme: la réponse visible implique une ressource durable absente. Severite: yellow.

**Fix propose**
- Source amont: route policy (T1) et frontière skill recommandation ↔ operation-suggestion/EffectLedger (T14).
- Correction recommandée: cf. §3; côté système, ajouter un garde final "ne pas référencer une ressource consultable sans effet durable correspondant dans le ledger".
- Tests d'invariant attendus: positif (mention ressource ⇒ commit présent), paraphrase (formulations variées "garde ça / retrouve ça"), anti-FP (recommandation verbale sans promesse de ressource reste permise).

## Verdict Global

- Verdict: **yellow**
- Raison principale: système sain sur les effets durables critiques (track progress commité correctement, adjust-plan sans patch non confirmé, mémoire nocturne fidèle, safety proportionnée), mais deux frictions récurrentes de la couche recommandation: altitude d'entrée trop rapide + jargon (T1, BF-ROUTE-01) et sur-promesse de ressource produit non matérialisée (T14, BF-LEDGER-01).
- Follow-up prioritaire: trancher le contrat `coaching_recommendation` → operation-suggestion (T14) : soit la carte co-construite devient une opération durable confirmée, soit le langage cesse d'impliquer un artefact "à retrouver". En second, revoir l'altitude d'entrée du skill recommandation sur un premier tour émotionnel.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-06-eva-global15-multiflow-r1-bugs.md`

## Annexe — Validité & Hygiène

- Chemin IA réel: `test-send-message` + `force_full_ai=true`, 15/15 tours HTTP 200 `ok=true`, latences 4.5s–37s (Gemini/OpenAI réels). Aucun fallback, renderer, ou executor direct.
- Auth: login password local + `x-user-authorization: Bearer <access_token>` (vérifié via `/auth/v1/user`), gateway via `Authorization: Bearer <ANON_KEY>`. JWT jamais affiché ni journalisé.
- Isolation: scope dédié `qa-eva-g16-20260706`; T1 propre (aucun `__active_skill_state` / `active_flow_state` résiduel avant run).
- Reset fin de run (autorisé): supprimés — 30 `chat_messages` (scope run), `user_chat_states` (scope run), 1 `user_plan_item_entries` (T8), 6 `memory_items` + enfants + `memory_message_processing` (15) + `memory_observability_events` (13) + `memory_extraction_runs` (1) de l'extraction_run `c7e57f37…`. Vérifié: retour à la baseline (`memory_items=0`, `current_reps=2` inchangé). Aucune commande reboot Supabase utilisée. Aucun code corrigé pendant le run.
