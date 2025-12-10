import { useState, useMemo, useEffect } from 'react';
import { 
  ArrowLeft, 
  Cpu, 
  Lock, 
  X,
  Send,
  Save,
  Maximize2,
  Sparkles,
  Layers,
  Clock,
  History,
  GitCommit,
  Sword,
  Shield,
  Crown,
  Anchor,
  Compass,
  Users,
  BookOpen,
  Zap,
  BarChart2,
  Leaf,
  Flame,
  PenTool,
  ShieldCheck,
  Hammer,
  ChevronRight,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WEEKS_CONTENT } from '../data/weeksContent';
import { WEEKS_PATHS } from '../data/weeksPaths';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// --- TYPES ---
type ModuleStatus = 'locked' | 'active' | 'completed' | 'stable';

interface ModuleHistory {
  version: string;
  date: string;
  content: string;
}

interface SystemModule {
  id: string;
  parentId?: string;
  level: number;
  rowId: number;
  title: string;
  icon?: React.ReactNode;
  version: string;
  lastUpdate: string;
  status: ModuleStatus;
  content?: string;
  history: ModuleHistory[];
  originalQuestion?: string;
  originalHelper?: string;
  originalWeekTitle?: string;
  rowTitle?: string;
}

// --- ICONS MAPPING ---
const ICONS_BY_WEEK: Record<string, React.ReactNode> = {
  "1": <Sword className="w-8 h-8 text-emerald-400" />,
  "2": <Anchor className="w-8 h-8 text-amber-400" />,
  "3": <Zap className="w-8 h-8 text-cyan-400" />,
  "4": <Crown className="w-8 h-8 text-purple-400" />,
  "5": <Compass className="w-8 h-8 text-red-400" />,
  "6": <Users className="w-8 h-8 text-blue-400" />,
  "7": <BookOpen className="w-8 h-8 text-emerald-400" />,
  "8": <Flame className="w-8 h-8 text-orange-400" />,
  "9": <BarChart2 className="w-8 h-8 text-indigo-400" />,
  "10": <Leaf className="w-8 h-8 text-green-400" />,
  "11": <Shield className="w-8 h-8 text-yellow-400" />,
  "12": <Sparkles className="w-8 h-8 text-pink-400" />,
};

// --- CONSTANTS ---
const ARMOR_IDS = [1, 2, 3, 6, 9, 10];
const WEAPON_IDS = [4, 5, 7, 8, 11, 12];

