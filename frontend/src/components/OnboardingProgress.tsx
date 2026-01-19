import React from 'react';
import { Check, Circle } from 'lucide-react';

interface OnboardingProgressProps {
  currentStep: 1 | 2 | 3 | 4;
}

const steps = [
  { number: 1, label: "Questionnaire" },
  { number: 2, label: "Ordre de plan" },
  { number: 3, label: "Précisions" },
  { number: 4, label: "Génération" }
];

const OnboardingProgress: React.FC<OnboardingProgressProps> = ({ currentStep }) => {
  return (
    <div className="w-full max-w-3xl mx-auto mb-8 px-4">
      {/* Mobile View: Simple Progress Bar */}
      <div className="md:hidden">
        <div className="flex justify-between text-xs font-medium text-slate-500 mb-2">
          <span>{steps[currentStep - 1].label}</span>
          <span>Étape {currentStep}/{steps.length}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-violet-600 transition-all duration-500 ease-out"
            style={{ width: `${(currentStep / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop View: Stepper */}
      <div className="hidden md:flex items-center justify-between relative">
        {/* Connection Line */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-slate-100 -z-10" />
        <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-violet-600 -z-10 transition-all duration-500" 
            style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
        />

        {steps.map((step) => {
          const isCompleted = step.number < currentStep;
          const isCurrent = step.number === currentStep;
          
          return (
            <div key={step.number} className="flex flex-col items-center gap-2 bg-slate-50 px-2">
              <div 
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300
                  ${isCompleted 
                    ? 'bg-violet-600 border-violet-600 text-white' 
                    : isCurrent 
                      ? 'bg-white border-violet-600 text-violet-600' 
                      : 'bg-white border-slate-200 text-slate-300'
                  }
                `}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span className="text-sm font-bold">{step.number}</span>
                )}
              </div>
              <span 
                className={`
                  text-xs font-bold uppercase tracking-wider transition-colors duration-300
                  ${isCurrent ? 'text-violet-700' : isCompleted ? 'text-slate-700' : 'text-slate-400'}
                `}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OnboardingProgress;



