"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { useBusinessId } from "./business-id-context";

const WIDGET_URL = process.env.NEXT_PUBLIC_WIDGET_URL;

export default function EmbedSnippet() {
  const businessId = useBusinessId();
  const [copied, setCopied] = useState(false);

  const snippet = `<script src="${WIDGET_URL}/widget.js" data-business-id="${businessId}"></script>`;

  async function handleCopy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <h2 className="font-display text-xl text-ink">Embed snippet</h2>
      <p className="mt-1 text-sm text-muted">
        Paste this before the closing <code className="text-ink">&lt;/body&gt;</code> tag on your website.
      </p>

      <div className="mt-4 flex items-start gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink">
          {snippet}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
