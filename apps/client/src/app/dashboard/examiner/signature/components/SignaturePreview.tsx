import { DEFAULT_SIGNATURE_TITLE } from './SignatureFields';

interface Props {
  imageUrl: string | null;
  name: string;
  title: string;
}

/** La firma tal como saldrá en los certificados. */
export function SignaturePreview({ imageUrl, name, title }: Props) {
  return (
    <div className="p-6">
      <div className="bg-white rounded-xl border border-border p-8 flex flex-col items-center justify-center text-center">
        {imageUrl && (
          <div className="mb-2 h-12 w-28 flex items-center justify-center">
            <img src={imageUrl} alt="Firma" className="max-h-full max-w-full object-contain" />
          </div>
        )}
        <div className="w-48 h-[1px] bg-slate-300" />
        <p className="text-sm font-bold text-slate-800 mt-2">{name}</p>
        <p className="text-xs text-slate-500">{title || DEFAULT_SIGNATURE_TITLE}</p>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-3">
        Así se verá tu firma en los certificados de los cursos que examinas.
      </p>
    </div>
  );
}
