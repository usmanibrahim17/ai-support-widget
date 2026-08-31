"use client";

import { FileText, MessagesSquare, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { useBusinessId } from "./business-id-context";
import EmbedSnippet from "./embed-snippet";
import { createClient } from "@/lib/supabase/client";

type Stats = {
  documents: number;
  conversations: number;
  escalated: number;
};

function StatTile({
  icon: Icon,
  label,
  value,
  isLoading,
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <div className="flex items-center gap-2 text-muted">
        <Icon size={16} strokeWidth={2} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="mt-3 font-display text-3xl text-ink">
        {isLoading ? "—" : value}
      </p>
    </div>
  );
}

export default function OverviewPage() {
  const businessId = useBusinessId();
  const supabase = createClient();

  const [stats, setStats] = useState<Stats>({
    documents: 0,
    conversations: 0,
    escalated: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      const [documents, conversations, escalated] = await Promise.all([
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId),
        supabase
          .from("chat_logs")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId),
        supabase
          .from("chat_logs")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("was_escalated", true),
      ]);

      if (!cancelled) {
        setStats({
          documents: documents.count ?? 0,
          conversations: conversations.count ?? 0,
          escalated: escalated.count ?? 0,
        });
        setIsLoading(false);
      }
    }

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [supabase, businessId]);

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Overview</h1>
      <p className="mt-2 text-muted">
        A snapshot of how your support widget is doing.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          icon={FileText}
          label="Documents"
          value={stats.documents}
          isLoading={isLoading}
        />
        <StatTile
          icon={MessagesSquare}
          label="Conversations"
          value={stats.conversations}
          isLoading={isLoading}
        />
        <StatTile
          icon={TriangleAlert}
          label="Escalated"
          value={stats.escalated}
          isLoading={isLoading}
        />
      </div>

      <div className="mt-10">
        <EmbedSnippet />
      </div>
    </div>
  );
}
