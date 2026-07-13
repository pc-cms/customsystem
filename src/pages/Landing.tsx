/**
 * Premium B2B landing for casinosystem.app — root-domain catch-all.
 * Light Dreelio-inspired aesthetic: sky + clouds + huge grotesque headings,
 * black pill CTAs, tilted dashboard mockup, marquee operators.
 */

import { LandingI18nProvider } from "./landing/i18n/LandingI18nProvider";
import { BackdropLayers } from "./landing/components/BackdropLayers";
import { SiteHeader } from "./landing/components/SiteHeader";
import { Hero } from "./landing/components/Hero";
import { OperatorsStrip } from "./landing/components/OperatorsStrip";
import { BuiltForLandBased } from "./landing/components/BuiltForLandBased";
import { ModulesGrid } from "./landing/components/ModulesGrid";
import { WhyCustom } from "./landing/components/WhyCustom";
import { IntegrationsLanguages } from "./landing/components/IntegrationsLanguages";
import { IntegrationProcess } from "./landing/components/IntegrationProcess";
import { Pricing } from "./landing/components/Pricing";
import { Testimonials } from "./landing/components/Testimonials";
import { AboutCMS } from "./landing/components/AboutCMS";
import { ContactForm } from "./landing/components/ContactForm";
import { SiteFooter } from "./landing/components/SiteFooter";

import "./landing/landing.css";

export default function Landing() {
  return (
    <LandingI18nProvider>
      <div className="landing-root">
        <BackdropLayers />
        <SiteHeader />
        <main style={{ position: "relative", zIndex: 1 }}>
          <Hero />
          <OperatorsStrip />
          <BuiltForLandBased />
          <ModulesGrid />
          <WhyCustom />
          <IntegrationsLanguages />
          <IntegrationProcess />
          <Pricing />
          <Testimonials />
          <AboutCMS />
          <ContactForm />
        </main>
        <SiteFooter />
      </div>
    </LandingI18nProvider>
  );
}
