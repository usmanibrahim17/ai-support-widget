"use client";

import { CircleAlert, Link2, Type } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { useBusinessId } from "./business-id-context";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type DocumentRow = {
  id: string;
  title: string;
  source_type: string;
  created_at: string;
};

type Stage = "idle" | "uploading" | "processing";

type StatusMessage = {
  type: "success" | "error";
  text: string;
};

function SourceIcon({ sourceType }: { sourceType: string }) {
  if (sourceType === "url") {
    return <Link2 size={15} className="text-muted" />;
  }
  return <Type size={15} className="text-muted" />;
}

export default function DocumentManager() {
  const businessId = useBusinessId();
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [urlContent, setUrlContent] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [documentsError, setDocumentsError] = useState("");

  const loadDocuments = useCallback(async () => {
    setIsLoadingDocuments(true);
    setDocumentsError("");

    const { data, error } = await supabase
      .from("documents")
      .select("id, title, source_type, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) {
      setDocumentsError(error.message);
    } else {
      setDocuments(data ?? []);
    }
    setIsLoadingDocuments(false);
  }, [supabase, businessId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);

    const trimmedTitle = title.trim();
    const trimmedUrl = urlContent.trim();
    const trimmedText = textContent.trim();

    if (!trimmedTitle) {
      setStatusMessage({ type: "error", text: "Title is required" });
      return;
    }

    if (!trimmedUrl && !trimmedText) {
      setStatusMessage({
        type: "error",
        text: "Provide either text content or a URL to scrape",
      });
      return;
    }

    if (!API_URL) {
      setStatusMessage({
        type: "error",
        text: "NEXT_PUBLIC_API_URL is not configured",
      });
      return;
    }

    const sourceType = trimmedUrl ? "url" : "text";
    const content = trimmedUrl || trimmedText;

    try {
      setStage("uploading");
      const uploadResponse = await fetch(`${API_URL}/api/py/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          source_type: sourceType,
          content,
          title: trimmedTitle,
        }),
      });
      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok || uploadData.status === "error") {
        throw new Error(uploadData.message || "Upload failed");
      }

      const documentId = uploadData.id;

      setStage("processing");
      const processResponse = await fetch(
        `${API_URL}/api/py/process/${documentId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ business_id: businessId }),
        }
      );
      const processData = await processResponse.json();

      if (!processResponse.ok || processData.status === "error") {
        throw new Error(processData.message || "Processing failed");
      }

      setStatusMessage({
        type: "success",
        text: `Uploaded and processed — ${processData.chunks_created} chunks created`,
      });
      setTitle("");
      setTextContent("");
      setUrlContent("");
      await loadDocuments();
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Something went wrong",
      });
    } finally {
      setStage("idle");
    }
  }

  const isSubmitting = stage !== "idle";
  const submitLabel =
    stage === "uploading"
      ? "Uploading..."
      : stage === "processing"
        ? "Processing..."
        : "Upload document";

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Documents</h1>
      <p className="mt-2 text-muted">
        Content your assistant can answer questions from.
      </p>

      <div className="mt-8 max-w-xl rounded-lg border border-line bg-surface p-6">
        <h2 className="font-display text-lg text-ink">Add a document</h2>

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="doc-title"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Title
            </label>
            <input
              id="doc-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-primary"
            />
          </div>

          <div>
            <label
              htmlFor="doc-text"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Paste text content
            </label>
            <textarea
              id="doc-text"
              rows={6}
              value={textContent}
              onChange={(event) => setTextContent(event.target.value)}
              placeholder="Paste FAQ or support content here..."
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-3 text-xs font-medium text-muted">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>

          <div>
            <label
              htmlFor="doc-url"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              URL to scrape
            </label>
            <input
              id="doc-url"
              type="url"
              value={urlContent}
              onChange={(event) => setUrlContent(event.target.value)}
              placeholder="https://example.com/faq"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-primary"
            />
          </div>

          {statusMessage ? (
            <p
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                statusMessage.type === "success"
                  ? "border-primary/25 bg-primary/5 text-primary-dark"
                  : "border-danger/30 bg-danger-light text-danger-dark"
              }`}
            >
              {statusMessage.type === "error" ? (
                <CircleAlert size={15} className="shrink-0" />
              ) : null}
              {statusMessage.text}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </form>
      </div>

      <div className="mt-8">
        <h2 className="font-display text-lg text-ink">Uploaded documents</h2>

        {isLoadingDocuments ? (
          <p className="mt-3 text-sm text-muted">Loading...</p>
        ) : documentsError ? (
          <p className="mt-3 text-sm text-danger">{documentsError}</p>
        ) : documents.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No documents yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex items-center gap-3 px-4 py-3.5"
              >
                <SourceIcon sourceType={document.source_type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {document.title}
                  </p>
                  <p className="text-xs text-muted">
                    {document.source_type} ·{" "}
                    {new Date(document.created_at).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
