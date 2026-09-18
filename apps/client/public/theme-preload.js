/**
 * Aplica el tema de la sede antes de que React monte.
 *
 * Es una duplicación deliberada de una parte de `src/lib/tema.ts`: ese módulo se ejecuta
 * después de la hidratación y, hasta entonces, la página se vería con los colores por
 * defecto y cambiaría de golpe. Este script corre antes del primer pintado y sólo toca lo
 * que produce ese salto visible: color primario, color secundario y redondeo.
 *
 * Todo va dentro de un try: si el almacenamiento está bloqueado o la caché es antigua, la
 * página se pinta con el tema por defecto en lugar de quedarse en blanco.
 */
(function () {
  try {
    var pais = localStorage.getItem('lms_pais');
    if (!pais) return;

    var config = JSON.parse(localStorage.getItem('lms_config_' + pais) || 'null');
    if (!config) return;

    var raiz = document.documentElement.style;

    /** Convierte #RRGGBB al triplete HSL que usan las variables de Tailwind. */
    function aHsl(hex) {
      if (!hex) return null;
      var v = String(hex).replace('#', '');
      if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
      if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;

      var r = parseInt(v.slice(0, 2), 16) / 255;
      var g = parseInt(v.slice(2, 4), 16) / 255;
      var b = parseInt(v.slice(4, 6), 16) / 255;
      var max = Math.max(r, g, b);
      var min = Math.min(r, g, b);
      var l = (max + min) / 2;
      if (max === min) return '0 0% ' + Math.round(l * 100) + '%';

      var d = max - min;
      var s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      var h =
        max === r
          ? ((g - b) / d + (g < b ? 6 : 0)) / 6
          : max === g
            ? ((b - r) / d + 2) / 6
            : ((r - g) / d + 4) / 6;

      return Math.round(h * 360) + ' ' + Math.round(s * 100) + '% ' + Math.round(l * 100) + '%';
    }

    var primario = aHsl(config.color_primario);
    if (primario) {
      raiz.setProperty('--primary', primario);
      raiz.setProperty('--ring', primario);
    }

    var secundario = aHsl(config.color_secundario);
    if (secundario) raiz.setProperty('--secondary', secundario);

    var radio = typeof config.border_radius === 'number' ? config.border_radius : 12;
    var escalar = function (delta) {
      return Math.max(0, radio + delta) + 'px';
    };

    var estilos = document.createElement('style');
    estilos.id = 'lms-tema';
    estilos.textContent =
      ':root{--radius:' +
      radio +
      'px;--radius-sm:' +
      escalar(-4) +
      ';--radius-md:' +
      escalar(-2) +
      ';--radius-lg:' +
      radio +
      'px;--radius-xl:' +
      escalar(4) +
      ';--radius-2xl:' +
      escalar(8) +
      ';--radius-3xl:' +
      escalar(12) +
      ';--radius-4xl:' +
      escalar(16) +
      ';}';
    document.head.appendChild(estilos);
  } catch (error) {
    /* Sin caché utilizable se usa el tema por defecto. */
  }
})();
