"use client";

import { Mail, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useBusinessId } from "../business-id-context";
import { createClient } from "@/lib/supabase/client";

const LOG_LIMIT = 50;

type ChatLogRow = {
  id: string;
  question: string;
  answer: string;
  was_escalated: boolean;
  created_at: string;
  visitor_email?: string | null;
};

type Filter = "all" | "escalated";

export default function ChatLogsView() {
  const businessId = useBusinessId();
  const supabase = createClient();

  const [filter, setFilter] = useState<Filter>("all");
  const [logs, setLogs] = useState<ChatLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = useCallback(
    async (activeFilter: Filter) => {
      setIsLoading(true);
      setError("");

      let query = supabase
        .from("chat_logs")
        .select("id, question, answer, was_escalated, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(LOG_LIMIT);

      if (activeFilter === "escalated") {
        query = query.eq("was_escalated", true);
      }

      const { data, error: logsError } = await query;

      if (logsError) {
        setError(logsError.message);
        setIsLoading(false);
        return;
      }

      const rows = data ?? [];
      const escalatedIds = rows
        .filter((row) => row.was_escalated)
        .map((row) => row.id);

      if (escalatedIds.length === 0) {
        setLogs(rows);
        setIsLoading(false);
        return;
      }

      const { data: escalations, error: escalationsError } = await supabase
        .from("escalations")
        .select("chat_log_id, visitor_email")
        .in("chat_log_id", escalatedIds);

      if (escalationsError) {
        // Non-fatal — still show the logs, just without captured emails.
        setLogs(rows);
        setIsLoading(false);
        return;
      }

      const emailByLogId = new Map(
        (escalations ?? []).map((row) => [row.chat_log_id, row.visitor_email])
      );

      setLogs(
        rows.map((row) => ({
          ...row,
          visitor_email: emailByLogId.get(row.id) ?? null,
        }))
      );
      setIsLoading(false);
    },
    [supabase, businessId]
  );

  useEffect(() => {
    loadLogs(filter);
  }, [loadLogs, filter]);

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Chat Logs</h1>
      <p className="mt-2 text-muted">
        Showing the most recent {LOG_LIMIT} conversations.
      </p>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
            filter === "all"
              ? "bg-primary text-white"
              : "border border-line text-ink hover:border-primary"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setFilter("escalated")}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
            filter === "escalated"
              ? "bg-primary text-white"
              : "border border-line text-ink hover:border-primary"
          }`}
        >
          Escalated / Unanswered only
        </button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : logs.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface px-4 py-6 text-sm text-muted">
            {filter === "escalated"
              ? "No escalated or unanswered questions yet."
              : "No conversations yet — once your widget is live, visitor questions will show up here."}
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {logs.map((log) => (
              <li key={log.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-ink">
                    {log.question}
                  </p>
                  {log.was_escalated ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-danger/30 bg-danger-light px-2 py-0.5 text-xs font-medium text-danger-dark">
                      <TriangleAlert size={12} />
                      Escalated
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted">{log.answer}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{new Date(log.created_at).toLocaleString()}</span>
                  {log.was_escalated ? (
                    <span className="flex items-center gap-1">
                      <Mail size={12} />
                      {log.visitor_email ? (
                        <span className="font-medium text-ink">
                          {log.visitor_email}
                        </span>
                      ) : (
                        "not captured"
                      )}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