// --- DATA GENERATOR ---
const generateBranchData = (weekId: number, moduleData: Record<string, any>) => {
  const weekStr = weekId.toString();
  const weekData = WEEKS_CONTENT[weekStr];
  if (!weekData) return [];

  const modules: SystemModule[] = [];
  const folderId = `folder_a${weekId}`;

  weekData.subQuestions.forEach((sq, index) => {
    const rowTitle = sq.question;
    const pathIndex = index + 1; // 1-based index for ID generation

    // Helper to check status based on previous levels AND time lock
    const getStatus = (lvl: number): ModuleStatus => {
        const currentId = `a${weekId}_c${pathIndex}_m${lvl}`;
        const prevId = `a${weekId}_c${pathIndex}_m${lvl - 1}`;
        const moduleInfo = moduleData[currentId];
        
        // 1. VÉRIFICATION DU DÉLAI (Time Lock) - PRIORITAIRE
        // On vérifie le available_at dans user_module_state_entries pour CHAQUE carte
        if (moduleInfo?.availableAt) {
            const unlockDate = new Date(moduleInfo.availableAt);
            const now = new Date();
            if (now < unlockDate) return 'locked'; // Cadenas si date future
        } else if (lvl > 1) {
            // Si pas de date définie et niveau > 1, on verrouille par sécurité
            // Cela force l'existence d'une entrée (ou trigger) pour débloquer
            return 'locked';
        }

        // 2. Si le module a du contenu -> Completed
        // On vérifie que le contenu n'est pas vide (objet vide ou chaîne vide)
        const hasContent = (() => {
            if (!moduleInfo?.content) return false;
            // Si c'est un objet { content: "..." }
            if (typeof moduleInfo.content === 'object' && 'content' in moduleInfo.content) {
                return (moduleInfo.content.content as string)?.trim().length > 0;
            }
            // Si c'est une string directe (legacy ou autre format)
            if (typeof moduleInfo.content === 'string') {
                return moduleInfo.content.trim().length > 0;
            }
            return false;
        })();

        if (hasContent) return 'completed';

        // 3. Si c'est le Niveau 1, et que le Time Lock est passé (ou absent), c'est actif
        if (lvl === 1) return 'active';

        // 4. Si le niveau précédent n'est pas fini -> Locked
        const prevInfo = moduleData[prevId];
        if (!prevInfo?.content) return 'locked';

        // Si tout est bon (Précédent fini + Date passée) -> Active
        return 'active';
    };
    
    // ... (rest of variable definitions)
    
    let lvl1Title = sq.question;
    let lvl1Question = sq.placeholder;
    let lvl1Helper = sq.helperText;
    
    let lvl2Title = "Structure & Analyse";
    let lvl2Question = `Pour le domaine "${sq.question}", explique pourquoi tu ne te sens pas à ta place. (Formule : 'Dans ce domaine, je ne me sens pas à ma place parce que...')`;
    let lvl2Helper = "Attrape le bug par la racine. Quelle est la phrase exacte ?";

    let lvl3Title = "Plan d'Action";
    let lvl3Question = `Quelles actions concrètes (1 à 3) peux-tu faire cette semaine pour devenir plus compétent spécifiquement sur "${sq.question}" ?`;
    let lvl3Helper = "Pas un plan parfait, un plan faisable. Une action dans les 7 jours.";

    let lvl4Title = "Bilan & Ancrage";
    let lvl4Question = `En agissant sur "${sq.question}", quelle vérité sur toi-même as-tu découverte ? Qu'est-ce que ça prouve ?`;
    let lvl4Helper = "Tu n'es plus celui qui avait ce problème. Note la preuve.";

    let lvl5Title = "Transmission";
    let lvl5Question = `Quels conseils donnerais-tu à quelqu'un qui souffre encore de "${sq.question}" comme toi avant ?`;
    let lvl5Helper = "Enseigner, c'est maîtriser. Solidifie ta victoire.";

    const pathData = WEEKS_PATHS[sq.id];
    // console.log(`Path data for ${sq.id}:`, pathData ? 'Found' : 'Not found');

    if (pathData) {
      const l1 = pathData.levels.find(l => l.levelId === 1);
      if (l1) { lvl1Title = l1.cardName; lvl1Question = l1.question; lvl1Helper = l1.advice; }
      const l2 = pathData.levels.find(l => l.levelId === 2);
      if (l2) { lvl2Title = l2.cardName; lvl2Question = l2.question; lvl2Helper = l2.advice; }
      const l3 = pathData.levels.find(l => l.levelId === 3);
      if (l3) { lvl3Title = l3.cardName; lvl3Question = l3.question; lvl3Helper = l3.advice; }
      const l4 = pathData.levels.find(l => l.levelId === 4);
      if (l4) { lvl4Title = l4.cardName; lvl4Question = l4.question; lvl4Helper = l4.advice; }
      const l5 = pathData.levels.find(l => l.levelId === 5);
      if (l5) { lvl5Title = l5.cardName; lvl5Question = l5.question; lvl5Helper = l5.advice; }
    }
    // Surcharge spécifique pour "Syndrome de l'Imposteur" (Week 1, Index 0)
    else if (weekId === 1 && index === 0) {
        // lvl1Title = "La Cartographie de l’Imposteur";
        lvl1Question = "Dans quels domaines te sens-tu ‘pas à ta place’ ou ‘pas assez bon’ ?\n\nNote **tous les domaines** qui pourraient t’apporter plus d’opportunités, de croissance et d’épanouissement (même si tu n’oses pas encore y aller).";
        lvl1Helper = "Tu es en train de dessiner la carte des terrains où ton imposteur te bloque.\n\nOn ne peut libérer que ce qu’on a d’abord osé regarder.";
        
        lvl2Title = "L’Autopsie du Mensonge";
        lvl2Question = "Pour chaque domaine que tu as noté au niveau 1, explique pourquoi tu ne te sens pas à ta place ou pas assez bon.\n\nFormule-le comme ça :\n\n• ‘Dans ____ je ne me sens pas à ma place parce que…’\n\n• ‘Dans ____ je me trouve pas assez bon parce que…’\n\nLaisse sortir les phrases exactes que tu te répètes.";
        lvl2Helper = "Tu es en train d’attraper le bug par la racine : les histoires précises que tu te racontes sur toi.";

        lvl3Title = "L’Offensive de Légitimité";
        lvl3Question = "En repartant de ce que tu viens d’écrire au niveau 2 :\n\nQuelles **actions concrètes** peux-tu mettre en place pour devenir plus compétent et plus à l’aise dans **chacun** de ces domaines ?\n\nNote **1 à 3 actions simples par domaine**.";
        lvl3Helper = "Tu n’as pas besoin d’un plan parfait, tu as besoin d’un plan faisable cette semaine.";

        lvl4Title = "La Preuve Vivante";
        lvl4Question = "En regardant les actions que tu as commencées ou que tu planifies :\n\n• Quelles **vérités sur toi-même** tu découvres dans ces domaines ?\n\n• Qu’est-ce que ça prouve sur ta capacité à agir et à grandir, même si au départ tu te pensais ‘pas à ta place’ ?";
        lvl4Helper = "Tu n’es plus la personne du niveau 1.\n\nCe que tu fais régulièrement reprogramme la façon dont tu te vois.";

        lvl5Title = "De l’Imposteur à la Référence";
        lvl5Question = "Après tout ce que tu as appris sur toi pendant ce voyage : quels conseils donnerais-tu à quelqu’un qui pense ne pas être à sa place ou ‘pas assez bon’ dans certains domaines ?\n\nÉcris-lui comme si tu parlais à la version de toi du niveau 1.";
        lvl5Helper = "Tu solidifies ta nouvelle identité quand tu deviens la personne qui rassure et guide ceux qui vivent encore ce que tu viens de traverser.";
    }

    // Surcharge spécifique pour "La Peur du Regard" (Week 1, Index 1)
    else if (weekId === 1 && index === 1) {
        // lvl1Title = "Le Tribunal Intérieur";
        lvl1Question = "Si tu échoues publiquement, quelles sont les phrases exactes que tu as peur d’entendre (ou de lire) ?\n\nNote **toutes** les phrases qui te viennent, même si elles te semblent exagérées ou ridicules.";
        lvl1Helper = "Le jugement des autres n’est souvent que le reflet de tes propres peurs.\n\nEn écrivant ces phrases, tu mets enfin des mots sur ce qui te retient.";

        lvl2Title = "Le Masque des Étiquettes";
        lvl2Question = "En relisant toutes les phrases que tu as écrites au niveau 1, pour chacune, complète :\n\n• ‘Si quelqu’un me disait ça, ça voudrait dire que je suis…’\n\nQuelles **étiquettes** ou **identités** te font le plus peur derrière ces phrases ?";
        lvl2Helper = "Ce ne sont pas juste des mots.\n\nCe qui fait mal, c’est le rôle ou l’identité négative que tu as peur d’endosser.";

        lvl3Title = "La Sortie de l’Ombre";
        lvl3Question = "En partant des phrases et des peurs que tu viens de décrire : dans **quelles situations concrètes** accepterais-tu quand même d’être visible ?\n\nNote **1 à 3 actions précises** que tu peux faire cette semaine (publier quelque chose, montrer ton travail, prendre la parole, partager un projet, etc.), même si certaines des phrases du niveau 1 pourraient se déclencher.";
        lvl3Helper = "Tu ne détruis pas la peur du regard en y pensant,\n\nTu la diminues à chaque fois que tu agis malgré elle.";

        lvl4Title = "La Déprogrammation du Regard";
        lvl4Question = "En regardant les actions que tu as faites ou commencées :\n\n• Qu’est-ce que tu craignais que les autres pensent ou disent **avant** ?\n\n• Qu’est-ce qui s’est **réellement** passé ?\n\n• Quelles **vérités nouvelles** tu découvres sur le regard des autres et sur ta capacité à encaisser leurs réactions (ou leur silence) ?";
        lvl4Helper = "Tu viens de prouver que tu peux te montrer, avoir peur, et malgré tout continuer.\n\nC’est ça, la vraie immunité : la capacité à rebondir, pas l’absence de peur.";

        lvl5Title = "Le Regard Libérateur";
        lvl5Question = "Après ce parcours avec tes propres peurs du regard : quels conseils donnerais-tu à quelqu’un qui n’ose pas se montrer parce qu’il a, lui aussi, plusieurs phrases blessantes qui tournent dans sa tête ?\n\nÉcris-lui comme si tu lui envoyais un message sincère.";
        lvl5Helper = "Tu deviens vraiment libre du regard des autres quand ton expérience ne sert plus seulement à te protéger, mais à libérer quelqu’un qui en est encore prisonnier.";
    }

    // Surcharge spécifique pour "Les Excuses Temporelles" (Week 1, Index 2)
    else if (weekId === 1 && index === 2) {
        // lvl1Title = "Le Piège du Temps";
        lvl1Question = "Quelles sont les choses pour lesquelles tu te dis que c’est ‘trop tard’ ou ‘trop tôt’ pour te lancer ?\n\nListe toutes les idées qui te viennent (projets, décisions, changements…).";
        lvl1Helper = "Le temps est une ressource, pas une excuse.\n\nIci, tu identifies où tu utilises le temps comme verrou.";

        lvl2Title = "Le Masque du Temps";
        lvl2Question = "En relisant chaque chose que tu as notée au niveau 1, complète les phrases suivantes :\n\n• ‘Si je commence maintenant, alors…’\n\n• ‘Si je n’ai pas commencé plus tôt, c’est que…’\n\nQuelles idées cachées sur toi, ton âge ou ton parcours découvres-tu derrière ces excuses temporelles ?";
        lvl2Helper = "Souvent, ‘trop tôt’ ou ‘trop tard’ veut juste dire ‘je n’accepte pas là où j’en suis aujourd’hui’.";

        lvl3Title = "Le Saut dans le Présent";
        lvl3Question = "En partant de ta liste et de ce que tu viens de comprendre au niveau 2 : pour chaque chose importante, quelle mini-action concrète peux-tu faire dans les prochains jours, même si tu continues à penser que c’est ‘trop tard’ ou ‘trop tôt’ ?\n\n(1 à 3 actions simples par élément.)";
        lvl3Helper = "Ce n’est jamais le ‘bon moment’ sur le papier.\n\nLe seul vrai moment qui existe, c’est maintenant + une petite action.";

        lvl4Title = "La Réconciliation avec le Temps";
        lvl4Question = "Après avoir commencé à agir :\n\n• Qu’est-ce que tu craignais à cause du temps (‘trop tôt / trop tard’) ?\n\n• Qu’est-ce qui s’est vraiment passé quand tu as avancé quand même ?\n\n• Quelles vérités nouvelles tu découvres sur ta capacité à progresser, peu importe ta situation de départ ou ton âge ?";
        lvl4Helper = "Tu viens de prouver que le temps n’était pas un mur, juste une histoire que tu te racontais.\n\nChaque petit pas posé crée un futur différent.";

        lvl5Title = "Le Maître de son Tempo";
        lvl5Question = "Après ce que tu as vécu avec tes propres excuses temporelles, quels conseils donnerais-tu à quelqu’un qui te dit :\n\n‘C’est trop tard pour moi’ ou ‘Je suis trop jeune / pas prêt pour ça’ ?\n\nÉcris-lui comme si tu voulais vraiment l’aider à se lancer malgré tout.";
        lvl5Helper = "Tu prends le pouvoir sur le temps quand ton expérience ne sert plus à te freiner, mais à ouvrir la route à ceux qui hésitent encore.";
    }

    // Surcharge spécifique pour "L'Étiquette Passée" (Week 1, Index 3)
    else if (weekId === 1 && index === 3) {
        // lvl1Title = "Le Musée des Étiquettes";
        lvl1Question = "Quelles définitions de toi-même utilises-tu pour ne pas changer ?\n\n(ex : ‘je suis timide’, ‘je suis bordélique’, ‘je suis nul en maths’, ‘je ne suis pas le genre de personne qui…’)\n\nNote **toutes** les phrases qui te viennent, surtout celles qui commencent par\n‘je suis…’ ou ‘je ne suis pas…’.";
        lvl1Helper = "Tu n’es pas ton passé.\n\nIci, tu exposes les vieilles étiquettes que tu portes encore comme si elles étaient définitives.";

        lvl2Title = "Les Scripts du Passé";
        lvl2Question = "En relisant chaque étiquette que tu as écrite au niveau 1, pour chacune, complète :\n\n• ‘J’ai commencé à croire ça à cause de…’\n\n• ‘Cette étiquette me permet d’éviter…’ (ou ‘me donne une excuse pour…’)\n\nQuelles histoires ou expériences de ton passé alimentent encore ces étiquettes ?";
        lvl2Helper = "Une étiquette n’est pas la vérité, c’est souvent une stratégie de protection qui a pris trop de place.";

        lvl3Title = "La Mise à Jour d’Identité";
        lvl3Question = "En partant de ce que tu viens de comprendre au niveau 2 , pour chaque ancienne étiquette,\nécris une **nouvelle phrase-identité** plus juste et plus évolutive.\n\nExemple :\n\n• ‘Je suis timide’ → ‘J’apprends à prendre ma place, une conversation à la fois.’\n\nPuis, pour chaque nouvelle phrase, note **1 à 3 mini-actions concrètes** que tu peux faire dans les prochains jours pour agir comme cette nouvelle version de toi.";
        lvl3Helper = "Tu ne changes pas d’identité en y pensant, tu la changes en te comportant comme la version que tu veux devenir.";

        lvl4Title = "La Preuve de Transformation";
        lvl4Question = "Après avoir commencé à tester tes nouvelles identités :\n\n• Qu’est-ce que tu fais aujourd’hui que ‘l’ancienne version de toi’ n’aurait pas fait ?\n\n• Quelles **étiquettes** ne te semblent déjà plus aussi vraies qu’avant ?\n\n• Quelles **vérités nouvelles** sur toi tu peux formuler à partir de tes actions récentes ?";
        lvl4Helper = "Tu viens de montrer que tes anciennes étiquettes étaient périmées.\n\nTes actes actuels parlent plus fort que les phrases que tu répétais depuis des années.";

        lvl5Title = "Le Réécrivain d’Histoires";
        lvl5Question = "Après ce voyage avec tes propres étiquettes passées : quels conseils donnerais-tu à quelqu’un qui dit souvent ‘je suis comme ça’ pour justifier le fait qu’il ne change pas ?\n\nÉcris-lui comme si tu voulais l’aider à voir qu’il peut, lui aussi, devenir une nouvelle version de lui-même.";
        lvl5Helper = "Tu deviens vraiment auteur de ta vie quand tu n’utilises plus ton passé comme excuse,\n\nmais comme matière première pour inspirer la transformation des autres.";
    }

    // Surcharge spécifique pour "Le Deuil des Anciens Plaisirs" (Week 2, Index 0)
    else if (weekId === 2 && index === 0) {
        lvl1Title = "L’Inventaire des Faux Plaisirs";
        
        lvl2Title = "La Fonction Cachée";
        lvl2Question = "En relisant chaque faux plaisir de ta liste au niveau 1 , pour chacun, complète :\n\n• ‘Ce plaisir m’apporte immédiatement…’\n• ‘Il m’évite de ressentir / faire face à…’\n\nQuelles émotions, responsabilités ou vérités inconfortables ces plaisirs t’aident-ils à fuir ?";
        lvl2Helper = "On ne sacrifie pas un plaisir au hasard.\n\nTu dois d’abord comprendre le rôle qu’il joue pour toi.";

        lvl3Title = "Le Jeûne Stratégique";
        lvl3Question = "En partant de ta liste et de ce que tu viens de comprendre au niveau 2 :\n\n• Quel faux plaisir es-tu prêt(e) à mettre entre parenthèses en premier ?\n• Pour combien de temps réaliste ? (24h, 3 jours, 7 jours…)\n• Par quoi peux-tu le remplacer temporairement (quelque chose de neutre ou légèrement constructif) ?\n\nDéfinis ton expérience de sacrifice noir sur blanc.";
        lvl3Helper = "Le but n’est pas d’être parfait pour toujours, mais de prouver à ton cerveau que tu peux vivre sans cette béquille pendant un temps choisi.";

        lvl4Title = "Le Nouveau Réconfort";
        lvl4Question = "Après avoir testé ton jeûne :\n\n• Qu’est-ce qui a été le plus difficile ?\n• Qu’est-ce que tu as découvert sur toi quand tu n’avais plus ce réflexe automatique ?\n• Quels nouveaux rituels / habitudes plus saines pourrais-tu installer pour prendre soin de toi sans ces anciens plaisirs ?";
        lvl4Helper = "Tu ne peux pas juste enlever : tu dois remplacer par mieux.\n\nC’est comme ça que ton sacrifice devient durable, pas héroïque mais épuisant.";

        lvl5Title = "Le Gardien de ton Temple";
        lvl5Question = "Après ce chemin avec tes anciens plaisirs :\n\n• Quel est le prix réel que tu acceptes maintenant de payer pour ta croissance ?\n• Quels conseils donnerais-tu à quelqu’un qui sait qu’il s’anesthésie avec les mêmes plaisirs que toi, mais n’ose pas encore les lâcher ?\n\nÉcris-lui comme si tu voulais l’aider à faire son premier vrai sacrifice.";
        lvl5Helper = "Tu deviens souverain de ta vie le jour où tu choisis consciemment ce que tu es prêt à sacrifier pour devenir la personne que tu veux être.";
    }

    // Surcharge spécifique pour "Le Tri Relationnel" (Week 2, Index 1)
    else if (weekId === 2 && index === 1) {
        lvl1Title = "Le Radar des Relations";
        
        lvl2Title = "Le Contrat Invisible";
        lvl2Question = "En relisant chaque personne ou groupe noté au niveau 1, pour chacun, complète :\n\n• Aujourd’hui, ce que cette personne attend de moi, c’est que je sois quelqu’un qui…’\n• Si je change, elle pourrait penser / dire : …’\n\nQuels rôles joues-tu dans la vie des autres, et quelles réactions redoutes-tu s’ils te voient changer ?";
        lvl2Helper = "Beaucoup de relations tiennent sur un contrat silencieux :\n\n• ‘Tu restes comme tu es, comme ça tout le monde est rassuré.’\n• Tu es en train de le rendre visible.";

        lvl3Title = "La Fracture Assumée";
        lvl3Question = "En partant de ce que tu viens de comprendre au niveau 2 :\n\n• Avec qui es-tu prêt(e) à accepter un début de tension ou de déception ?\n• Quelle décision concrète ou limite claire peux-tu poser (dire non, refuser un rôle, t’affirmer, changer une habitude) même si cette personne risque de ne pas aimer ?\n\nNote 1 à 3 actions précises que tu peux poser dans les prochains jours.";
        lvl3Helper = "Tu ne peux pas rester aimable pour tout le monde et en même temps être honnête avec toi-même.\n\nLe premier vrai sacrifice, c’est d’accepter de ne plus être parfait aux yeux de certains.";

        lvl4Title = "Le Filtre des Relations";
        lvl4Question = "Après avoir posé tes premières limites ou décisions :\n\n• Comment ont réagi concrètement les personnes concernées ?\n• Quelles relations semblent se tendre, se renforcer ou se révéler ?\n• Qu’est-ce que tu découvres sur ta capacité à supporter la déception, la critique ou la distance sans te renier ?";
        lvl4Helper = "Les personnes qui tiennent vraiment à toi finiront par s’ajuster à ta nouvelle version.\n\nLes autres ne faisaient peut-être qu’aimer le rôle que tu jouais.";

        lvl5Title = "Le Cercle Choisi";
        lvl5Question = "Après ce tri relationnel :\n\n• Quel type de relations tu choisis désormais de nourrir en priorité ?\n• Quels conseils donnerais-tu à quelqu’un qui n’ose pas changer parce qu’il a peur de décevoir sa famille, son partenaire ou ses amis ?\n\nÉcris-lui comme si tu voulais l’aider à assumer, lui aussi, le prix relationnel de sa transformation.";
        lvl5Helper = "Tu deviens souverain dans ta vie quand tu acceptes de perdre quelques applaudissements pour gagner des relations qui respectent vraiment qui tu es en train de devenir.";
    }

    // Surcharge spécifique pour "L'Investissement Énergétique" (Week 2, Index 2)
    else if (weekId === 2 && index === 2) {
        lvl1Title = "Le Thermomètre de l’Énergie";
        
        lvl2Title = "Les Fantômes du Burn-out";
        lvl2Question = "En relisant chaque fatigue ou inconfort noté au niveau 1, pour chacun, complète :\n\n• ‘Si je ressens souvent ça, j’ai peur que…’\n• ‘Ce que j’essaie vraiment d’éviter, c’est…’\n\nQuelles peurs se cachent derrière ta fuite de l’effort ? (ex : peur de craquer, de devenir ennuyeux, d’être moins aimé, de perdre ta liberté…)";
        lvl2Helper = "Tu ne fuis pas l’effort en lui-même, tu fuis l’histoire que tu t’es racontée sur ce que cet effort va faire de toi.";

        lvl3Title = "Le Sprint Sacré";
        lvl3Question = "En partant de ta vision et de ce que tu viens de comprendre au niveau 2 :\n\n• Quel inconfort précis es-tu prêt(e) à tester volontairement pendant un temps limité ? (ex : travailler concentré 90 minutes, dire non à des sorties, accepter d’être débutant, affronter l’ennui de la répétition…)\n• Comment peux-tu transformer cet effort en expérience mesurée (durée, fréquence, cadre clair) plutôt qu’en souffrance floue ?\n\nNote 1 à 3 expérimentations d’effort que tu es prêt(e) à tenter dans les prochains jours.";
        lvl3Helper = "La différence entre sacrifice et torture, c’est que dans le sacrifice, tu choisis le cadre et le sens.\n\nTu n’es pas victime de l’effort, tu en es l’auteur.";

        lvl4Title = "La Bonne Fatigue";
        lvl4Question = "Après avoir testé ces efforts choisis :\n\n• Qu’est-ce qui t’a le plus fatigué, et qu’est-ce qui t’a paradoxalement donné de l’énergie ?\n• Quelles sont, pour toi, les différences entre mauvaise fatigue (qui vide) et bonne fatigue (qui construit) ?\n• Comment peux-tu ajuster ton rythme pour rester dans une fatigue saine, au service de ta vision, sans t’auto-détruire ?";
        lvl4Helper = "La question n’est pas ‘Comment éviter d’être fatigué ?’ mais ‘Pour quoi suis-je d’accord d’être fatigué ?’\n\nAlignée à ta vision, la fatigue devient investissement, pas punition.";

        lvl5Title = "Le Gardien de ton Feu";
        lvl5Question = "Après ce travail sur ton énergie :\n\n• Quel pacte énergétique fais-tu avec toi-même (ce que tu acceptes d’endurer, ce que tu refuses maintenant) ?\n• Quels conseils donnerais-tu à quelqu’un qui a une grande vision mais qui abandonne dès que la fatigue ou l’inconfort se présentent ?\n\nÉcris-lui comme si tu voulais l’aider à protéger son énergie sans fuir le prix réel de sa vision.";
        lvl5Helper = "Tu deviens gardien de ton feu intérieur quand tu sais à la fois le nourrir par l’effort et le protéger de ce qui le gaspille.";
    }

    // Surcharge spécifique pour "Les Sensations Fortes" (Week 8, Index 0)
    else if (weekId === 8 && index === 0) {
        lvl1Title = "Le Catalogue des Émotions";
        
        lvl2Title = "Les Moteurs Cachés";
        lvl2Question = "En relisant chaque émotion notée au niveau 1 :\n\n• ‘Je veux ressentir ça parce que…’\n• ‘Cette émotion, pour moi, symbolise…’\n(ex : adrénaline = me sentir vivant, paix = ne plus être en guerre avec moi-même, extase = connexion, etc.)\n\nQu’est-ce que ces sensations disent vraiment de ce que tu cherches dans ta vie : sens, liberté, intensité, connexion, sécurité… ?";
        lvl2Helper = "Derrière chaque émotion forte, il y a un besoin profond : appartenance, liberté, reconnaissance, transcendance…\n\nTu n’es pas juste en quête d’intensité : tu es en quête de sens.";

        lvl3Title = "Les Scènes d’Aventure";
        lvl3Question = "En partant des émotions que tu veux vivre :\n\n• Pour chaque émotion clé, note 1 à 3 expériences concrètes qui pourraient te la faire ressentir.\n\nExemples :\n• Adrénaline → sport extrême, scène, prise de parole risquée, voyage en solo…\n• Paix → retraite silencieuse, séjour nature, journée sans écran, méditation profonde…\n• Extase → art, musique, danse, cérémonie, amour intense, flow créatif…\n\nQuelles scènes de vie peux-tu imaginer pour accueillir ces sensations ?";
        lvl3Helper = "Tes émotions ne tombent pas du ciel : elles ont besoin d’un contexte.\n\nTu es en train de designer les décors de ton aventure.";

        lvl4Title = "Le Calendrier d’Aventure";
        lvl4Question = "En regardant ta liste d’expériences possibles :\n\n• Lesquelles sont réalistes à vivre dans les 3 à 12 prochains mois ?\n• Quelles sont les 3 premières que tu choisis de programmer ou de préparer ?\n(voyage, événement, inscription à une activité, retraite, expérience sociale…)\n\n• Quel est le tout petit premier pas pour chacune :\nréserver, se renseigner, en parler à quelqu’un, mettre de l’argent de côté…\n\nNote ces 3 expériences comme des rendez-vous avec toi-même.";
        lvl4Helper = "Une vie d’aventure ne se décrète pas : elle se planifie un minimum.\n\nCe n’est pas tuer la spontanéité — c’est lui préparer du terrain.";

        lvl5Title = "La Signature d’Aventure";
        lvl5Question = "Avec tout ce que tu as clarifié :\n\n• Comment décrirais-tu ton style d’aventure idéal ?\n(intense, contemplatif, relationnel, spirituel, artistique…)\n\n• Complète :\n- ‘Les émotions fortes qui comptent le plus pour moi sont…’\n- ‘Parce que je veux que ma vie soit une expérience de…’\n\n• Quels conseils donnerais-tu à quelqu’un qui vit en mode automatique et ne s’autorise aucune vraie expérience forte ?\n\nÉcris comme si tu lui donnais envie de réouvrir sa vie.";
        lvl5Helper = "Tu ne vis pas juste pour cocher des objectifs : tu es là pour vivre une expérience humaine riche.\n\nTes sensations fortes ne sont pas une distraction, ce sont des rappels que tu es vivant.";
    }
    
    // NIVEAU 1 : LE SOCLE (Racine de la ligne)
    const id1 = `a${weekId}_c${pathIndex}_m1`;
    modules.push({
      id: id1,
      parentId: folderId,
      level: 1,
      rowId: index,
      title: lvl1Title,
      icon: <Layers className="w-6 h-6" />,
      version: moduleData[id1]?.version || "v1.0",
      lastUpdate: moduleData[id1]?.updated_at ? new Date(moduleData[id1].updated_at).toLocaleDateString() : "-",
      status: getStatus(1),
      content: moduleData[id1]?.content || "",
      history: [], // Todo: fetch history
      originalQuestion: lvl1Question,
      originalHelper: lvl1Helper,
      originalWeekTitle: weekData.title,
      rowTitle: rowTitle
    });

    // NIVEAU 2 : LA STRUCTURE
    const id2 = `a${weekId}_c${pathIndex}_m2`;
    modules.push({
      id: id2,
      parentId: folderId,
      level: 2,
      rowId: index,
      title: lvl2Title,
      icon: <PenTool className="w-6 h-6" />,
      version: moduleData[id2]?.version || "v0.0",
      lastUpdate: moduleData[id2]?.updated_at ? new Date(moduleData[id2].updated_at).toLocaleDateString() : "-",
      status: getStatus(2),
      content: moduleData[id2]?.content || "",
      history: [],
      originalQuestion: lvl2Question,
      originalHelper: lvl2Helper,
      originalWeekTitle: weekData.title,
      rowTitle: rowTitle
    });

    // NIVEAU 3 : L’ÉPREUVE
    const id3 = `a${weekId}_c${pathIndex}_m3`;
    modules.push({
      id: id3,
      parentId: folderId,
      level: 3,
      rowId: index,
      title: lvl3Title,
      icon: <Sword className="w-6 h-6" />,
      version: moduleData[id3]?.version || "v0.0",
      lastUpdate: moduleData[id3]?.updated_at ? new Date(moduleData[id3].updated_at).toLocaleDateString() : "-",
      status: getStatus(3),
      content: moduleData[id3]?.content || "",
      history: [],
      originalQuestion: lvl3Question,
      originalHelper: lvl3Helper,
      originalWeekTitle: weekData.title,
      rowTitle: rowTitle
    });

    // NIVEAU 4 : L’ANCRAGE
    const id4 = `a${weekId}_c${pathIndex}_m4`;
    modules.push({
      id: id4,
      parentId: folderId,
      level: 4,
      rowId: index,
      title: lvl4Title,
      icon: <ShieldCheck className="w-6 h-6" />,
      version: moduleData[id4]?.version || "v0.0",
      lastUpdate: moduleData[id4]?.updated_at ? new Date(moduleData[id4].updated_at).toLocaleDateString() : "-",
      status: getStatus(4),
      content: moduleData[id4]?.content || "",
      history: [],
      originalQuestion: lvl4Question,
      originalHelper: lvl4Helper,
      originalWeekTitle: weekData.title,
      rowTitle: rowTitle
    });

    // NIVEAU 5 : LA SOUVERAINETÉ
    const id5 = `a${weekId}_c${pathIndex}_m5`;
    modules.push({
      id: id5,
      parentId: folderId,
      level: 5,
      rowId: index,
      title: lvl5Title,
      icon: <Crown className="w-6 h-6" />,
      version: moduleData[id5]?.version || "v0.0",
      lastUpdate: moduleData[id5]?.updated_at ? new Date(moduleData[id5].updated_at).toLocaleDateString() : "-",
      status: getStatus(5),
      content: moduleData[id5]?.content || "",
      history: [],
      originalQuestion: lvl5Question,
      originalHelper: lvl5Helper,
      originalWeekTitle: weekData.title,
      rowTitle: rowTitle
    });
  });

  return modules;
};

