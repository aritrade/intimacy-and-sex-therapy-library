/**
 * Clinical-review board seed.
 *
 * Inserts placeholder rows in `clinical_advisors`. These rows are used to
 * stamp `reviews.advisor_id` and `content_drafts.clinician_reviewer_id` so
 * the catalog can show "reviewed by Dr. X on YYYY-MM-DD".
 *
 *   npm run db:seed-board
 *
 * Replace the [VERIFY] placeholders with real, consented advisors before
 * publishing anything. The script is idempotent (ON CONFLICT DO NOTHING by
 * name).
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { clinicalAdvisors } from "../lib/db/schema";

type AdvisorSeed = {
  name: string;
  credentials: string[];
  bio: string;
  isActive: boolean;
};

const SEED: AdvisorSeed[] = [
  {
    name: "[VERIFY] Dr. Couples & Sexuality Lead",
    credentials: [
      "RCI-licensed Clinical Psychologist (India)",
      "AASECT-certified Sex Therapist",
    ],
    bio:
      "Reviews couple-counselling and desire/willingness content for clinical accuracy and India-aware framing. Replace this row with your actual lead reviewer's profile.",
    isActive: true,
  },
  {
    name: "[VERIFY] Dr. LGBTQ+ Affirmative Lead",
    credentials: ["RCI-licensed", "WPATH-affiliated", "Mariwala QACP-trained"],
    bio:
      "Reviews LGBTQ+ and trans-affirming content; ensures language meets WPATH SOC8 and the Mariwala QACP guidelines.",
    isActive: true,
  },
  {
    name: "[VERIFY] Dr. Trauma & Compulsive-Behaviour Lead",
    credentials: [
      "RCI-licensed Clinical Psychologist",
      "ISST-certified Trauma Therapist",
    ],
    bio:
      "Reviews trauma-informed and compulsive-sexual-behaviour content; pulls in crisis-resource alignment.",
    isActive: true,
  },
  {
    name: "[VERIFY] Dr. Reproductive & Menopause Lead",
    credentials: ["MD, FACOG", "Member, Indian Menopause Society"],
    bio:
      "Reviews menopause, postpartum, and reproductive-health content with both ACOG and Indian Menopause Society guidance in mind.",
    isActive: true,
  },
  {
    name: "[VERIFY] Editor (non-clinician)",
    credentials: ["Senior Editor, Sex Therapy Library"],
    bio:
      "Editorial sign-off for tone, accessibility, captions, and alignment with the library's plain-language commitment. Editor approvals are required (in addition to clinician approval) for any short-form publishing.",
    isActive: true,
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }
  console.log(`Seeding ${SEED.length} clinical-board placeholders...`);
  for (const s of SEED) {
    const existing = await db
      .select({ id: clinicalAdvisors.id })
      .from(clinicalAdvisors)
      .where(eq(clinicalAdvisors.name, s.name))
      .limit(1);
    if (existing[0]) continue;
    await db.insert(clinicalAdvisors).values(s);
  }
  console.log(
    "Done. Replace [VERIFY] rows with real advisors before publishing anything.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
