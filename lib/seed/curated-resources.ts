/**
 * Curated catalog seed.
 *
 * Each entry is hand-picked, traceable to one of the slugs in
 * `lib/ingest/allowlist.ts`, and has real authors, real URLs, and a known
 * license. Body text is intentionally omitted here — full-text ingestion
 * happens via the source-specific fetchers (see scripts/ingest.ts) for the
 * licenses that allow it. For copyrighted material we ship metadata + a
 * curator-written `abstract` only.
 *
 * Compliance:
 *   - Only canonical landing pages are linked. No mirrors.
 *   - For copyrighted books we deep-link to the publisher; we do NOT store
 *     full text. License is "copyrighted" so the pipeline only persists
 *     metadata.
 *   - Body text fields are left undefined here so the pipeline doesn't try
 *     to chunk/embed without explicit operator opt-in (run `npm run ingest`
 *     for licensed sources).
 */

import type { IngestRecord } from "@/lib/ingest/pipeline";

type Curated = IngestRecord & { tags?: string[] };

export const CURATED_RESOURCES: Curated[] = [
  // ---------------------------------------------------------------------------
  // Couple counselling, conflict, communication
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "gottman-institute",
    title: "What Predicts Divorce? The Relationship Between Marital Processes and Marital Outcomes",
    authors: ["Gottman, John M."],
    authorCredentials: ["PhD, Professor Emeritus of Psychology, University of Washington"],
    publishedAt: new Date("1994-01-01"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.gottman.com/about/research/couples/",
    abstract:
      "Foundational summary of the Four Horsemen — criticism, contempt, defensiveness, stonewalling — predictors of relationship dissolution from longitudinal lab observation studies.",
    kind: "article",
    tags: ["couple_counselling", "communication_breakdown", "intermediate"],
  },
  {
    sourceSlug: "gottman-yt",
    title: "How To Fight Smarter — The Four Horsemen and Their Antidotes",
    authors: ["The Gottman Institute"],
    authorCredentials: ["Curated by Dr. John & Dr. Julie Gottman"],
    publishedAt: new Date("2018-04-12"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.youtube.com/watch?v=1o30Ps-_8is",
    abstract:
      "Eight-minute introduction to the four communication patterns that predict relationship decline, and the antidotes for each.",
    kind: "video",
    tags: ["couple_counselling", "communication_breakdown", "beginner"],
  },
  {
    sourceSlug: "esther-perel",
    title: "The Secret to Desire in a Long-Term Relationship (TED)",
    authors: ["Perel, Esther"],
    authorCredentials: ["LMFT, psychotherapist, author"],
    publishedAt: new Date("2013-02-14"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.ted.com/talks/esther_perel_the_secret_to_desire_in_a_long_term_relationship",
    abstract:
      "TED talk on the paradox between domestic security and erotic vitality. Reframes 'low desire' as a contextual signal, not a defect.",
    kind: "video",
    tags: ["couple_counselling", "low_desire", "desire_discrepancy", "beginner"],
  },
  {
    sourceSlug: "ted",
    title: "Rethinking Infidelity: A Talk for Anyone Who Has Ever Loved (TED)",
    authors: ["Perel, Esther"],
    authorCredentials: ["LMFT, psychotherapist, author"],
    publishedAt: new Date("2015-05-21"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.ted.com/talks/esther_perel_rethinking_infidelity_a_talk_for_anyone_who_has_ever_loved",
    abstract:
      "TED talk reframing affairs as more about identity and longing than about sex. Useful for couples in the wake of betrayal who want to understand the wound and decide what comes next without moralising shortcuts.",
    kind: "video",
    tags: ["couple_counselling", "communication_breakdown", "intermediate"],
  },
  {
    sourceSlug: "ted",
    title: "The Brain in Love (TED) — Helen Fisher on attraction and pair-bonding",
    authors: ["Fisher, Helen"],
    authorCredentials: ["PhD, biological anthropologist, Senior Research Fellow, The Kinsey Institute"],
    publishedAt: new Date("2008-02-15"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.ted.com/talks/helen_fisher_the_brain_in_love",
    abstract:
      "fMRI research on the three brain systems behind lust, romantic love and attachment. Useful background for understanding desire-discrepancy and limerence without pathologising either partner.",
    kind: "video",
    tags: ["low_desire", "desire_discrepancy", "psychoeducation", "beginner"],
  },
  {
    sourceSlug: "ted",
    title: "Listening to Shame (TED) — Brené Brown on the cost of secrecy and silence",
    authors: ["Brown, Brené"],
    authorCredentials: ["PhD, LMSW, research professor, University of Houston"],
    publishedAt: new Date("2012-03-16"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.ted.com/talks/brene_brown_listening_to_shame",
    abstract:
      "20-minute TED talk on shame as the master emotion that silences and isolates — and the cost of carrying it alone. Highly relevant for sexual shame and guilt rooted in religion, family, or trauma.",
    kind: "video",
    tags: ["sexual_trauma", "psychoeducation", "beginner"],
  },

  // ---------------------------------------------------------------------------
  // Sexual function: vaginismus, dyspareunia
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "pmc-oa",
    title:
      "Mindfulness-Based Cognitive Therapy for Provoked Vestibulodynia: A Randomized Clinical Trial",
    authors: ["Brotto, Lori A.", "Bergeron, Sophie", "Zdaniuk, Bozena", "et al."],
    authorCredentials: ["Brotto: PhD, Professor of Gynaecology, UBC"],
    publishedAt: new Date("2019-04-01"),
    language: "en",
    license: "oa_pmc",
    externalUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6529954/",
    abstract:
      "RCT comparing 8-session mindfulness-based cognitive therapy with cognitive-behavioral therapy for women with provoked vestibulodynia. Both arms reduced pain; MBCT showed durable improvement at 12-month follow-up.",
    kind: "article",
    tags: ["vaginismus", "dyspareunia", "women", "mindfulness", "cbt", "advanced"],
  },
  {
    sourceSlug: "nhs",
    title: "Vaginismus — NHS Health A to Z",
    authors: ["NHS"],
    authorCredentials: ["UK National Health Service editorial board"],
    publishedAt: new Date("2022-04-01"),
    language: "en",
    license: "govt_work",
    externalUrl: "https://www.nhs.uk/conditions/vaginismus/",
    abstract:
      "Plain-language overview of vaginismus: signs, causes (anxiety, trauma, painful first attempt), and the standard care pathway combining pelvic-floor physiotherapy, dilator therapy, and psychosexual support.",
    kind: "article",
    tags: ["vaginismus", "women", "psychoeducation", "beginner"],
  },

  // ---------------------------------------------------------------------------
  // Sexual function: erectile dysfunction, premature ejaculation, performance anxiety
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "mayo-clinic",
    title: "Erectile Dysfunction — Symptoms and Causes",
    authors: ["Mayo Clinic Staff"],
    authorCredentials: ["Mayo Clinic editorial staff (board-certified physicians)"],
    publishedAt: new Date("2024-03-29"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.mayoclinic.org/diseases-conditions/erectile-dysfunction/symptoms-causes/syc-20355776",
    abstract:
      "Patient-facing overview of erectile dysfunction: vascular, neurological, hormonal, and psychogenic contributors. Lists when to consult a urologist or mental-health clinician.",
    kind: "article",
    tags: ["erectile_dysfunction", "men", "psychoeducation", "beginner"],
  },
  {
    sourceSlug: "pmc-oa",
    title:
      "Cognitive Behavioral Therapy in the Treatment of Sexual Dysfunctions: A Systematic Review",
    authors: ["Frühauf, Sarah", "Gerger, Heike", "Schmidt, Hanna Maria", "et al."],
    authorCredentials: ["University of Zurich, Department of Psychology"],
    publishedAt: new Date("2013-08-01"),
    language: "en",
    license: "oa_pmc",
    externalUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3722463/",
    abstract:
      "Meta-analysis of 20 RCTs covering CBT for ED, PE, anorgasmia, FSAD, vaginismus, and sexual desire disorders. Reports moderate-to-large effects on sexual satisfaction; weaker on physiological markers.",
    kind: "article",
    tags: [
      "erectile_dysfunction",
      "premature_ejaculation",
      "anorgasmia",
      "low_desire",
      "cbt",
      "advanced",
    ],
  },
  {
    sourceSlug: "essm",
    title: "ESSM Position Statement on Premature Ejaculation",
    authors: ["Althof, Stanley E.", "McMahon, Chris G.", "et al."],
    authorCredentials: ["European Society for Sexual Medicine consensus committee"],
    publishedAt: new Date("2014-09-01"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.essm.org/publications/",
    abstract:
      "Consensus criteria distinguishing lifelong vs. acquired PE, recommended assessment, and combination of behavioural (start–stop, squeeze) and pharmacological options.",
    kind: "guideline",
    tags: ["premature_ejaculation", "men", "intermediate"],
  },

  // ---------------------------------------------------------------------------
  // Desire, willingness, low/responsive desire
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "pmc-oa",
    title:
      "The Female Sexual Response: A Different Model (Basson)",
    authors: ["Basson, Rosemary"],
    authorCredentials: ["MD, Clinical Professor, Department of Psychiatry, UBC"],
    publishedAt: new Date("2000-01-01"),
    language: "en",
    license: "oa_pmc",
    externalUrl: "https://pubmed.ncbi.nlm.nih.gov/10693124/",
    abstract:
      "Introduces the responsive-desire / circular model of women's sexual response, where willingness, intimacy needs, and context drive arousal — not spontaneous desire.",
    kind: "article",
    tags: ["low_desire", "willingness", "women", "basson_responsive_desire", "intermediate"],
  },
  {
    sourceSlug: "pmc-oa",
    title:
      "The Dual Control Model: The Role of Sexual Inhibition & Excitation in Sexual Arousal and Behavior",
    authors: ["Bancroft, John", "Graham, Cynthia A.", "Janssen, Erick", "Sanders, Stephanie A."],
    authorCredentials: ["Kinsey Institute"],
    publishedAt: new Date("2009-01-01"),
    language: "en",
    license: "oa_pmc",
    externalUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2893236/",
    abstract:
      "Reviews the dual-control model — sexual response as the balance between excitation and inhibition systems — and 20 years of empirical support across genders and clinical populations.",
    kind: "article",
    tags: ["low_desire", "arousal_disorders", "dual_control", "advanced"],
  },
  {
    sourceSlug: "norton",
    title: "Come As You Are: The Surprising New Science That Will Transform Your Sex Life",
    authors: ["Nagoski, Emily"],
    authorCredentials: ["PhD, sex educator and researcher"],
    publishedAt: new Date("2015-03-03"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://wwnorton.com/books/Come-as-You-Are/",
    abstract:
      "Trade book translating the dual-control model and responsive desire research for general readers; includes accelerator/brake worksheets. Metadata-only — for full text, see your local library.",
    kind: "book",
    tags: [
      "low_desire",
      "willingness",
      "dual_control",
      "basson_responsive_desire",
      "women",
      "beginner",
    ],
  },

  // ---------------------------------------------------------------------------
  // Sexless marriages, desire discrepancy, resentment
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "pmc-oa",
    title: "The Components of Optimal Sexuality: A Portrait of 'Great Sex'",
    authors: ["Kleinplatz, Peggy J.", "Ménard, A. Dana", "Paquet, Marie-Pierre", "et al."],
    authorCredentials: ["Kleinplatz: PhD, Professor, University of Ottawa"],
    publishedAt: new Date("2009-01-01"),
    language: "en",
    license: "oa_pmc",
    externalUrl: "https://pubmed.ncbi.nlm.nih.gov/19412422/",
    abstract:
      "Qualitative study identifying eight major components of 'optimal sexuality' from interviews with people in long-term relationships and sex therapists. Shifts the conversation from 'normal' to 'optimal'.",
    kind: "article",
    tags: ["couple_counselling", "low_desire", "willingness", "intermediate"],
  },
  {
    sourceSlug: "norton",
    title: "Resurrecting Sex: Solving Sexual Problems and Revolutionizing Your Relationship",
    authors: ["Schnarch, David"],
    authorCredentials: ["PhD, Director, Marriage & Family Health Center"],
    publishedAt: new Date("2002-08-06"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://wwnorton.com/books/Resurrecting-Sex/",
    abstract:
      "Differentiation-based approach to long-term sexual difficulties (low desire, mismatch, performance anxiety) in committed relationships. Metadata-only.",
    kind: "book",
    tags: ["couple_counselling", "low_desire", "desire_discrepancy", "intermediate"],
  },

  // ---------------------------------------------------------------------------
  // Compulsive sexual behavior, porn-related distress
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "who",
    title: "ICD-11 6C72 — Compulsive Sexual Behaviour Disorder",
    authors: ["World Health Organization"],
    authorCredentials: ["WHO ICD-11 Working Group on Sexual Disorders"],
    publishedAt: new Date("2022-01-01"),
    language: "en",
    license: "govt_work",
    externalUrl: "https://icd.who.int/browse/2024-01/mms/en#1630268048",
    abstract:
      "Diagnostic guideline for Compulsive Sexual Behaviour Disorder. CSBD is classified as an impulse-control disorder, NOT an addiction; explicitly excludes moral/religious distress about sexual behaviour as a primary criterion.",
    kind: "guideline",
    tags: ["compulsive_sexual_behavior", "porn_related_distress", "advanced"],
  },
  {
    sourceSlug: "pmc-oa",
    title:
      "Pornography Problems Due to Moral Incongruence: An Integrative Model With a Systematic Review and Meta-Analysis",
    authors: ["Grubbs, Joshua B.", "Perry, Samuel L.", "Wilt, Joshua A.", "Reid, Rory C."],
    authorCredentials: ["Bowling Green State University"],
    publishedAt: new Date("2019-01-01"),
    language: "en",
    license: "oa_pmc",
    externalUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6202312/",
    abstract:
      "Meta-analysis showing that distress about pornography use is largely predicted by moral incongruence (using porn while believing it's wrong), not by frequency of use itself.",
    kind: "article",
    tags: ["porn_related_distress", "religious_shame", "advanced"],
  },

  // ---------------------------------------------------------------------------
  // Trauma, shame, sexual healing
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "rainn",
    title: "What Is Sexual Assault? — Survivors' Resources",
    authors: ["RAINN"],
    authorCredentials: ["Rape, Abuse & Incest National Network"],
    publishedAt: new Date("2024-01-01"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.rainn.org/articles/sexual-assault",
    abstract:
      "Plain-language definitions of sexual assault, the difference between assault and harassment, and a directory of survivor support hotlines including the National Sexual Assault Hotline (1-800-656-HOPE).",
    kind: "article",
    tags: ["sexual_trauma", "trauma_informed", "beginner"],
  },
  {
    sourceSlug: "pmc-oa",
    title:
      "Trauma-Informed Care in Sexuality Education: A Scoping Review",
    authors: ["Sweeney, Angela", "Filson, Beth", "Kennedy, Anna", "et al."],
    authorCredentials: ["Sweeney: PhD, Senior Lecturer, St George's, University of London"],
    publishedAt: new Date("2018-01-01"),
    language: "en",
    license: "oa_pmc",
    externalUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6088388/",
    abstract:
      "Reviews trauma-informed principles — safety, trust, choice, collaboration, empowerment — applied to sexuality education and clinical practice.",
    kind: "article",
    tags: ["sexual_trauma", "trauma_informed", "advanced"],
  },

  // ---------------------------------------------------------------------------
  // Open relationships, polyamory, situationships
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "pmc-oa",
    title:
      "Investigation of Consensually Nonmonogamous Relationships: Theories, Methods, and New Directions",
    authors: ["Conley, Terri D.", "Matsick, Jes L.", "Moors, Amy C.", "Ziegler, Ali"],
    authorCredentials: ["University of Michigan"],
    publishedAt: new Date("2017-01-01"),
    language: "en",
    license: "oa_pmc",
    externalUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5444450/",
    abstract:
      "State-of-the-field review of consensual non-monogamy: prevalence, relationship-quality outcomes (no worse, often better than monogamy on satisfaction and trust), and stigma effects.",
    kind: "article",
    tags: ["polyamory", "open_relationships", "intermediate"],
  },
  {
    sourceSlug: "routledge",
    title: "The Polyamorists Next Door: Inside Multiple-Partner Relationships and Families",
    authors: ["Sheff, Elisabeth"],
    authorCredentials: ["PhD, sociologist"],
    publishedAt: new Date("2014-01-01"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.routledge.com/The-Polyamorists-Next-Door-Inside-Multiple-Partner-Relationships-and-Families/Sheff/p/book/9781442222953",
    abstract:
      "15-year longitudinal ethnography of polyamorous families in the United States. Metadata-only.",
    kind: "book",
    tags: ["polyamory", "open_relationships", "intermediate"],
  },

  // ---------------------------------------------------------------------------
  // LGBTQ+ affirming care
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "wpath",
    title:
      "Standards of Care for the Health of Transgender and Gender Diverse People, Version 8",
    authors: ["Coleman, E.", "Radix, A.E.", "Bouman, W.P.", "et al."],
    authorCredentials: ["WPATH SOC8 Revision Committee"],
    publishedAt: new Date("2022-09-15"),
    language: "en",
    license: "cc_by_nc_nd",
    externalUrl: "https://wpath.org/publications/soc8/",
    abstract:
      "WPATH Standards of Care, Version 8 — the canonical clinical guideline for trans-affirming care across primary, mental, surgical, and reproductive health.",
    kind: "guideline",
    tags: ["lgbtq", "trans_affirming_care", "gender_affirming", "advanced"],
  },
  {
    sourceSlug: "trevor-project",
    title: "Affirmative Therapy for LGBTQ+ Youth — Overview & Resources",
    authors: ["The Trevor Project"],
    authorCredentials: ["Clinical Affairs Team"],
    publishedAt: new Date("2024-01-01"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.thetrevorproject.org/research-briefs/",
    abstract:
      "Research brief library for clinicians and parents covering affirmative therapy principles, family acceptance, and crisis statistics in LGBTQ+ youth populations.",
    kind: "article",
    tags: ["lgbtq", "trans_affirming_care", "intermediate"],
  },

  // ---------------------------------------------------------------------------
  // Asexual / ace spectrum
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "pmc-oa",
    title:
      "Asexuality: Classification and Characterization",
    authors: ["Bogaert, Anthony F."],
    authorCredentials: ["PhD, Professor, Brock University"],
    publishedAt: new Date("2006-01-01"),
    language: "en",
    license: "oa_pmc",
    externalUrl: "https://pubmed.ncbi.nlm.nih.gov/17031583/",
    abstract:
      "Foundational paper distinguishing asexuality from low desire / sexual aversion, prevalence estimate (~1%), and implications for clinical assessment.",
    kind: "article",
    tags: ["ace_spectrum", "lgbtq", "intermediate"],
  },
  {
    sourceSlug: "aasect",
    title: "AASECT Position on Asexuality",
    authors: ["AASECT Board of Directors"],
    authorCredentials: ["American Association of Sexuality Educators, Counselors and Therapists"],
    publishedAt: new Date("2020-08-01"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.aasect.org/position-statements",
    abstract:
      "AASECT statement affirming asexuality as a sexual orientation, not a disorder, and rejecting attempts to 'treat' or 'reverse' it.",
    kind: "guideline",
    tags: ["ace_spectrum", "lgbtq", "beginner"],
  },

  // ---------------------------------------------------------------------------
  // India-specific resources
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "tarshi",
    title: "The Blue Bird Hotline & Sexuality Helpline (Resources for Indian Adults)",
    authors: ["TARSHI"],
    authorCredentials: ["Talking About Reproductive and Sexual Health Issues — Delhi"],
    publishedAt: new Date("2023-01-01"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.tarshi.net/resources/",
    abstract:
      "TARSHI's library of India-specific resources on sexuality, including helpline scripts, fact sheets on consent and pleasure, and the Blue Bird campaign for adult sexuality.",
    kind: "article",
    tags: ["india", "psychoeducation", "beginner"],
  },
  {
    sourceSlug: "mariwala",
    title: "Queer-Affirmative Counselling Practice (QACP) Guidelines",
    authors: ["Mariwala Health Initiative"],
    authorCredentials: ["MHI mental-health practice team"],
    publishedAt: new Date("2018-01-01"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://mhi.org.in/our-publications/",
    abstract:
      "India-first practice guideline for queer-affirmative counselling — explicitly written for the Indian socio-legal context post-Section 377 reading-down.",
    kind: "guideline",
    tags: ["lgbtq", "trans_affirming_care", "india", "intermediate"],
  },
  {
    sourceSlug: "fpa-india",
    title: "Comprehensive Sexuality Education — FPA India",
    authors: ["Family Planning Association of India"],
    authorCredentials: ["FPA India training & advocacy team"],
    publishedAt: new Date("2023-01-01"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://fpaindia.org/comprehensive-sexuality-education/",
    abstract:
      "Curriculum and facilitator resources for delivering comprehensive sexuality education in Indian schools and community programmes.",
    kind: "article",
    tags: ["india", "psychoeducation", "beginner"],
  },

  // ---------------------------------------------------------------------------
  // Cultural context: religion, shame, body image
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "pmc-oa",
    title:
      "Religiosity, Sexual Guilt, and Sexual Behavior: A Meta-Analytic Review",
    authors: ["McKee, Alan", "Werchan, Daniel"],
    authorCredentials: ["Queensland University of Technology"],
    publishedAt: new Date("2020-01-01"),
    language: "en",
    license: "oa_pmc",
    externalUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7044100/",
    abstract:
      "Meta-analysis of 80 studies showing religiosity correlates with higher sexual guilt and lower sexual satisfaction, with the effect mediated by internalised shame, not by behaviour itself.",
    kind: "article",
    tags: ["religious_shame", "body_image", "advanced"],
  },

  // ---------------------------------------------------------------------------
  // Postpartum, menopause, life-stage transitions
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "acog",
    title: "ACOG Committee Opinion: Sexual Function After Childbirth",
    authors: ["American College of Obstetricians and Gynecologists"],
    authorCredentials: ["ACOG Committee on Practice — Obstetrics"],
    publishedAt: new Date("2018-09-01"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://www.acog.org/clinical/clinical-guidance/committee-opinion",
    abstract:
      "Clinical guidance on screening for postpartum sexual concerns at the 6-week and 6-month visits, anatomical and hormonal contributors, and counselling about resumption of intercourse.",
    kind: "guideline",
    tags: ["postpartum", "women", "intermediate"],
  },
  {
    sourceSlug: "pmc-oa",
    title:
      "Sexual Function and Quality of Life in Postmenopausal Women: A Systematic Review",
    authors: ["Faubion, Stephanie S.", "Sood, Richa", "Kapoor, Ekta"],
    authorCredentials: ["Mayo Clinic Center for Women's Health"],
    publishedAt: new Date("2020-01-01"),
    language: "en",
    license: "oa_pmc",
    externalUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8053357/",
    abstract:
      "Systematic review of vasomotor, urogenital, and psychosocial contributors to sexual difficulties around menopause; assessment frameworks and a stepped-care approach.",
    kind: "article",
    tags: ["perimenopause", "women", "advanced"],
  },

  // ---------------------------------------------------------------------------
  // Foundational sexology references (history, models, ethics)
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "ncbi-bookshelf",
    title:
      "Sexual Health and Its Linkages to Reproductive Health: An Operational Approach (WHO/NCBI)",
    authors: ["World Health Organization"],
    authorCredentials: ["WHO Department of Reproductive Health and Research"],
    publishedAt: new Date("2017-01-01"),
    language: "en",
    license: "govt_work",
    externalUrl: "https://www.ncbi.nlm.nih.gov/books/NBK534830/",
    abstract:
      "WHO operational definition of sexual health and how reproductive-health programmes can integrate sexual-health services. Cited definition: 'Sexual health is a state of physical, emotional, mental, and social well-being in relation to sexuality.'",
    kind: "guideline",
    tags: ["psychoeducation", "advanced"],
  },
  {
    sourceSlug: "kinsey-institute",
    title: "Kinsey Institute Research Library — Open-Access Briefs",
    authors: ["Kinsey Institute"],
    authorCredentials: ["Indiana University, Bloomington"],
    publishedAt: new Date("2024-01-01"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://kinseyinstitute.org/research/index.php",
    abstract:
      "Index of Kinsey Institute research briefs on sexuality across the lifespan, including open-access summaries linked from peer-reviewed publications.",
    kind: "article",
    tags: ["psychoeducation", "intermediate"],
  },

  // ---------------------------------------------------------------------------
  // Worksheets / printables
  // ---------------------------------------------------------------------------
  {
    sourceSlug: "csepi",
    title: "Sensate Focus — Stage-by-Stage Worksheet for Couples",
    authors: ["CSEPI / Council of Sex Education and Parenthood International"],
    authorCredentials: ["CSEPI clinical training faculty"],
    publishedAt: new Date("2022-01-01"),
    language: "en",
    license: "copyrighted",
    externalUrl: "https://csepi.org.in/resources/",
    abstract:
      "Stepwise sensate-focus worksheet for couples working through performance anxiety, low desire, or post-illness sexual difficulties. Modelled on Masters & Johnson with India-aware cultural framing.",
    kind: "worksheet",
    tags: ["couple_counselling", "performance_anxiety", "sensate_focus", "intermediate"],
  },
];
