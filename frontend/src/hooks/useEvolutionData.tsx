import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { WEEKS_CONTENT } from '../data/weeksContent';
import { 
  Sword, Shield, Crown, Anchor, Compass, Users, 
  BookOpen, Zap, BarChart2, Leaf, Flame, Sparkles 
} from 'lucide-react';

// --- TYPES ---
export type ModuleStatus = 'locked' | 'active' | 'completed' | 'stable';

export interface ModuleHistory {
  version: string;
  date: string;
  content: string;
}

export interface SystemModule {
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

const ARMOR_IDS = [1, 2, 3, 6, 9, 10];
const WEAPON_IDS = [4, 5, 7, 8, 11, 12];

export const useEvolutionData = () => {
  const { user } = useAuth();
  const [coreIdentity, setCoreIdentity] = useState<any>(null);
  const [weekStates, setWeekStates] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch Core Identity & Week States
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // Core Identity
        const { data: identityData } = await supabase
          .from('core_identity')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (identityData) setCoreIdentity(identityData);

        // Week States (Progression)
        const { data: weeksData } = await supabase
          .from('user_week_states')
          .select('week_id, status, unlocked_at, completed_at')
          .eq('user_id', user.id);

        const states: Record<string, any> = {};
        if (weeksData) {
            weeksData.forEach((w: any) => {
                states[w.week_id] = w;
            });
        }
        setWeekStates(states);

      } catch (err) {
        console.error("Error fetching evolution data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

  // 2. Generate Tree Data (Memoized)
  const { armorModules, weaponModules } = useMemo(() => {
    const generateBranchData = (weekId: number) => {
        const weekStr = weekId.toString();
        const weekData = WEEKS_CONTENT[weekStr];
        if (!weekData) return [];
      
        // Récupérer le contenu dynamique depuis coreIdentity
        // Mapping simple : weekId -> champ JSON dans coreIdentity
        // Ex: Week 1 -> identity_audit ? Non, structure plus complexe.
        // Pour l'instant, on va chercher dans core_identity.content (JSONB)
        // ou des champs spécifiques si mappés.
        
        // Structure supposée de coreIdentity : { user_id, content: { week_1: { q1: "...", q2: "..." } } }
        // Ou champs plats : identity_values, identity_rules...
        // On va assumer une structure plate ou mappée manuellement pour l'instant
        // Le code original utilisait un 'moduleData' générique.
        
        // MAPPING CORE IDENTITY -> MODULES
        const getModuleContent = (wId: number, qIndex: number) => {
            if (!coreIdentity) return undefined;
            // Essai de mapping intelligent basé sur les semaines
            // Week 1: Audit -> coreIdentity.current_situation ?
            // Week 2: Valeurs -> coreIdentity.core_values ?
            // Week 4: Identité -> coreIdentity.identity_statement ?
            
            // Pour simplifier, on va utiliser le champ 'content' JSONB s'il existe
            // Sinon on utilise les champs plats connus
            const dynamicContent = coreIdentity.modules?.[`week_${wId}`]?.[`q_${qIndex}`];
            if (dynamicContent) return dynamicContent;

            // Fallbacks Legacy (Champs plats)
            if (wId === 2 && qIndex === 0) return coreIdentity.core_values;
            if (wId === 4 && qIndex === 0) return coreIdentity.identity_statement;
            if (wId === 5 && qIndex === 0) return coreIdentity.life_vision;
            if (wId === 6 && qIndex === 0) return coreIdentity.golden_rules;
            
            return undefined;
        };

        const modules: SystemModule[] = [];
        const folderId = `folder_a${weekId}`; // Virtual folder
      
        weekData.subQuestions.forEach((sq, index) => {
          const pathIndex = index + 1;
          const status = calculateStatus(weekId, pathIndex, weekStates);
          
          const content = getModuleContent(weekId, index) || "Donnée non initialisée.";
          
          // History Mock (Pour l'instant, pas de table history dédiée par module, on simule)
          const history: ModuleHistory[] = [
              { version: "1.0", date: "Initial", content: content }
          ];

          modules.push({
            id: `w${weekId}_q${pathIndex}`,
            parentId: folderId, // Linked to folder
            level: 3, // Leaf
            rowId: index,
            title: sq.question || `Module ${weekId}.${pathIndex}`,
            icon: ICONS_BY_WEEK[weekStr],
            version: "1.0",
            lastUpdate: "Aujourd'hui",
            status,
            content,
            history,
            originalQuestion: sq.question,
            originalHelper: sq.helperText,
            originalWeekTitle: weekData.title,
            rowTitle: sq.question
          });
        });
        
        return modules;
    };

    const aModules = ARMOR_IDS.flatMap(id => generateBranchData(id));
    const wModules = WEAPON_IDS.flatMap(id => generateBranchData(id));

    return { armorModules: aModules, weaponModules: wModules };
  }, [coreIdentity, weekStates]);

  return {
    user,
    coreIdentity,
    setCoreIdentity,
    weekStates,
    isLoading,
    armorModules,
    weaponModules
  };
};

// Helper interne pour le statut
const calculateStatus = (weekId: number, pathIndex: number, weekStates: Record<string, any>): ModuleStatus => {
    // 1. Time Lock Check
    const weekKey = `week_${weekId}`;
    const weekState = weekStates[weekKey];
    
    // Si la semaine n'est pas débloquée, c'est locked
    if (!weekState) return 'locked';
    
    // Si la semaine est completed, c'est stable ou completed
    if (weekState.status === 'completed') return 'stable';
    
    // Si active, c'est active
    if (weekState.status === 'active') return 'active';
    
    return 'locked';
};

