"use client";

import { ArrowLeft, Shield } from "lucide-react";
import Link from "next/link";
import { useConfig } from "@/contexts/ConfigContext";
import { useSede } from "@/contexts/SedeContext";

export default function LegalPage() {
  const { config } = useConfig();
  const { nombre: nombreSede } = useSede();
  const platformName = config?.nombre_plataforma || "PESV Education";

  const defaultTerminos = `Bienvenido a ${platformName}. Al acceder y utilizar nuestra plataforma de capacitación y certificación, aceptas estar sujeto a estos términos y condiciones. Todo el contenido educativo, evaluaciones y recursos disponibles en esta plataforma son propiedad intelectual exclusiva o están licenciados a nuestra organización.\n\nEl usuario se compromete a hacer un uso adecuado de los contenidos y servicios ofrecidos, no empleándolos para incurrir en actividades ilícitas o contrarias a la buena fe y al orden público.`;

  const defaultPrivacidad = `En ${platformName}, valoramos tu privacidad. Recopilamos información personal (como nombres, correos electrónicos e historial de capacitación) exclusivamente para proporcionar, mantener y mejorar nuestros servicios, así como para la emisión de certificados oficiales.\n\nNo compartimos, vendemos ni alquilamos tu información personal a terceros para fines de marketing sin tu consentimiento explícito, excepto cuando sea requerido por autoridades competentes en el marco del cumplimiento del Plan Estratégico de Seguridad Vial (PESV).`;

  const defaultDatos = `De acuerdo con las leyes nacionales de protección de datos personales, garantizamos a todos nuestros usuarios el derecho a conocer, actualizar y rectificar la información que se haya recogido sobre ellos en nuestras bases de datos.\n\nSi deseas ejercer tus derechos sobre tus datos, puedes enviar una solicitud formal a través de los canales de contacto especificados en la página principal.`;

  const terminos = config?.legal_terminos || defaultTerminos;
  const privacidad = config?.legal_privacidad || defaultPrivacidad;
  const datos = config?.legal_datos || defaultDatos;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* HEADER */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Volver al Inicio</span>
          </Link>
          <div className="flex items-center gap-2 font-bold text-primary">
            <Shield className="h-5 w-5" />
            {platformName}
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <main className="flex-1 py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-5xl font-black mb-8">Información Legal y Privacidad</h1>
          <p className="text-muted-foreground text-lg mb-4">
            Última actualización: {new Date().toLocaleDateString('es-ES')}
          </p>
          {nombreSede && (
            <p className="mb-12 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Estos textos corresponden a la sede de <strong className="text-foreground">{nombreSede}</strong>. Cada
              sede se rige por la normativa de su país y publica sus propias condiciones.
            </p>
          )}

          <section id="terminos" className="mb-12 scroll-mt-24">
            <h2 className="text-2xl font-bold mb-4">1. Términos de uso</h2>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{terminos}</p>
          </section>

          <section id="privacidad" className="mb-12 scroll-mt-24">
            <h2 className="text-2xl font-bold mb-4">2. Política de privacidad</h2>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{privacidad}</p>
          </section>

          <section id="datos" className="mb-12 scroll-mt-24">
            <h2 className="text-2xl font-bold mb-4">3. Protección de datos</h2>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{datos}</p>
          </section>

          <section id="certificados" className="scroll-mt-24">
            <h2 className="text-2xl font-bold mb-4">4. Emisión de certificados</h2>
            <p className="text-muted-foreground leading-relaxed">
              Los certificados emitidos por la plataforma llevan un código de verificación único. Cualquiera puede
              comprobar su autenticidad en{' '}
              <Link href="/verificar" className="font-bold text-primary hover:underline">
                la página de verificación
              </Link>
              . La falsificación o alteración de estos documentos constituye una violación de estos términos.
            </p>
          </section>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-border/50 py-8 text-center text-sm text-muted-foreground bg-card/20">
        <p>© {new Date().getFullYear()} {platformName}. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}