// --- COMPOSANT ARBORESCENCE (LIGNES PARALLÈLES) ---
const SkillTree = ({ weekId, moduleData, onModuleClick }: { weekId: number, moduleData: Record<string, any>, onModuleClick: (m: SystemModule) => void }) => {
  const modules = useMemo(() => generateBranchData(weekId, moduleData), [weekId, moduleData]);
  
  const rows = useMemo(() => {
    const r: Record<number, SystemModule[]> = {};
    modules.forEach(m => {
      if (!r[m.rowId]) r[m.rowId] = [];
      r[m.rowId].push(m);
    });
    Object.keys(r).forEach(k => {
        r[parseInt(k)].sort((a, b) => a.level - b.level);
    });
    return Object.values(r);
  }, [modules]);

  return (
    <div className="flex flex-col gap-6 md:gap-16 py-6 md:py-12 pl-2 md:pl-[15vw] pr-4 md:pr-[30vw] w-full h-full overflow-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {rows.map((rowModules, rowIndex) => (
        <div key={rowIndex} className="flex flex-col gap-2 md:gap-6 group min-w-max">
            
            {/* Titre de la ligne */}
            <div className="flex items-center gap-2 md:gap-4 px-1 md:px-2 sticky left-0 z-10">
                <div className="text-emerald-600 font-bold text-[10px] min-[350px]:text-xs md:text-sm tracking-[0.2em] md:tracking-[0.3em] uppercase bg-emerald-950/90 backdrop-blur px-1.5 py-1 md:px-2 md:py-1 rounded border border-emerald-900/50 shadow-lg">
                    CHEMIN {rowIndex + 1}
                </div>
                <div className="h-px w-4 md:w-16 bg-gradient-to-r from-emerald-800/50 to-transparent" />
                <h3 className="text-emerald-100 font-serif text-base min-[350px]:text-lg md:text-2xl font-medium tracking-wide shadow-black drop-shadow-md truncate max-w-[200px] md:max-w-none">
                    {rowModules[0]?.rowTitle}
                </h3>
            </div>

            <div className="relative flex items-center gap-6 md:gap-16 pl-2 md:pl-8">
                {/* Connecteur horizontal de fond */}
                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-emerald-900/30 -z-10" />

                {rowModules.map((mod, modIndex) => (
                    <div key={mod.id} className="relative flex items-center">
                        {/* Connecteur actif */}
                        {modIndex > 0 && (
                            <div className="absolute right-[100%] top-1/2 w-6 md:w-16 h-0.5 bg-emerald-600/50" />
                        )}
                        
                        <TreeCard module={mod} onClick={() => onModuleClick(mod)} />
                        
                        {/* Flèche vers le suivant */}
                        {modIndex < rowModules.length - 1 && (
                            <div className="absolute left-[100%] top-1/2 -translate-y-1/2 text-emerald-800/50 -ml-1.5 md:-ml-2 z-0">
                                <ChevronRight className="w-3 h-3 md:w-5 md:h-5" />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
      ))}
    </div>
  );
};

const TreeCard = ({ module, onClick }: { module: SystemModule, onClick: () => void }) => {
    // Couleurs par niveau
    const colors: any = {
        1: "border-emerald-800 bg-emerald-950 text-emerald-100",
        2: "border-blue-800 bg-blue-950/40 text-blue-100",
        3: "border-amber-800 bg-amber-950/40 text-amber-100",
        4: "border-purple-800 bg-purple-950/40 text-purple-100",
        5: "border-yellow-600/50 bg-yellow-900/20 text-yellow-200 shadow-[0_0_15px_rgba(234,179,8,0.1)]",
    };
    
    let c = colors[module.level] || colors[1];

    let opacityClass = "opacity-100";
    let cursorClass = "cursor-pointer hover:scale-105 hover:shadow-xl hover:z-20";
    let iconOverlay = null;
    
    if (module.status === 'locked') {
        c = "border-emerald-900/30 bg-emerald-950/20 text-emerald-700"; 
        opacityClass = "opacity-40 grayscale";
        cursorClass = "cursor-not-allowed";
        iconOverlay = <Lock className="absolute inset-0 m-auto w-6 h-6 md:w-8 md:h-8 text-emerald-800/50" />;
    } else if (module.status === 'completed') {
        opacityClass = "opacity-80";
        iconOverlay = (
            <div className="absolute -top-2 -right-2 bg-emerald-500 text-emerald-950 rounded-full p-1 shadow-lg z-10">
                <ShieldCheck className="w-3 h-3 md:w-4 md:h-4" />
            </div>
        );
    } else if (module.status === 'active') {
        c += " ring-2 ring-offset-2 ring-offset-emerald-950 ring-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.2)]";
    }

    return (
        <div 
            onClick={onClick}
            className={`relative w-40 h-28 md:w-[22rem] md:h-[14rem] border rounded-lg md:rounded-xl p-3 md:p-6 transition-all duration-300 flex flex-col justify-between ${c} ${opacityClass} ${cursorClass}`}
        >
            {iconOverlay}
            
            <div className="flex justify-between items-start">
                <div className="p-1.5 md:p-3 rounded md:rounded-lg bg-black/20 backdrop-blur-sm border border-white/10">
                    <div className="transform scale-75 md:scale-100 origin-top-left">
                        {module.icon}
                    </div>
                </div>
                <span className="text-[9px] md:text-xs font-bold font-mono opacity-60 tracking-widest border border-current px-1.5 py-0.5 rounded uppercase">
                    Niv {module.level}
                </span>
            </div>
            
            <div className="flex-1 flex flex-col justify-center">
                <span className="font-serif font-bold text-xs min-[350px]:text-sm md:text-xl leading-snug line-clamp-3 drop-shadow-sm">
                    {module.title}
                </span>
            </div>
            
            {module.status !== 'locked' && (
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 md:h-1 rounded-b-lg md:rounded-b-xl ${
                    module.status === 'completed' ? 'bg-emerald-500' : 'bg-current opacity-50'
                }`} />
            )}
        </div>
    );
};

// --- COMPOSANT ACCUEIL (ARSENAL CIRCULAIRE) ---
const ArsenalView = ({ onSelect }: { onSelect: (id: number) => void }) => {
    const weeks = Object.values(WEEKS_CONTENT);

    // --- DESKTOP VIEW (Circular Layout) ---
    const CircularArsenal = () => (
        <div className="hidden min-[1200px]:flex flex-1 items-center justify-center relative min-h-[1100px] w-full">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-950/20 via-emerald-950/10 to-amber-950/20 -z-20" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-black/0 via-emerald-950/50 to-black -z-10" />
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-emerald-500/20 to-transparent -translate-x-1/2" />
                <div className="absolute left-10 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 select-none pointer-events-none">
                    {['A','R','M','U','R','E','S'].map((char, i) => (
                        <span key={i} className="text-blue-500/10 font-black text-8xl font-serif leading-none">
                            {char}
                        </span>
                    ))}
                </div>
                <div className="absolute right-10 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 select-none pointer-events-none">
                    {['A','R','M','E','S'].map((char, i) => (
                        <span key={i} className="text-amber-500/10 font-black text-8xl font-serif leading-none">
                            {char}
                        </span>
                    ))}
                </div>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-emerald-800/20 animate-spin-slow-reverse rotate-45" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] border border-emerald-700/10 rotate-12" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] border border-emerald-700/10 -rotate-12" />
            </div>
            
            <div className="absolute z-20 w-64 h-64 flex items-center justify-center">
                <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-md border border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.2)] -rotate-45 group hover:scale-105 transition-transform duration-700" />
                <div className="relative z-10 flex flex-col items-center justify-center text-center">
                    <div className="flex gap-4 mb-4">
                        <Shield className="w-8 h-8 text-blue-500" />
                        <Sword className="w-8 h-8 text-amber-500" />
                    </div>
                    <h2 className="text-2xl font-serif font-bold text-white mb-2">Ton Arsenal</h2>
                    <p className="text-xs text-emerald-400/80 uppercase tracking-widest">Défense & Attaque</p>
                </div>
            </div>

            <div className="absolute w-full h-full flex items-center justify-center pointer-events-none">
                {weeks.map((week) => {
                    const isArmor = ARMOR_IDS.includes(week.id);
                    const radius = 330; 
                    let angle;
                    if (isArmor) {
                        const idx = ARMOR_IDS.indexOf(week.id);
                        const startAngle = 110; 
                        const endAngle = 250;
                        const step = (endAngle - startAngle) / (ARMOR_IDS.length - 1); 
                        angle = startAngle + (idx * step); 
                    } else {
                        const idx = WEAPON_IDS.indexOf(week.id);
                        const startAngle = -75;
                        const endAngle = 75;
                        const step = (endAngle - startAngle) / (WEAPON_IDS.length - 1);
                        angle = startAngle + (idx * step); 
                    }

                    const radian = (angle * Math.PI) / 180;
                    const x = Math.cos(radian) * radius;
                    const y = Math.sin(radian) * radius;

                    const borderColor = isArmor ? "border-blue-500/30 group-hover:border-blue-400" : "border-amber-500/30 group-hover:border-amber-400";
                    const glowColor = isArmor ? "group-hover:shadow-[0_0_100px_rgba(59,130,246,0.4)]" : "group-hover:shadow-[0_0_100px_rgba(245,158,11,0.4)]";
                    const iconColor = isArmor ? "text-blue-400 group-hover:text-blue-100" : "text-amber-400 group-hover:text-amber-100";
                    const titleColor = isArmor ? "text-blue-100" : "text-amber-100";
                    const benefitBg = isArmor ? "bg-blue-950/80 border-blue-800 text-blue-300" : "bg-amber-950/80 border-amber-800 text-amber-300";
                    const dividerColor = isArmor ? "bg-blue-500" : "bg-amber-500";
                    
                    const BENEFITS_BY_WEEK: Record<string, string[]> = {
                        "1": ["Légitimité", "Confiance", "Clarté"],
                        "2": ["Discipline", "Focus", "Priorités"],
                        "3": ["Sérénité", "Maîtrise", "Calme"],
                        "4": ["Charisme", "Influence", "Présence"],
                        "5": ["Sens", "Vision", "Alignement"],
                        "6": ["Réseau", "Inspiration", "Soutien"],
                        "7": ["Impact", "Héritage", "Création"],
                        "8": ["Aventure", "Souvenirs", "Vies"],
                        "9": ["Vérité", "Progression", "Réalité"],
                        "10": ["Équilibre", "Santé", "Durabilité"],
                        "11": ["Leadership", "Transmission", "Exemple"],
                        "12": ["Renaissance", "Action", "Futur"]
                    };

                    return (
                        <div 
                            key={week.id}
                            onClick={() => onSelect(week.id)}
                            className="absolute group cursor-pointer flex items-center justify-center z-30 hover:z-50 pointer-events-auto"
                            style={{
                                transform: `translate(${x}px, ${y}px)`,
                            }}
                        >
                            <div className={`relative flex flex-col items-center justify-center w-24 h-24 group-hover:w-[400px] group-hover:h-[400px] bg-emerald-900/40 group-hover:bg-emerald-950 backdrop-blur-md border ${borderColor} transition-all duration-500 ease-out shadow-lg ${glowColor} overflow-hidden -rotate-45 group-hover:rotate-0 rounded-xl`}>
                                <div className={`absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${isArmor ? 'from-blue-900/20 to-blue-950/90' : 'from-amber-900/20 to-amber-950/90'}`} />
                                <div className="rotate-45 group-hover:rotate-0 transition-transform duration-500 w-full h-full flex flex-col items-center justify-center relative">
                                    <div className={`relative z-10 transition-all duration-500 transform group-hover:-translate-y-32 group-hover:scale-75 ${iconColor}`}>
                                        {ICONS_BY_WEEK[week.id.toString()] || <Layers className="w-8 h-8" />}
                                    </div>
                                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-8 opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                                        <div className="mt-12 text-center transform translate-y-8 group-hover:translate-y-0 transition-transform duration-500">
                                            <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isArmor ? 'text-blue-400' : 'text-amber-400'}`}>
                                                {isArmor ? 'ARMURE' : 'ARME'}
                                            </div>
                                            <div className="text-[9px] text-emerald-400/80 uppercase tracking-widest mb-2 font-medium">
                                                {week.subtitle}
                                            </div>
                                            <h3 className={`text-2xl font-serif font-bold mb-2 uppercase tracking-wider drop-shadow-lg ${titleColor}`}>
                                                {week.title}
                                            </h3>
                                            <div className={`h-1 w-16 mx-auto mb-4 shadow-lg ${dividerColor}`} />
                                            <p className="text-base text-emerald-100 mb-6 leading-relaxed font-medium drop-shadow-md max-w-xs mx-auto">
                                                {week.description}
                                            </p>
                                            <div className="flex flex-wrap justify-center gap-2">
                                                {BENEFITS_BY_WEEK[week.id.toString()]?.map((benefit, i) => (
                                                    <span key={i} className={`px-3 py-1 border text-xs font-bold uppercase tracking-wide shadow-sm ${benefitBg}`}>
                                                        {benefit}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    // --- TABLET/DESKTOP RECTANGULAR VIEW ---
    const RectangularArsenal = () => (
        <div className="hidden lg:flex min-[1200px]:!hidden flex-1 w-full min-h-screen relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-950 via-emerald-900/20 to-emerald-950 -z-20" />
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-emerald-500/30 to-transparent -translate-x-1/2 z-0" />
                <div className="absolute left-0 top-0 bottom-0 w-1/2 flex items-center justify-center overflow-hidden">
                    <span className="text-blue-500/5 font-black text-[12vw] font-serif uppercase tracking-tighter select-none transform -rotate-12 scale-150 origin-center">
                        Armures
                    </span>
                </div>
                <div className="absolute right-0 top-0 bottom-0 w-1/2 flex items-center justify-center overflow-hidden">
                    <span className="text-amber-500/5 font-black text-[12vw] font-serif uppercase tracking-tighter select-none transform rotate-12 scale-150 origin-center">
                        Armes
                    </span>
                </div>
            </div>

            <div className="w-full h-full grid grid-cols-2 relative z-10">
                <div className="flex flex-col items-end px-12 py-12 gap-6">
                    <div className="w-full max-w-xl flex flex-col gap-6">
                         <div className="flex items-center gap-4 text-blue-400 mb-4 border-b border-blue-500/20 pb-4">
                            <Shield className="w-8 h-8" />
                            <h2 className="text-3xl font-serif font-bold tracking-wide uppercase">Les Armures</h2>
                        </div>
                        {weeks.filter(w => ARMOR_IDS.includes(w.id)).map(week => (
                            <SimpleCard 
                                key={week.id} 
                                week={week} 
                                type="armor" 
                                onClick={() => onSelect(week.id)} 
                            />
                        ))}
                    </div>
                </div>

                <div className="flex flex-col items-start px-12 py-12 gap-6">
                    <div className="w-full max-w-xl flex flex-col gap-6">
                        <div className="flex items-center gap-4 text-amber-400 mb-4 border-b border-amber-500/20 pb-4">
                            <Sword className="w-8 h-8" />
                            <h2 className="text-3xl font-serif font-bold tracking-wide uppercase">Les Armes</h2>
                        </div>
                        {weeks.filter(w => WEAPON_IDS.includes(w.id)).map(week => (
                            <SimpleCard 
                                key={week.id} 
                                week={week} 
                                type="weapon" 
                                onClick={() => onSelect(week.id)} 
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    // --- MOBILE VIEW (List) ---
    const MobileArsenal = () => (
        <div className="lg:hidden flex flex-col w-full min-h-screen relative pb-20">
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-emerald-500/20 to-transparent -translate-x-1/2 z-0" />
            
            <div className="fixed top-1/4 -left-4 text-blue-500/5 font-black text-6xl font-serif leading-none rotate-90 origin-left whitespace-nowrap pointer-events-none z-0">
                ARMURES
            </div>
            <div className="fixed top-1/4 -right-4 text-amber-500/5 font-black text-6xl font-serif leading-none -rotate-90 origin-right whitespace-nowrap pointer-events-none z-0">
                ARMES
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-4 z-10 w-full max-w-4xl mx-auto">
                <div className="flex flex-col gap-4">
                    <div className="text-center py-4 sticky top-0 bg-emerald-950/90 backdrop-blur-sm z-20 border-b border-blue-500/20">
                        <h3 className="text-blue-400 font-bold text-sm min-[350px]:text-base uppercase tracking-widest mb-2 flex items-center justify-center gap-2">
                            <Shield className="w-4 h-4" /> Armures
                        </h3>
                        <div className="h-1 w-12 bg-blue-500 mx-auto rounded-full"/>
                    </div>
                    {weeks.filter(w => ARMOR_IDS.includes(w.id)).map(week => (
                        <SimpleCard key={week.id} week={week} type="armor" onClick={() => onSelect(week.id)} />
                    ))}
                </div>

                <div className="flex flex-col gap-4">
                    <div className="text-center py-4 sticky top-0 bg-emerald-950/90 backdrop-blur-sm z-20 border-b border-amber-500/20">
                        <h3 className="text-amber-400 font-bold text-sm min-[350px]:text-base uppercase tracking-widest mb-2 flex items-center justify-center gap-2">
                            <Sword className="w-4 h-4" /> Armes
                        </h3>
                        <div className="h-1 w-12 bg-amber-500 mx-auto rounded-full"/>
                    </div>
                    {weeks.filter(w => WEAPON_IDS.includes(w.id)).map(week => (
                        <SimpleCard key={week.id} week={week} type="weapon" onClick={() => onSelect(week.id)} />
                    ))}
                </div>
            </div>
        </div>
    );
    
    return (
        <>
            <CircularArsenal />
            <RectangularArsenal />
            <MobileArsenal />
        </>
    );
};

// --- NOUVEAU COMPOSANT : CARTE SIMPLE (MOBILE/TABLET) ---
const SimpleCard = ({ week, type, onClick }: { week: any, type: 'armor' | 'weapon', onClick: () => void }) => {
    const isArmor = type === 'armor';
    const colorClass = isArmor ? "border-blue-500/30 hover:border-blue-400 bg-blue-950/20" : "border-amber-500/30 hover:border-amber-400 bg-amber-950/20";
    const iconColor = isArmor ? "text-blue-400" : "text-amber-400";

    return (
        <div onClick={onClick} className={`relative flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border ${colorClass} backdrop-blur-sm cursor-pointer transition-all hover:scale-[1.02] active:scale-95 shadow-sm`}>
            <div className={`p-2 md:p-3 rounded-lg bg-black/20 ${iconColor} shrink-0 hidden min-[328px]:block`}>
                {ICONS_BY_WEEK[week.id.toString()] || <Layers className="w-5 h-5 md:w-6 md:h-6"/>}
            </div>
            <div className="min-w-0 flex-1">
                <h4 className={`font-serif font-bold text-base min-[350px]:text-lg md:text-xl leading-tight mb-1 break-words hyphens-auto ${isArmor ? 'text-blue-100' : 'text-amber-100'}`}>
                    {week.title}
                </h4>
                <p className="text-xs min-[350px]:text-sm md:text-base text-emerald-400/70 line-clamp-2 leading-relaxed">{week.description}</p>
            </div>
        </div>
    );
};

// --- MODAL EDIT COMPONENT (LA FORGE) ---
const EvolutionForge = ({ module, onClose, onSave }: { module: SystemModule, onClose: () => void, onSave: (id: string, content: string) => void }) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'history'>('editor');
  const [content, setContent] = useState(module.content || "");
  const [isImmersive, setIsImmersive] = useState(false);
  const [isInstructionsExpanded, setIsInstructionsExpanded] = useState(true);
  const [showMobileChat, setShowMobileChat] = useState(false); // Nouvel état pour le chat mobile
  
  const [messages, setMessages] = useState([
    { id: 1, sender: 'ai', text: `Bonjour Architecte. Nous travaillons sur le module "${module.title}" du système "${module.originalWeekTitle || 'Inconnu'}".` }
  ]);
  const [inputMessage, setInputMessage] = useState("");

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    setMessages([...messages, { id: Date.now(), sender: 'user', text: inputMessage }]);
    setInputMessage("");
    setTimeout(() => {
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: "C'est noté. Je te conseille d'ajouter cette précision dans le texte à gauche." }]);
    }, 1000);
  };

  const specificQuestion = module.originalQuestion || "Quelle est la vérité fondamentale que tu veux graver ici ?";
  const specificHelper = module.originalHelper || "Sois honnête et radical.";

  // --- STATE HISTORIQUE ---
  const [history, setHistory] = useState<ModuleHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Charger l'historique quand l'onglet change
  useEffect(() => {
    if (activeTab === 'history' && module.id) {
        const fetchHistory = async () => {
            setIsLoadingHistory(true);
            const { data, error } = await supabase
                .from('user_module_archives')
                .select('*')
                .eq('module_id', module.id)
                .order('archived_at', { ascending: false });

            if (data) {
                const formattedHistory: ModuleHistory[] = data.map((entry, index) => ({
                    version: `v${data.length - index}.0`, // Calcul de version simple
                    date: new Date(entry.archived_at).toLocaleDateString(),
                    content: entry.content?.content || entry.content?.answer || "Contenu illisible"
                }));
                setHistory(formattedHistory);
            }
            setIsLoadingHistory(false);
        };
        fetchHistory();
    }
  }, [activeTab, module.id]);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center animate-fade-in ${!isImmersive ? 'p-2 min-[350px]:p-4 md:p-8' : ''}`}>
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

        <div className={`relative bg-emerald-950 shadow-2xl flex flex-col md:flex-row overflow-y-auto md:overflow-hidden border border-emerald-800/50 z-10 transition-all duration-500 ease-in-out ${
          isImmersive 
            ? 'w-full h-full rounded-none' 
            : 'w-full max-w-6xl h-[90vh] md:h-[85vh] rounded-2xl'
        }`}>
        
        <div className={`flex-[70%] flex flex-col h-full border-r border-emerald-900 relative bg-emerald-950 shrink-0 transition-all ${showMobileChat ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 md:p-6 flex items-center justify-between border-b border-emerald-900/50 bg-emerald-950/50 backdrop-blur-sm">
            <div className="flex items-center gap-2 md:gap-4">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-emerald-900/50 flex items-center justify-center text-lg md:text-2xl text-emerald-400 shadow-inner">
                {module.icon}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm min-[350px]:text-xl font-bold text-white flex items-center gap-2 font-serif truncate max-w-[150px] min-[350px]:max-w-xs">
                  {module.title} 
                  <span className="hidden min-[350px]:inline text-xs bg-emerald-900 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800 font-mono">{module.version}</span>
                </h2>
                <span className="text-[9px] min-[350px]:text-xs text-emerald-500 uppercase tracking-wider flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Niveau {module.level}
                </span>
              </div>
            </div>
            
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsImmersive(!isImmersive)}
                        className={`hidden md:flex items-center gap-2 px-2 py-1.5 md:px-3 md:py-2 rounded-lg text-xs md:text-sm font-bold transition-colors border ${
                          isImmersive 
                            ? 'bg-emerald-800 text-white border-emerald-600' 
                            : 'bg-emerald-900/30 text-emerald-400 border-emerald-800/30 hover:bg-emerald-800/50'
                        }`}
                        title={isImmersive ? "Réduire" : "Mode Immersif"}
                    >
                      {isImmersive ? <div className="flex items-center gap-2"><X className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden md:inline">Réduire</span></div> : <Maximize2 className="w-3 h-3 md:w-4 md:h-4" />}
                    </button>

                <button 
                    onClick={onClose} 
                    className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-emerald-900/50 hover:bg-emerald-800 rounded-lg text-emerald-200 text-xs md:text-sm font-bold transition-colors border border-emerald-800/50 hover:border-emerald-700"
                >
                  <X className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden md:inline">Fermer</span>
                </button>
                </div>
          </div>

          <div className="flex items-center justify-center p-2 md:p-4 bg-emerald-950/30">
            <div className="flex bg-emerald-900/50 p-1 rounded-xl border border-emerald-800/30">
                <button 
                  onClick={() => setActiveTab('editor')}
                  className={`px-3 py-1.5 md:px-6 md:py-2 rounded-lg text-xs min-[350px]:text-sm md:text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-all ${
                    activeTab === 'editor' ? 'bg-emerald-800 text-white shadow-sm' : 'text-emerald-500 hover:text-emerald-300'
                  }`}
                >
                  <Cpu className="w-3 h-3 md:w-4 md:h-4" /> Manifeste
                </button>
                <button 
                  onClick={() => setActiveTab('history')}
                  className={`px-3 py-1.5 md:px-6 md:py-2 rounded-lg text-xs min-[350px]:text-sm md:text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-all ${
                    activeTab === 'history' ? 'bg-emerald-800 text-white shadow-sm' : 'text-emerald-500 hover:text-emerald-300'
                  }`}
                >
                  <History className="w-3 h-3 md:w-4 md:h-4" /> Archives
                </button>
            </div>
          </div>

          <div className="flex-1 p-3 md:p-8 overflow-hidden relative max-w-4xl mx-auto w-full flex flex-col">
            {activeTab === 'editor' ? (
              <div className="h-full flex flex-col relative">
                 
                 {/* Section Instructions */}
                 <div className={`transition-all duration-500 ease-in-out overflow-hidden flex flex-col ${isInstructionsExpanded ? 'max-h-[50vh] opacity-100 mb-4' : 'max-h-0 opacity-0 mb-0'}`}>
                    <div className="overflow-y-auto pr-2 custom-scrollbar space-y-3 md:space-y-4">
                        <div className="bg-emerald-900/30 border-l-4 border-emerald-500 p-3 md:p-4 rounded-r-xl">
                            <h4 className="text-emerald-400 font-bold text-xs md:text-sm uppercase tracking-wider mb-2 md:mb-3 flex items-center gap-2">
                            <Layers className="w-3 h-3 md:w-4 md:h-4" /> Question Clé
                            </h4>
                            <p className="text-emerald-100 text-sm min-[350px]:text-base md:text-lg font-serif leading-relaxed whitespace-pre-line">
                            {specificQuestion.replace(/\*\*/g, '')}
                            </p>
                        </div>

                        <div className="bg-amber-900/10 border border-amber-500/30 rounded-xl p-3 md:p-4">
                            <div className="flex items-center gap-2 mb-2 text-amber-400 font-bold text-xs md:text-sm uppercase tracking-wider">
                            <Sparkles className="w-3 h-3 md:w-4 md:h-4" /> Conseil
                            </div>
                            <ul className="space-y-2 md:space-y-4 text-amber-200/80 text-xs min-[350px]:text-sm md:text-sm italic">
                            {specificHelper.split('\n\n').map((helperPart, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                <span className="text-amber-500/50 mt-1">•</span>
                                <span>{helperPart}</span>
                            </li>
                            ))}
                            </ul>
                        </div>
                    </div>
                 </div>

                 {/* Toggle Bar */}
                 <div className="flex justify-between items-center mb-4 border-b border-emerald-900/30 pb-2">
                    {!isInstructionsExpanded && (
                        <div className="text-emerald-500 text-xs md:text-xs uppercase tracking-widest font-bold flex items-center gap-2 animate-fade-in">
                            <Layers className="w-3 h-3 md:w-4 md:h-4" /> Consignes Masquées
                        </div>
                    )}
                    <button 
                        onClick={() => setIsInstructionsExpanded(!isInstructionsExpanded)}
                        className="ml-auto text-emerald-400 hover:text-emerald-200 text-xs min-[350px]:text-xs md:text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors bg-emerald-900/30 px-2 py-1 md:px-3 md:py-1.5 rounded-lg border border-emerald-800/50 hover:bg-emerald-800"
                    >
                        {isInstructionsExpanded ? (
                            <>Masquer les instructions <ChevronUp className="w-3 h-3 md:w-4 md:h-4" /></>
                        ) : (
                            <>Afficher les instructions <ChevronDown className="w-3 h-3 md:w-4 md:h-4" /></>
                        )}
                    </button>
                </div>

                <textarea 
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className={`flex-1 w-full bg-transparent border-none outline-none text-sm min-[350px]:text-base md:text-lg text-emerald-50 font-serif leading-relaxed resize-none placeholder-emerald-800/50 p-2 md:p-4 focus:ring-0 transition-all duration-500 ${!isInstructionsExpanded ? 'h-full' : ''}`}
                  placeholder="Définis ta réalité ici..."
                  autoFocus
                />
                
                {/* BOUTON FLOTTANT MOBILE CHAT */}
                <button 
                    onClick={() => setShowMobileChat(true)}
                    className="md:hidden absolute bottom-24 right-4 z-30 bg-emerald-600 text-white p-3 rounded-full shadow-xl shadow-emerald-900/50 animate-bounce-slow"
                >
                    <Sparkles className="w-6 h-6" />
                </button>

                <div className="mt-4 md:mt-6 flex justify-end border-t border-emerald-900/50 pt-4 md:pt-6">
                  <button 
                    onClick={() => onSave(module.id, content)}
                    className="bg-amber-500 text-emerald-950 font-bold px-4 py-2 md:px-8 md:py-3 rounded-lg hover:bg-amber-400 transition-colors flex items-center gap-2 shadow-lg shadow-amber-900/20 text-xs md:text-base w-full md:w-auto justify-center"
                  >
                    <Save className="w-3 h-3 md:w-4 md:h-4" />
                    Enregistrer la version
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8 max-w-2xl mx-auto h-full overflow-y-auto pr-2 custom-scrollbar">
                {isLoadingHistory ? (
                    <div className="flex items-center justify-center h-full opacity-50">
                        <p>Chargement des archives...</p>
                    </div>
                ) : history.length > 0 ? (
                  history.map((entry, i) => (
                    <div key={i} className="relative pl-8 border-l-2 border-emerald-800/30 last:border-l-0 pb-8">
                      <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-emerald-950 border-2 border-emerald-600 z-10 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                      <div className="bg-emerald-900/20 rounded-xl p-6 border border-emerald-800/30 hover:bg-emerald-900/30 transition-colors">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-emerald-400 font-mono text-xs font-bold bg-emerald-900/50 px-2 py-1 rounded border border-emerald-800">{entry.version}</span>
                          <span className="text-emerald-500 text-xs flex items-center gap-1 font-bold uppercase tracking-wider"><Clock className="w-3 h-3" /> {entry.date}</span>
                        </div>
                        <p className="text-emerald-100 text-lg font-serif italic leading-relaxed">"{entry.content}"</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-32 opacity-40 flex flex-col items-center gap-4">
                    <GitCommit className="w-16 h-16 text-emerald-700" />
                    <p className="text-lg font-serif">Aucune archive disponible pour ce module.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={`flex-[30%] flex-col bg-emerald-900/20 md:bg-emerald-950/50 md:border-l md:border-emerald-900 h-full backdrop-blur-sm relative shrink-0 ${showMobileChat ? 'flex fixed inset-0 z-50 bg-emerald-950' : 'hidden md:flex'}`}>
            {/* Header Mobile Chat pour fermer */}
            <div className="md:hidden flex items-center justify-between p-4 bg-emerald-900/50 border-b border-emerald-800">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    <span className="font-bold text-emerald-100">Sophia</span>
                </div>
                <button 
                    onClick={() => setShowMobileChat(false)}
                    className="text-emerald-400 hover:text-white"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            <div className="p-4 md:p-6 bg-gradient-to-b from-emerald-950/80 to-transparent border-b border-emerald-500/20 md:border-emerald-900">
              <div className="flex items-center gap-2 mb-2 md:mb-3">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Pépites IA</span>
              </div>
              <div className="text-sm text-emerald-100 bg-emerald-900/40 p-4 rounded-xl border border-emerald-800/50 shadow-sm leading-relaxed">
                "La dernière fois, tu as noté que la musique classique t'apaisait. Veux-tu l'ajouter à tes déclencheurs ?"
              </div>
            </div>

            <div className="flex-1 flex flex-col p-3 md:p-4 overflow-hidden">
              <div className="flex-1 overflow-y-auto space-y-3 md:space-y-4 mb-3 md:mb-4 pr-2 scrollbar-thin scrollbar-thumb-emerald-800">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-2 md:p-3 rounded-2xl text-xs md:text-sm leading-relaxed ${
                      msg.sender === 'user' ? 'bg-emerald-600 text-white' : 'bg-emerald-900 text-emerald-100 border border-emerald-800'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="relative">
                <input 
                  type="text" 
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Discuter avec l'assistant..."
                  className="w-full bg-emerald-900/50 border border-emerald-800 rounded-xl pl-3 md:pl-4 pr-10 md:pr-12 py-3 md:py-4 text-xs md:text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none shadow-inner"
                />
                <button onClick={handleSendMessage} className="absolute right-2 top-2 bottom-2 text-emerald-400 hover:text-white hover:bg-emerald-800 p-1.5 md:p-2 rounded-lg transition-colors">
                  <Send className="w-3 h-3 md:w-4 md:h-4" />
                </button>
              </div>
              </div>
            </div>
        </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
const IdentityEvolution = () => {
  const navigate = useNavigate();
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null);
  const [selectedModule, setSelectedModule] = useState<SystemModule | null>(null);
  
  // State for module data
  const [moduleData, setModuleData] = useState<Record<string, any>>({});
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null); // null = loading

  // GUARD : Vérification des accès à la Forge
  useEffect(() => {
      if (!user) return;
      
      const checkAccess = async () => {
          // On vérifie si le module 'forge_access' (clé d'entrée Forge) est présent dans user_week_states
          const { data, error } = await supabase
            .from('user_week_states')
            .select('status, available_at')
            .eq('user_id', user.id)
            .eq('module_id', 'forge_access') 
            .maybeSingle();
            
          if (!data) {
              // Pas d'accès -> Redirection
              setHasAccess(false);
              // Petit délai pour laisser l'UI respirer ou afficher un toast
              setTimeout(() => {
                  navigate('/dashboard', { state: { mode: 'architecte' } });
                  // alert("La Forge n'est pas encore ouverte."); // Optionnel, un peu agressif
              }, 100);
          } else {
              // Vérification de la date
              if (data.available_at && new Date(data.available_at) > new Date()) {
                   setHasAccess(false);
                   setTimeout(() => navigate('/dashboard', { state: { mode: 'architecte' } }), 100);
              } else {
                   setHasAccess(true);
              }
          }
      };
      
      checkAccess();
  }, [user, navigate]);

  // Fetch data when branch changes
  useEffect(() => {
      if (!user || selectedBranch === null || !hasAccess) return;
      
      const fetchModules = async () => {
          // 1. Fetch Entries (Content)
          const { data: entriesData, error: entriesError } = await supabase
            .from('user_module_state_entries')
            .select('*')
            .eq('user_id', user.id)
            .like('module_id', `a${selectedBranch}_%`);
            
          if (entriesError) console.error("Error fetching entries:", entriesError);
          
          // 2. Fetch States (Unlock Schedule)
          const { data: statesData, error: statesError } = await supabase
            .from('user_week_states')
            .select('*')
            .eq('user_id', user.id)
            .like('module_id', `a${selectedBranch}_%`);

          if (statesError) console.error("Error fetching states:", statesError);
          
          const map: Record<string, any> = {};
          
          // Merge Entries (Content)
          // On s'assure de récupérer le contenu peu importe son format
          entriesData?.forEach(entry => {
              // Extraction du contenu : soit entry.content est une string (legacy), soit un objet { content: "..." }
              let actualContent = "";
              
              // DEBUG: Log pour voir ce qu'on reçoit vraiment
              // console.log(`[DEBUG] Entry ${entry.module_id} content type:`, typeof entry.content, entry.content);

              if (typeof entry.content === 'string') {
                  actualContent = entry.content;
              } else if (entry.content && typeof entry.content === 'object') {
                  // On gère le cas où c'est { content: "..." } OU { answer: "..." } OU juste un objet vide
                  // Le cast 'as any' permet d'accéder aux propriétés sans que TS râle si le type JSONB est générique
                  const c = entry.content as any;
                  actualContent = c.content || c.answer || "";
              }

              map[entry.module_id] = { 
                  ...map[entry.module_id], 
                  ...entry,
                  content: actualContent, // On stocke la string directement pour l'UI
                  // Map available_at (snake_case from DB) to availableAt (camelCase for getStatus)
                  availableAt: entry.available_at 
              };
          });

          // Merge States (Unlock info)
          statesData?.forEach(state => {
              map[state.module_id] = { 
                  ...map[state.module_id], 
                  stateStatus: state.status,
                  availableAt: state.available_at 
              };
          });

          setModuleData(map);
      };
      
      fetchModules();
  }, [user, selectedBranch]);
  
  const handleBranchClick = (id: number) => {
    setSelectedBranch(id);
  };

  const handleModuleClick = (module: SystemModule) => {
    if (module.status === 'locked') return;
    setSelectedModule(module);
  };

  const handleSave = async (id: string, content: string) => {
    if (!user) return;
    console.log(`Saving module ${id}:`, content);
    
    try {
        // Upsert logic similar to IdentityArchitect
        const { data: existing } = await supabase
            .from('user_module_state_entries')
            .select('id, completed_at')
            .eq('user_id', user.id)
            .eq('module_id', id)
            .maybeSingle();
            
        const payload = { content }; // or { answer: content } depending on consistency
        const isCompleted = content.trim().length > 0;
        const now = new Date().toISOString();
        
        // On met à jour le statut et completed_at pour refléter la réalité
        const updateData = {
            content: payload,
            updated_at: now,
            status: isCompleted ? 'completed' : 'available',
            completed_at: isCompleted ? (existing?.completed_at || now) : null
        };
        
        if (existing) {
            await supabase.from('user_module_state_entries').update(updateData).eq('id', existing.id);
        } else {
            await supabase.from('user_module_state_entries').insert({
                user_id: user.id,
                module_id: id,
                ...updateData
            });
        }

        // --- FORGE TRIGGER ---
        // On déclenche la vectorisation si le module est complété
        if (isCompleted) {
             const { data: { session } } = await supabase.auth.getSession();
             // On ne bloque pas l'UI pour ça
             fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/complete-module`, {
                 method: 'POST',
                 headers: {
                   'Content-Type': 'application/json',
                   'Authorization': `Bearer ${session?.access_token}`
                 },
                 body: JSON.stringify({ moduleId: id })
             }).catch(err => console.error("Forge Vectorization trigger failed:", err));
        }
        
        // Refresh local state
        setModuleData(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                ...updateData,
                content: content // Force string content for local state to avoid [object Object]
            }
        }));
        
        setSelectedModule(null);
    } catch (err) {
        console.error("Error saving:", err);
        alert("Erreur lors de la sauvegarde.");
    }
  };

  const handleBack = () => {
    if (selectedBranch !== null) {
        setSelectedBranch(null); 
    } else {
        navigate('/dashboard', { state: { mode: 'architecte' } });
    }
  };

  return (
    <div className="min-h-screen bg-emerald-950 text-emerald-50 font-sans flex flex-col relative overflow-x-hidden">
      
      <header className="sticky top-0 z-40 bg-emerald-950/90 backdrop-blur-md border-b border-emerald-900 p-2 min-[350px]:p-3 md:p-6 flex items-center justify-between shadow-lg">
        <button onClick={handleBack} className="flex items-center gap-1 min-[350px]:gap-2 text-emerald-400 hover:text-emerald-200 transition-colors text-xs min-[350px]:text-sm md:text-base font-bold uppercase tracking-wider shrink-0">
          <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> 
          <span>{selectedBranch !== null ? "Retour Forge" : "Retour"}</span>
        </button>
        <div className="flex items-center gap-1.5 md:gap-2 text-emerald-100 truncate ml-2">
          <Hammer className="w-3 h-3 min-[350px]:w-4 min-[350px]:h-4 md:w-5 md:h-5 text-amber-400 shrink-0" />
          <span className="text-sm min-[350px]:text-base md:text-xl font-bold font-serif truncate">La Forge d'Armes <span className="hidden sm:inline text-xs bg-emerald-900 px-2 py-0.5 rounded text-emerald-400 ml-2">v3.0</span></span>
        </div>
      </header>

      <main className="flex-1 w-full p-2 min-[350px]:p-4 md:p-8 relative z-10 flex flex-col">
        
        <div className="text-center mb-4 md:mb-8 mt-6 md:mt-10 relative z-20">
          <h1 className="text-xl min-[350px]:text-2xl md:text-5xl font-serif font-bold text-white mb-2 md:mb-3 px-2 md:px-4 leading-tight break-words hyphens-auto">
            {selectedBranch ? `Forge : ${WEEKS_CONTENT[selectedBranch.toString()]?.title}` : "La Forge Identitaire"}
          </h1>
          <p className="text-emerald-400 opacity-80 max-w-xl mx-auto text-sm min-[350px]:text-base md:text-xl leading-relaxed px-4 md:px-6">
            {selectedBranch 
                ? `Forge chaque pièce pour assembler ton ${ARMOR_IDS.includes(selectedBranch) ? 'armure' : 'arme'} complète.`
                : "Maintenant que ton temple est construit, utilise la forge pour améliorer chaque élément."}
          </p>
        </div>

        {selectedBranch === null ? (
            <ArsenalView onSelect={handleBranchClick} />
        ) : (
            <div className="flex-1 overflow-hidden flex items-start justify-center bg-emerald-950/30 rounded-2xl relative">
                <div className="absolute right-0 top-0 bottom-0 w-[15%] bg-gradient-to-l from-emerald-950 to-transparent z-20 pointer-events-none" />
                <SkillTree weekId={selectedBranch} moduleData={moduleData} onModuleClick={handleModuleClick} />
            </div>
                  )}

      </main>

      {selectedModule && (
        <EvolutionForge 
          module={selectedModule} 
          onClose={() => setSelectedModule(null)} 
          onSave={handleSave} 
        />
      )}

    </div>
  );
};

export default IdentityEvolution;
