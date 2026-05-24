export type Strings = {
  brand: { name: string; tagline: string };
  nav: {
    catalog: string;
    library: string;
    chat: string;
    companion: string;
    glossary: string;
    paths: string;
    about: string;
  };
  ageGate: {
    title: string;
    body: string;
    confirm: string;
    decline: string;
    youthRedirect: string;
  };
  disclaimer: {
    educational: string;
    notTherapist: string;
    encrypted: string;
  };
  crisis: { title: string; body: string; cta: string };
  consent: {
    title: string;
    body: string;
    purposes: {
      essential: string;
      personalization: string;
      assessment: string;
      companion_encrypted: string;
      research: string;
    };
    accept: string;
    revokeAt: string;
    dpoLabel: string;
  };
  landing: {
    enter: string;
    exploreCatalog: string;
    openLibrary: string;
    askLibrary: string;
    talkToSahay: string;
    surfaces: {
      catalog: { title: string; body: string };
      library: { title: string; body: string };
      chat: { title: string; body: string };
      companion: { title: string; body: string };
    };
  };
};

export const en: Strings = {
  brand: {
    name: "Intimacy & Sex Therapy Library",
    tagline:
      "An evidence-based, clinician-reviewed library on sex, intimacy, and relationships.",
  },
  nav: {
    catalog: "Catalog",
    library: "Library",
    chat: "Ask the Library",
    companion: "Sahay (Companion)",
    glossary: "Glossary",
    paths: "Learning Paths",
    about: "About",
  },
  ageGate: {
    title: "Are you 18 or older?",
    body: "This site discusses sexual health, sexuality, and intimate relationships in clinical detail. You must be 18 or older to enter.",
    confirm: "Yes, I'm 18 or older",
    decline: "I'm under 18",
    youthRedirect:
      "If you are under 18 and looking for help, please reach out to a trusted adult, school counsellor, or a youth helpline.",
  },
  disclaimer: {
    educational: "Educational. Not medical advice.",
    notTherapist: "Not a licensed therapist.",
    encrypted: "Your companion conversations are encrypted.",
  },
  crisis: {
    title: "If you are in crisis, you are not alone.",
    body: "If you are thinking of harming yourself, or if you are in danger, please reach out now.",
    cta: "See helplines",
  },
  consent: {
    title: "Before we begin",
    body: "We collect the minimum needed to run this service. Sexual orientation and health are sensitive personal data and we treat them as such (DPDP Act 2023, GDPR Art. 9).",
    purposes: {
      essential:
        "Essential cookies and storage so the site works (age gate, your settings).",
      personalization:
        "Optional. Remember your bookmarks, learning-path progress, and preferred language.",
      assessment:
        "Optional. Save validated self-assessment results so you can see them later. Stored encrypted.",
      companion_encrypted:
        "Optional. Save Sahay conversations encrypted at rest. You can delete them at any time.",
      research:
        "Optional. Anonymous, aggregate analytics on which articles help readers most. No content of your messages or assessments is included.",
    },
    accept: "I agree to the selected purposes",
    revokeAt: "You can change or revoke any of these at /me/privacy.",
    dpoLabel: "Data Protection Officer",
  },
  landing: {
    enter: "Enter",
    exploreCatalog: "Browse the catalog",
    openLibrary: "Open the library",
    askLibrary: "Ask the library",
    talkToSahay: "Talk to Sahay",
    surfaces: {
      catalog: {
        title: "Catalog",
        body: "Articles, videos, and clinical guidelines from AASECT, WPATH, WHO, NIH, peer-reviewed journals, and reputable universities. Tagged beginner / intermediate / advanced.",
      },
      library: {
        title: "Virtual Library",
        body: "Open-access PDFs you can read in-browser; for copyrighted works, curator notes and authorized links to publisher, library lending, or buy.",
      },
      chat: {
        title: "Ask the Library",
        body: "A chatbot grounded only in the curated corpus. Every claim is cited. If the library doesn't have an answer, it says so.",
      },
      companion: {
        title: "Sahay — AI Companion",
        body: "A warm, validation-first space if you want to talk. Sahay is AI, not a therapist. Three confidentiality modes including zero-knowledge vault. India-aware.",
      },
    },
  },
};
