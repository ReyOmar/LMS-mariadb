/** Por qué no se pudo enviar un formulario. Sin mensaje no ocupa sitio. */
export function FormError({ message, className = '' }: { message: string; className?: string }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className={`rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-400 ${className}`}
    >
      {message}
    </p>
  );
}
