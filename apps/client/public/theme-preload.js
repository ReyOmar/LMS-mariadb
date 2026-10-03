/**
 * Aplica el tema de la sede antes de que React monte.
 *
 * Es una copia deliberada de `themeCss()` de `src/lib/theme.ts` sin la tipografía: ese
 * módulo se ejecuta después de la hidratación y, hasta entonces, la página se vería con los
 * colores por defecto y cambiaría de golpe. Este script corre antes del primer pintado y
 * escribe el mismo bloque `<style id="lms-theme">`, que `applyTheme` reutiliza después.
 * Cualquier cambio en uno va también en el otro: `src/lib/theme.spec.ts` comprueba que
 * los dos producen la misma hoja de estilos.
 *
 * Todo va dentro de un try: si algo falla, la página se pinta con el tema por defecto en
 * lugar de quedarse en blanco.
 */
(function () {
  try {
    // Marca de cada sede para la primera visita, cuando todavía no hay configuración en
    // caché. Son los colores que cada sede tiene en «Tema y apariencia»: la API no guarda
    // uno de serie por sede (el de `CountrySettings` en apps/api/prisma/schema.prisma es
    // común), así que si una sede cambia su marca hay que actualizarlos aquí.
    var BRANDS = { COLOMBIA: { primaryColor: '#0F766E' }, MEXICO: { primaryColor: '#1f2937' } };

    // Misma regla que `savedCountry()` en `src/lib/country.ts`: sin elección guardada se
    // entra a la sede de partida.
    var country = 'COLOMBIA';
    var config = null;
    try {
      var saved = localStorage.getItem('lms_country');
      if (saved === 'COLOMBIA' || saved === 'MEXICO') country = saved;
      config = JSON.parse(localStorage.getItem('lms_config_' + country) || 'null');
    } catch (error) {
      /* Almacenamiento bloqueado o caché ilegible: vale la marca de la sede. */
    }
    config = config || BRANDS[country];

    // Colores como [H, S, L] redondeados; las constantes son las de theme.ts.
    var MIN_CONTRAST = 4.5;
    var WHITE = [0, 0, 100];
    var DARK_TEXT = [220, 30, 8];
    var DARK_SURFACE = [220, 18, 14];
    var DARK_MIN_LIGHTNESS = 62;

    function toHsl(hex) {
      if (!hex) return null;
      var value = String(hex).replace(/^#/, '');
      if (value.length === 3) value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
      if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;

      var r = parseInt(value.slice(0, 2), 16) / 255;
      var g = parseInt(value.slice(2, 4), 16) / 255;
      var b = parseInt(value.slice(4, 6), 16) / 255;
      var max = Math.max(r, g, b);
      var min = Math.min(r, g, b);
      var l = (max + min) / 2;
      if (max === min) return [0, 0, Math.round(l * 100)];

      var d = max - min;
      var s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      var h =
        max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
      return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
    }

    function luminance(hsl) {
      var a = (hsl[1] / 100) * Math.min(hsl[2] / 100, 1 - hsl[2] / 100);
      var weights = [0.2126, 0.7152, 0.0722];
      var offsets = [0, 8, 4];
      var sum = 0;
      for (var i = 0; i < 3; i++) {
        var k = (offsets[i] + hsl[0] / 30) % 12;
        var c = hsl[2] / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        sum += weights[i] * (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      }
      return sum;
    }

    function contrast(x, y) {
      var a = luminance(x);
      var b = luminance(y);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }

    function foreground(background) {
      return contrast(background, WHITE) >= contrast(background, DARK_TEXT) ? WHITE : DARK_TEXT;
    }

    function darkVariant(hsl) {
      for (var l = Math.max(hsl[2], DARK_MIN_LIGHTNESS); l < 100; l++) {
        var candidate = [hsl[0], hsl[1], l];
        if (
          contrast(candidate, DARK_SURFACE) >= MIN_CONTRAST &&
          contrast(candidate, foreground(candidate)) >= MIN_CONTRAST
        ) {
          return candidate;
        }
      }
      return [hsl[0], hsl[1], 100];
    }

    function css(hsl) {
      return hsl[0] + ' ' + hsl[1] + '% ' + hsl[2] + '%';
    }

    function brand(color) {
      return (
        '--primary:' + css(color) + ';--primary-foreground:' + css(foreground(color)) + ';--ring:' + css(color) + ';'
      );
    }

    var root = '';
    var dark = '';
    var primary = toHsl(config.primaryColor);
    if (primary) {
      root = brand(primary);
      dark = '.dark{' + brand(darkVariant(primary)) + '}';
    }

    var secondary = toHsl(config.secondaryColor);
    if (secondary) root += '--secondary:' + css(secondary) + ';';

    var radius = typeof config.borderRadius === 'number' ? config.borderRadius : 12;
    var radii = { '': 0, '-sm': -4, '-md': -2, '-lg': 0, '-xl': 4, '-2xl': 8, '-3xl': 12, '-4xl': 16 };
    for (var suffix in radii) root += '--radius' + suffix + ':' + Math.max(0, radius + radii[suffix]) + 'px;';

    var styles = document.createElement('style');
    styles.id = 'lms-theme';
    styles.textContent = ':root{' + root + '}' + dark;
    document.head.appendChild(styles);
  } catch (error) {
    /* Sin tema utilizable se usa el de serie. */
  }
})();
