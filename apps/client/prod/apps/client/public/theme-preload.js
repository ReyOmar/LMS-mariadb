// LMS Theme Preload Script
// Applied BEFORE React hydration to prevent color/font flash (FOUC).
// Reads cached config from localStorage and applies CSS custom properties.
try {
  var c = JSON.parse(localStorage.getItem('lms_config_cache'));
  if (c) {
    var d = document.documentElement.style;
    if (c.color_primario) {
      var hex = c.color_primario.replace('#','');
      if(hex.length===3) hex=hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
      var r=parseInt(hex.substring(0,2),16)/255,g=parseInt(hex.substring(2,4),16)/255,b=parseInt(hex.substring(4,6),16)/255;
      var mx=Math.max(r,g,b),mn=Math.min(r,g,b),h=0,s=0,l=(mx+mn)/2;
      if(mx!==mn){var dd=mx-mn;s=l>0.5?dd/(2-mx-mn):dd/(mx+mn);switch(mx){case r:h=(g-b)/dd+(g<b?6:0);break;case g:h=(b-r)/dd+2;break;case b:h=(r-g)/dd+4;break;}h/=6;}
      var hsl=Math.round(h*360)+' '+Math.round(s*100)+'% '+Math.round(l*100)+'%';
      d.setProperty('--primary',hsl);d.setProperty('--ring',hsl);
    }
    if (c.color_secundario) {
      var hex2=c.color_secundario.replace('#','');
      if(hex2.length===3) hex2=hex2[0]+hex2[0]+hex2[1]+hex2[1]+hex2[2]+hex2[2];
      var r2=parseInt(hex2.substring(0,2),16)/255,g2=parseInt(hex2.substring(2,4),16)/255,b2=parseInt(hex2.substring(4,6),16)/255;
      var mx2=Math.max(r2,g2,b2),mn2=Math.min(r2,g2,b2),h2=0,s2=0,l2=(mx2+mn2)/2;
      if(mx2!==mn2){var dd2=mx2-mn2;s2=l2>0.5?dd2/(2-mx2-mn2):dd2/(mx2+mn2);switch(mx2){case r2:h2=(g2-b2)/dd2+(g2<b2?6:0);break;case g2:h2=(b2-r2)/dd2+2;break;case b2:h2=(r2-g2)/dd2+4;break;}h2/=6;}
      d.setProperty('--secondary',Math.round(h2*360)+' '+Math.round(s2*100)+'% '+Math.round(l2*100)+'%');
    }
    var r_px = (c.border_radius !== undefined && c.border_radius !== null) ? c.border_radius : 12;
    var font = c.fuente ? '"'+c.fuente+'", ui-sans-serif, system-ui, sans-serif' : null;
    var fontRule = font ? '*, *::before, *::after { font-family: '+font+' !important; }' : '';
    var st = document.createElement('style');
    st.id = 'lms-theme-override';
    st.textContent = ':root { --radius:'+r_px+'px !important; --radius-sm:'+Math.max(0,r_px-4)+'px !important; --radius-md:'+Math.max(0,r_px-2)+'px !important; --radius-lg:'+r_px+'px !important; --radius-xl:'+(r_px>0?r_px+4:0)+'px !important; --radius-2xl:'+(r_px>0?r_px+8:0)+'px !important; --radius-3xl:'+(r_px>0?r_px+12:0)+'px !important; --radius-4xl:'+(r_px>0?r_px+16:0)+'px !important; } ' + fontRule;
    document.head.appendChild(st);
    if (font) d.setProperty('--font-sans', font);
  }
} catch(e) {}
