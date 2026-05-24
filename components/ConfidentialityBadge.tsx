type Mode = "ephemeral" | "encrypted" | "vault";

const COPY: Record<Mode, { label: string; tooltip: string }> = {
  ephemeral: {
    label: "Ephemeral",
    tooltip:
      "Nothing is saved on our servers. Messages live only in your browser tab and disappear when you close it.",
  },
  encrypted: {
    label: "Encrypted",
    tooltip:
      "AES-256-GCM at rest, key wrapped by KMS. Server admins cannot read your messages without the KMS key.",
  },
  vault: {
    label: "Vault (zero-knowledge)",
    tooltip:
      "Messages are encrypted in your browser with your passphrase before they leave your device. We physically cannot read them.",
  },
};

export function ConfidentialityBadge({ mode }: { mode: Mode }) {
  const c = COPY[mode];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft text-accent-ink px-2.5 py-0.5 text-xs font-medium"
      title={c.tooltip}
      aria-label={`Confidentiality: ${c.label}. ${c.tooltip}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 11c1.1 0 2-.9 2-2V7a2 2 0 1 0-4 0v2c0 1.1.9 2 2 2zm6-2v2H6V9a6 6 0 0 1 12 0zm-9 4h6a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3z"
        />
      </svg>
      {c.label}
    </span>
  );
}
