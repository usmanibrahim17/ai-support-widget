"use client";

import { Check, CircleAlert } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { useBusinessId } from "./business-id-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const TONE_OPTIONS = [
  "neutral and helpful",
  "warm and friendly",
  "professional and concise",
  "playful and casual",
];

type StatusMessage = {
  type: "success" | "error";
  text: string;
};

export default function BusinessProfile() {
  const businessId = useBusinessId();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState(TONE_OPTIONS[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);

  useEffect(() => {
    if (!API_URL) {
      setIsLoading(false);
      setStatusMessage({
        type: "error",
        text: "NEXT_PUBLIC_API_URL is not configured",
      });
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      try {
        const response = await fetch(
          `${API_URL}/api/py/business-profile/${businessId}`
        );
        const data = await response.json();

        if (!response.ok || data.status === "error") {
          throw new Error(data.message || "Failed to load business profile");
        }

        if (!cancelled) {
          setName(data.name || "");
          setDescription(data.description || "");
          setTone(data.tone || TONE_OPTIONS[0]);
        }
      } catch (error) {
        if (!cancelled) {
          setStatusMessage({
            type: "error",
            text:
              error instanceof Error
                ? error.message
                : "Failed to load business profile",
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);

    if (!API_URL) {
      setStatusMessage({
        type: "error",
        text: "NEXT_PUBLIC_API_URL is not configured",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/py/business-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          name,
          description,
          tone,
        }),
      });
      const data = await response.json();

      if (!response.ok || data.status === "error") {
        throw new Error(data.message || "Failed to save business profile");
      }

      setStatusMessage({ type: "success", text: "Business profile saved" });
    } catch (error) {
      setStatusMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save business profile",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Business Profile</h1>
      <p className="mt-2 text-muted">
        This shapes how your assistant introduces and describes your business
        to visitors.
      </p>

      <div className="mt-8 max-w-xl rounded-lg border border-line bg-surface p-6">
        {isLoading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="business-name"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                Name
              </label>
              <input
                id="business-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-primary"
              />
            </div>

            <div>
              <label
                htmlFor="business-description"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                Description
              </label>
              <textarea
                id="business-description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What does your business do?"
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-primary"
              />
            </div>

            <div>
              <label
                htmlFor="business-tone"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                Tone
              </label>
              <select
                id="business-tone"
                value={tone}
                onChange={(event) => setTone(event.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-primary"
              >
                {TONE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {statusMessage ? (
              <p
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  statusMessage.type === "success"
                    ? "border-primary/25 bg-primary/5 text-primary-dark"
                    : "border-danger/30 bg-danger-light text-danger-dark"
                }`}
              >
                {statusMessage.type === "success" ? (
                  <Check size={15} />
                ) : (
                  <CircleAlert size={15} />
                )}
                {statusMessage.text}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
