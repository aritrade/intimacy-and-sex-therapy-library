import { ContactForm } from "@/components/ContactForm";

export const metadata = {
  title: "Contact Us · Intimacy & Sex Therapy Library",
  description:
    "Get in touch — individuals, patients, clinicians, psychologists, doctors, and sexology or IVF centres are all welcome to reach out.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-10 space-y-6">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl text-ink-900">Contact Us</h1>
        <p className="text-ink-600">
          Questions, referrals, partnership enquiries, or feedback — we&apos;d love to hear
          from you. Whether you&apos;re an individual, a patient, a clinician, psychologist or
          doctor, or a private sexology, sexual-health, or IVF centre, use the form below and
          a real person will reply by email.
        </p>
      </header>

      <ContactForm />

      <section className="text-xs text-ink-400 leading-relaxed border-t border-border pt-4">
        <p>
          For data-protection requests or formal grievances under India&apos;s DPDP Act, see
          the Grievance Officer details in our{" "}
          <a href="/about/privacy" className="underline hover:text-ink-700">
            privacy notice
          </a>
          . If you&apos;re in crisis or this is an emergency, please contact your local
          emergency services or a helpline — this form is not monitored in real time.
        </p>
      </section>
    </main>
  );
}
