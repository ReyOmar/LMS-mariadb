'use client';

import { Clock, LogOut, Send } from 'lucide-react';
import type { QuizQuestion } from '@/types/models';
import type { QuizAnswers } from './quiz-draft';

interface AttemptBarProps {
  title: string;
  /** Lo que queda de tiempo, o `null` si el cuestionario no tiene límite. */
  remainingSeconds: number | null;
  answered: number;
  total: number;
  onExit: () => void;
}

/** Barra fija del intento: salir, el cronómetro y cuántas preguntas lleva respondidas. */
export function AttemptBar({ title, remainingSeconds, answered, total, onExit }: AttemptBarProps) {
  return (
    <div className="bg-background/80 backdrop-blur-md border-b border-border/50 p-4 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button
          onClick={onExit}
          className="p-2 hover:bg-red-500/10 text-red-500 rounded-full transition-colors"
          title="Salir del cuestionario"
        >
          <LogOut className="h-5 w-5" />
        </button>
        <span className="font-bold text-sm truncate max-w-[150px] md:max-w-none">{title}</span>
      </div>

      <div className="flex items-center gap-4">
        {remainingSeconds !== null && (
          <span
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-black text-xs border ${
              remainingSeconds < 60
                ? 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50 animate-pulse'
                : 'bg-muted text-foreground border-border'
            }`}
          >
            <Clock className="h-3 w-3" />
            {formatTime(remainingSeconds)}
          </span>
        )}
        <span className="text-xs font-bold text-muted-foreground hidden sm:block">
          {answered} / {total}
        </span>
      </div>

      <div
        className="absolute bottom-0 left-0 h-1 bg-primary transition-all duration-500"
        style={{ width: `${total > 0 ? (answered / total) * 100 : 0}%` }}
      />
    </div>
  );
}

interface QuestionsProps {
  questions: QuizQuestion[];
  answers: QuizAnswers;
  onAnswer: (questionId: string, optionId: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}

/** Las preguntas del intento, una opción por pregunta, y el botón para entregarlo. */
export function AttemptQuestions({ questions, answers, onAnswer, submitting, onSubmit }: QuestionsProps) {
  return (
    <div className="p-6 md:p-12 space-y-8">
      {questions.map((question, index) => (
        <fieldset
          key={question.id}
          className="bg-background border border-border/60 rounded-[2rem] p-6 md:p-10 relative overflow-hidden"
        >
          <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary/20" aria-hidden="true" />

          <legend className="sr-only">Pregunta {index + 1}</legend>
          <h3 className="font-bold text-xl md:text-2xl mb-8 flex gap-5 leading-relaxed">
            <span className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-lg font-black">
              {index + 1}
            </span>
            <span className="mt-2">{question.prompt}</span>
          </h3>

          <div className="space-y-3 md:pl-16">
            {question.options.map((option) => {
              const chosen = answers[question.id] === option.id;
              return (
                <label
                  key={option.id}
                  className={`flex items-center gap-4 md:gap-5 p-5 md:p-6 rounded-[1.5rem] border-2 cursor-pointer transition-all ${
                    chosen
                      ? 'bg-primary/5 border-primary shadow-lg shadow-primary/5'
                      : 'bg-background border-border hover:border-primary/30 hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    name={question.id}
                    checked={chosen}
                    onChange={() => onAnswer(question.id, option.id)}
                    className="sr-only"
                  />
                  <span
                    className={`w-6 h-6 md:w-7 md:h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      chosen ? 'border-primary bg-primary/10' : 'border-muted-foreground/30'
                    }`}
                  >
                    <span
                      className={`w-3 h-3 md:w-3.5 md:h-3.5 bg-primary rounded-full transition-transform ${
                        chosen ? 'scale-100' : 'scale-0'
                      }`}
                    />
                  </span>
                  <span
                    className={`text-base md:text-lg ${chosen ? 'font-black' : 'text-muted-foreground font-semibold'}`}
                  >
                    {option.text}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex justify-center pt-10 pb-10">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 md:px-12 py-5 rounded-[1.5rem] font-black shadow-2xl shadow-primary/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-3 md:gap-4 text-lg md:text-xl whitespace-nowrap disabled:opacity-60"
        >
          <Send className="h-6 w-6" />
          {submitting ? 'Enviando…' : 'Finalizar y enviar'}
        </button>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
