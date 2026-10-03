import { Inter, Lato, Montserrat, Open_Sans, Outfit, Poppins, Roboto } from 'next/font/google';

/**
 * Tipografías que el administrador puede elegir, servidas desde el propio dominio.
 *
 * `next/font` las descarga al compilar: el navegador no pide nada a Google (ni le entrega
 * la IP del visitante) y no hay una conexión externa más en cada carga. Cada una expone su
 * familia en una variable CSS; sólo se descarga el archivo de la que se usa. Los nombres de
 * las variables son los de `FONT_VARIABLES` en `theme.ts`.
 */
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const roboto = Roboto({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700', '900'],
  display: 'swap',
  variable: '--font-roboto',
  preload: false,
});
const montserrat = Montserrat({ subsets: ['latin'], display: 'swap', variable: '--font-montserrat', preload: false });
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-poppins',
  preload: false,
});
const outfit = Outfit({ subsets: ['latin'], display: 'swap', variable: '--font-outfit', preload: false });
const openSans = Open_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-open-sans', preload: false });
const lato = Lato({
  subsets: ['latin'],
  weight: ['300', '400', '700', '900'],
  display: 'swap',
  variable: '--font-lato',
  preload: false,
});

/** Clases que declaran las variables de todas las tipografías en el documento. */
export const fontVariables = [inter, roboto, montserrat, poppins, outfit, openSans, lato]
  .map((font) => font.variable)
  .join(' ');
