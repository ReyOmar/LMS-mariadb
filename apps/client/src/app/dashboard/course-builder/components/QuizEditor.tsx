'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { CheckCircle, Clock, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import type { QuestionWithAnswers, QuizConfig } from '@/types/models';
import {
  QUIZ_LIMITS,
  addOption,
  addQuestion,
  clampSetting,
  markCorrect,
  removeOption,
  removeQuestion,
  setOptionText,
  setPrompt,
} from './quiz-editing';

interface Props {
  config: QuizConfig;
  onChange: Dispatch<SetStateAction<QuizConfig>>;
}

/** Ajustes y preguntas de un cuestionario, con la opción correcta de cada una. */
export function QuizEditor({ config, onChange }: Props) {
  return (
    <>
      <div className="border border-amber-500/30 rounded-xl p-5 bg-amber-500/5 space-y-5">
        <h3 className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <CheckCircle className="h-5 w-5" /> Configuración del cuestionario
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <SettingField
            id="quiz-attempts"
            icon={<RefreshCcw className="h-3 w-3" />}
            label="Intentos permitidos"
            hint="0 = intentos ilimitados."
            value={config.allowedAttempts}
            max={QUIZ_LIMITS.maxAttempts}
            onChange={(allowedAttempts) => onChange((prev) => ({ ...prev, allowedAttempts }))}
          />
          <SettingField
            id="quiz-time-limit"
            icon={<Clock className="h-3 w-3" />}
            label="Tiempo límite (minutos)"
            hint="0 = sin límite de tiempo."
            value={config.timeLimitMinutes}
            max={QUIZ_LIMITS.maxTimeLimitMinutes}
            onChange={(timeLimitMinutes) => onChange((prev) => ({ ...prev, timeLimitMinutes }))}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            Preguntas <span className="text-muted-foreground text-sm font-normal">({config.questions.length})</span>
          </h3>
          <button
            type="button"
            onClick={() => onChange((prev) => addQuestion(prev))}
            disabled={config.questions.length >= QUIZ_LIMITS.maxQuestions}
            className="bg-amber-500 hover:bg-amber-600 text-amber-950 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Agregar pregunta
          </button>
        </div>

        {config.questions.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
            <CheckCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No hay preguntas aún.</p>
            <p className="text-muted-foreground text-sm">
              Presiona «Agregar pregunta» para empezar a construir el cuestionario.
            </p>
          </div>
        )}

        {config.questions.map((question, index) => (
          <QuestionCard key={question.id} question={question} number={index + 1} onChange={onChange} />
        ))}
      </div>
    </>
  );
}

interface SettingFieldProps {
  id: string;
  icon: ReactNode;
  label: string;
  hint: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}

function SettingField({ id, icon, label, hint, value, max, onChange }: SettingFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-xs font-bold uppercase tracking-wider block mb-2 text-muted-foreground flex items-center gap-1"
      >
        {icon} {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(clampSetting(e.target.value, max))}
        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50 font-bold"
      />
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

interface QuestionCardProps {
  question: QuestionWithAnswers;
  number: number;
  onChange: Dispatch<SetStateAction<QuizConfig>>;
}

function QuestionCard({ question, number, onChange }: QuestionCardProps) {
  const canRemoveOption = question.options.length > QUIZ_LIMITS.minOptions;
  const canAddOption = question.options.length < QUIZ_LIMITS.maxOptions;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background shadow-sm">
      <div className="bg-muted/30 px-5 py-3 flex items-center gap-3 border-b border-border">
        <span className="font-bold text-sm text-muted-foreground">Pregunta {number}</span>
        <button
          type="button"
          onClick={() => onChange((prev) => removeQuestion(prev, question.id))}
          className="ml-auto text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-bold flex items-center gap-1"
        >
          <Trash2 className="h-3.5 w-3.5" /> Eliminar
        </button>
      </div>

      <div className="p-5 space-y-4">
        <input
          type="text"
          value={question.prompt}
          onChange={(e) => {
            const prompt = e.target.value;
            onChange((prev) => setPrompt(prev, question.id, prompt));
          }}
          className="w-full bg-muted border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500/50 font-medium"
          placeholder="Escribe la pregunta aquí..."
          aria-label={`Enunciado de la pregunta ${number}`}
        />

        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Opciones de respuesta
          </legend>
          {question.options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2">
              <input
                type="radio"
                name={`correct-${question.id}`}
                checked={option.isCorrect}
                onChange={() => onChange((prev) => markCorrect(prev, question.id, option.id))}
                className="w-4 h-4 accent-emerald-500 flex-shrink-0"
                title="Marcar como correcta"
                aria-label={`Marcar la opción ${index + 1} como correcta`}
              />
              <input
                type="text"
                value={option.text}
                onChange={(e) => {
                  const text = e.target.value;
                  onChange((prev) => setOptionText(prev, question.id, option.id, text));
                }}
                className={`flex-1 bg-muted border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${option.isCorrect ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border'}`}
                placeholder={`Opción ${index + 1}...`}
                aria-label={`Texto de la opción ${index + 1}`}
              />
              {canRemoveOption && (
                <button
                  type="button"
                  onClick={() => onChange((prev) => removeOption(prev, question.id, option.id))}
                  className="text-red-400 hover:text-red-500 p-1"
                  aria-label={`Eliminar la opción ${index + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange((prev) => addOption(prev, question.id))}
            disabled={!canAddOption}
            className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 mt-1 ml-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-3 w-3" /> Agregar opción
            {!canAddOption && ` (máximo ${QUIZ_LIMITS.maxOptions})`}
          </button>
        </fieldset>
        <p className="text-xs text-muted-foreground ml-6">
          Selecciona el círculo <span className="text-emerald-500 font-bold">●</span> de la opción correcta.
        </p>
      </div>
    </div>
  );
}
