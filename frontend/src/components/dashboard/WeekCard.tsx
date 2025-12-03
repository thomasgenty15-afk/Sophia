import { useNavigate } from 'react-router-dom';
import { Lock, Check, Play } from 'lucide-react';

// Using 'any' for week as in original, but could be typed if ArchitectWeek is available
export const WeekCard = ({ week }: { week: any }) => {
  const navigate = useNavigate();
  const isLocked = week.status === "locked";
  const isCurrent = week.status === "active";
  const isCompleted = week.status === "completed";

  const handleClick = () => {
    if (isLocked) return;
    navigate(`/architecte/${week.id}`);
  };

  return (
    <div
      onClick={handleClick}
      className={`relative rounded-2xl p-6 border transition-all duration-500 group cursor-pointer h-[180px] flex flex-col justify-center snap-center shrink-0 w-full md:w-[90%] mx-auto ${isCurrent
          ? "bg-emerald-900 border-emerald-500 shadow-2xl shadow-emerald-500/20 scale-100 z-10 ring-1 ring-emerald-400"
          : isCompleted
            ? "bg-emerald-800/40 border-emerald-600/60 opacity-100 scale-95 hover:bg-emerald-800/60 hover:border-emerald-500"
            : "bg-emerald-950/40 border-emerald-800/50 opacity-80 scale-95 grayscale-[0.5] hover:opacity-100 hover:border-emerald-700"
        }`}>
      {isCurrent && <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-16 bg-amber-500 rounded-r-full shadow-[0_0_20px_rgba(245,158,11,0.6)]" />}

      <div className="flex items-center justify-between relative z-10 px-4">
        <div className="flex-1">
          <div className="flex flex-col-reverse items-start min-[300px]:flex-row min-[300px]:items-center gap-1 min-[300px]:gap-3 mb-2">
            <span className={`text-xs font-bold uppercase tracking-widest ${isCurrent ? "text-amber-400" : isCompleted ? "text-emerald-300" : "text-emerald-700"}`}>
              Semaine {week.id}
            </span>
            {isCompleted && (
              <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-emerald-500/30">
                Validé
              </span>
            )}
          </div>

          <h3 className={`text-lg md:text-xl font-serif font-bold leading-tight ${isCurrent ? "text-white" : isCompleted ? "text-emerald-100" : "text-emerald-800"}`}>
            {week.title}
          </h3>

          {isLocked && (
            <p className="text-xs md:text-sm text-emerald-800 mt-2 font-medium flex items-center gap-1">
              <Lock className="w-3 h-3" /> Se débloque bientôt
            </p>
          )}
        </div>

        <div className={`w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ml-4 hidden min-[300px]:flex ${isCurrent
            ? "bg-amber-500 text-emerald-950 shadow-lg scale-110"
            : isCompleted
              ? "bg-emerald-500 text-emerald-950 shadow-md shadow-emerald-900/20"
              : "bg-emerald-900/20 text-emerald-800 border border-emerald-900/50"
          }`}>
          {isLocked ? <Lock className="w-4 h-4 md:w-5 md:h-5" /> : isCompleted ? <Check className="w-5 h-5 md:w-6 md:h-6" /> : <Play className="w-4 h-4 md:w-5 md:h-5 fill-current ml-0.5" />}
        </div>
      </div>
    </div>
  );
};

