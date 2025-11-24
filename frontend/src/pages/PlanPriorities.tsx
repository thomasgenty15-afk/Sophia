import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // Ajout du contexte auth
import { 
  ArrowRight, 
  GripVertical, 
  GitMerge, 
  ArrowDown,
  Move,
  ShieldCheck,
  Zap,
  Trophy,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

interface PriorityItem {
  id: string;
  title: string;
  theme: string;
}

const MOCK_IA_ORDER: PriorityItem[] = [
  {
    id: 'SLP_1',
    title: 'Passer en mode nuit & s’endormir facilement',
    theme: 'Sommeil',
  },
  {
    id: 'NRG_2',
    title: 'Sortir du cycle fatigue → sucre → crash',
    theme: 'Énergie',
  },
  {
    id: 'PDT_3',
    title: 'Système de Deep Work (4h/jour)',
    theme: 'Productivité',
  }
];

const PlanPriorities = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth(); // Récupérer l'utilisateur
  
  // On récupère l'ordre initial et on le fige comme "Optimal"
  const [initialOrder] = useState<PriorityItem[]>(
    (location.state?.selectedAxes as PriorityItem[]) || MOCK_IA_ORDER
  );

  // C'est l'état qui bouge avec le drag & drop
  const [currentOrder, setCurrentOrder] = useState<PriorityItem[]>([...initialOrder]);
  
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [isModified, setIsModified] = useState(false);

  // Détecte si l'ordre a changé
  useEffect(() => {
    const isDifferent = JSON.stringify(currentOrder) !== JSON.stringify(initialOrder);
    setIsModified(isDifferent);
  }, [currentOrder, initialOrder]);

  // --- LOGIQUE STATIQUE BASÉE SUR L'IA ---
  // On récupère le rôle en fonction de la position INITIALE (recommandée) de l'item
  const getIARole = (itemId: string) => {
    const originalIndex = initialOrder.findIndex(i => i.id === itemId);
    
    if (originalIndex === 0) {
      return {
        role: "LA FONDATION (Recommandé N°1)",
        style: "bg-emerald-50 border-emerald-100 text-emerald-800",
        icon: <ShieldCheck className="w-4 h-4 text-emerald-600" />,
        text: "Selon l'IA, c'est par là qu'il faut commencer pour débloquer le reste."
      };
    }
    if (originalIndex === 1) {
      return {
        role: "LE LEVIER (Recommandé N°2)",
        style: "bg-amber-50 border-amber-100 text-amber-800",
        icon: <Zap className="w-4 h-4 text-amber-600" />,
        text: "Devrait idéalement venir en second, une fois la fondation posée."
      };
    }
    return {
      role: "L'OPTIMISATION (Recommandé N°3)",
      style: "bg-violet-50 border-violet-100 text-violet-800",
      icon: <Trophy className="w-4 h-4 text-violet-600" />,
      text: "La touche finale. Risqué de commencer par ça sans les bases."
    };
  };

  // --- DRAG & DROP LOGIC ---
  const handleDragStart = (index: number) => {
    setDraggedItem(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;

    const newOrder = [...currentOrder];
    const draggedPriority = newOrder[draggedItem];
    
    newOrder.splice(draggedItem, 1);
    newOrder.splice(index, 0, draggedPriority);
    
    setCurrentOrder(newOrder);
    setDraggedItem(index);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const handleReset = () => {
    setCurrentOrder([...initialOrder]);
  };

  const handleValidate = () => {
    // Fallback pour le mock: on vérifie aussi le localStorage directement
    const isMockAuthenticated = localStorage.getItem('mock_supabase_session');
    
    if (user || isMockAuthenticated) {
      // Si l'utilisateur est DÉJÀ connecté, on saute la page d'inscription
      navigate('/plan-generator', { state: { finalOrder: currentOrder } });
    } else {
      navigate('/auth', { state: { finalOrder: currentOrder } });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 py-12 px-6">
      <div className="max-w-3xl mx-auto">
        
        {/* HEADER */}
        <div className="text-center mb-10 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-100 text-violet-700 text-xs font-bold uppercase tracking-wider mb-6">
            <GitMerge className="w-4 h-4" />
            Stratégie Séquentielle
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            L'ordre des facteurs change le résultat.
          </h1>
          <p className="text-lg text-slate-600 max-w-xl mx-auto">
            L'IA a calculé l'itinéraire le plus sûr. <br/>
            Vous pouvez le modifier, mais attention aux incohérences.
          </p>
        </div>

        {/* ALERTE SI MODIFIÉ */}
        {isModified && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 flex items-center justify-between animate-fade-in-up">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <p className="text-sm text-amber-800 font-medium">
                Vous avez modifié l'ordre recommandé par l'IA.
              </p>
            </div>
            <button 
              onClick={handleReset}
              className="text-xs font-bold uppercase tracking-wider text-amber-700 hover:text-amber-900 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Rétablir
            </button>
          </div>
        )}

        {/* INSTRUCTION DE REORDER */}
        {!isModified && (
          <div className="flex items-center justify-center gap-2 text-slate-400 text-sm font-bold uppercase tracking-wider mb-8">
            <Move className="w-4 h-4" />
            Glissez les cartes pour modifier l'ordre
          </div>
        )}

        {/* LISTE DRAG & DROP */}
        <div className="space-y-0 mb-12 relative">
          {/* Ligne connectrice en arrière plan */}
          <div className="absolute left-[2.4rem] top-8 bottom-8 w-0.5 bg-slate-200 border-l border-dashed border-slate-300 -z-10"></div>

          {currentOrder.map((item, index) => {
            const logic = getIARole(item.id); // Rôle fixe basé sur l'ID, pas la position actuelle

            return (
              <div key={item.id} className="relative">
                {/* Flèche connectrice (sauf pour le premier) */}
                {index > 0 && (
                  <div className="ml-9 h-8 flex items-center">
                    <ArrowDown className="w-5 h-5 text-slate-300" />
                  </div>
                )}

                <div 
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`group relative bg-white border rounded-xl p-6 shadow-sm hover:shadow-lg transition-all cursor-grab active:cursor-grabbing animate-fade-in-up z-10 ${
                    draggedItem === index ? 'opacity-50 border-dashed border-violet-400 scale-95' : 'border-slate-200 hover:border-violet-300 hover:translate-x-1'
                  }`}
                  style={{ animationDelay: `${index * 150}ms` }}
                >
                  {/* Numéro Ordre Actuel */}
                  <div className={`absolute -left-4 top-8 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-lg border-4 border-slate-50 z-20 ${
                    index === 0 ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border-slate-200'
                  }`}>
                    {index + 1}
                  </div>

                  <div className="flex items-start gap-5 pl-6">
                    <div className="text-slate-300 mt-2 group-hover:text-violet-400 transition-colors">
                      <GripVertical className="w-6 h-6" />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-violet-600 uppercase tracking-wider bg-violet-50 px-2 py-0.5 rounded">
                          {item.theme}
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-slate-900 mb-3 leading-tight">
                        {item.title}
                      </h3>
                      
                      {/* LOGIQUE IA FIXE (ATTACHÉE À LA CARTE) */}
                      <div className={`flex gap-3 p-3 rounded-lg border ${logic.style}`}>
                        <div className="mt-0.5">{logic.icon}</div>
                        <div>
                          <p className="text-xs font-bold uppercase mb-0.5 opacity-90">
                            {logic.role}
                          </p>
                          <p className="text-sm opacity-80 leading-relaxed">
                            {logic.text}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button 
          onClick={handleValidate}
          className={`w-full text-white font-bold text-lg py-5 rounded-xl transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 animate-fade-in-up delay-500 group ${
            isModified ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-900 hover:bg-violet-600'
          }`}
        >
          {isModified 
            ? `Générer mon plan ${currentOrder[0].theme} (Malgré le risque)` 
            : `Générer mon plan ${currentOrder[0].theme}`}
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>

      </div>
    </div>
  );
};

export default PlanPriorities;