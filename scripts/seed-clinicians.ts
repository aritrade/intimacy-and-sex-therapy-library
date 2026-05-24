import "dotenv/config";
import { db } from "../lib/db/client";
import { clinicianDirectory } from "../lib/db/schema";

/**
 * India-first seed for the clinician handoff directory.
 *
 * Each entry must be a real, verified, RCI / AASECT / WPATH / ESSM-affiliated
 * clinician who has consented to be listed. Replace these placeholders before
 * publishing — they are intentionally generic so the test row is obviously
 * a placeholder.
 */
const SEED = [
  {
    name: "[VERIFY] Mumbai Couple & Sexual Health Clinic",
    credentials: ["RCI-licensed Clinical Psychologist", "AASECT-certified"],
    city: "Mumbai",
    country: "IN",
    languages: ["en", "hi", "mr"],
    modalities: ["CBT", "EFT", "Sensate Focus", "Trauma-informed"],
    teleConsult: true,
    affordability: "mid" as const,
    contactUrl: "",
    notes: "Placeholder — verify and replace before publishing.",
  },
  {
    name: "[VERIFY] Delhi-NCR LGBTQ+ Affirming Therapy",
    credentials: ["RCI-licensed", "WPATH-affiliated"],
    city: "Delhi",
    country: "IN",
    languages: ["en", "hi"],
    modalities: ["IFS", "Trauma-informed", "Gender-affirming"],
    teleConsult: true,
    affordability: "mid" as const,
    contactUrl: "",
    notes: "Placeholder — verify and replace before publishing.",
  },
  {
    name: "[VERIFY] Bengaluru Sex Therapy Practice",
    credentials: ["AASECT-certified", "RCI-licensed"],
    city: "Bengaluru",
    country: "IN",
    languages: ["en", "kn", "hi"],
    modalities: ["Gottman", "Sensate Focus", "Mindfulness-based"],
    teleConsult: true,
    affordability: "mid" as const,
    contactUrl: "",
    notes: "Placeholder — verify and replace before publishing.",
  },
];

async function main() {
  console.log(`Seeding ${SEED.length} clinician directory placeholders...`);
  for (const c of SEED) {
    await db.insert(clinicianDirectory).values(c).onConflictDoNothing();
  }
  console.log("Done. Replace [VERIFY] entries with real, consented clinicians.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
