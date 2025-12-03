import { useState } from 'react';
import { Target, Edit3, ChevronUp, ChevronDown } from 'lucide-react';

export const StrategyCard = ({ strategy, identityProp, whyProp, rulesProp }: { strategy: string, identityProp?: string, whyProp?: string, rulesProp?: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [identity, setIdentity] = useState(identityProp || (strategy && strategy.length < 100 ? strategy : "Je deviens une personne calme et maître de son temps."));
  const [why, setWhy] = useState(whyProp || "Pour avoir l'énergie de jouer avec mes enfants le matin sans être irritable.");
  const [rules, setRules] = useState(rulesProp || "1. Pas d'écran dans la chambre.\n2. Si je ne dors pas après 20min, je me lève.\n3. Le lit ne sert qu'à dormir.");

  return (
    <div className="bg-white border border-blue-100 rounded-2xl shadow-sm overflow-hidden mb-8 transition-all duration-300">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="p-4 md:p-6 flex items-start justify-between cursor-pointer hover:bg-blue-50/50 transition-colors group"
      >
        <div className="flex gap-3 md:gap-4 w-full">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0">
            <Target className="w-4 h-4 md:w-5 md:h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-[10px] min-[310px]:text-xs min-[802px]:text-sm font-bold text-blue-600 uppercase tracking-wide mb-1">Ma Vision (Identité)</h2>
            <div className="flex items-start gap-2 md:gap-3">
              <p className={`font-serif text-sm min-[310px]:text-base min-[802px]:text-lg text-gray-800 italic leading-relaxed ${isOpen ? '' : 'line-clamp-1'}`}>
                "{identity}"
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(true);
                  setIsEditing(true);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-blue-100 rounded text-blue-400 hover:text-blue-600"
                title="Modifier ma phrase"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <button className="text-gray-400 hover:text-blue-600 transition-colors mt-1 ml-4">
          {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {isOpen && (
        <div className="px-4 md:px-6 pb-4 md:pb-6 pt-0 animation-fade-in">
          <div className="border-t border-gray-100 my-4"></div>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-2">Qui je deviens (Identité)</label>
                <textarea
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-2">Mon Pourquoi Profond</label>
                <textarea
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-2">Mes Règles d'Or</label>
                <textarea
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs md:text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs md:text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4 md:gap-8">
              <div className="space-y-3 md:space-y-4">
                <div>
                  <h3 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-2">Mon Pourquoi Profond</h3>
                  <p className="text-xs md:text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                    {why}
                  </p>
                </div>
              </div>
              <div className="space-y-3 md:space-y-4">
                <div>
                  <h3 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-2">Mes Règles d'Or</h3>
                  <div className="text-xs md:text-sm text-gray-700 leading-relaxed bg-yellow-50 p-3 rounded-lg border border-yellow-100 whitespace-pre-line">
                    {rules}
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 flex justify-end mt-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 text-xs md:text-sm font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors"
                >
                  <Edit3 className="w-4 h-4" /> Modifier ma stratégie
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

