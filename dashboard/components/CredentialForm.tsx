"use client";

import { FC, FormEvent, useState } from "react";
import { wardenApi } from "../lib/api";

const SCOPE_PRESETS: Record<string, object> = {
  github: {
    repos: ["owner/repo"],
    permissions: ["contents:read", "issues:write"],
  },
  openai: {
    models: ["gpt-4o"],
    maxTokensPerRequest: 4096,
    rateLimit: 100,
  },
};

interface CredentialFormProps {
  onSuccess: () => void;
}

export const CredentialForm: FC<CredentialFormProps> = ({ onSuccess }) => {
  const [name, setName] = useState("");
  const [type, setType] = useState("github");
  const [value, setValue] = useState("");
  const [scopeCeiling, setScopeCeiling] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);

  function validateScopeJson(json: string): boolean {
    if (!json.trim()) {
      setScopeError(null);
      return true;
    }
    try {
      JSON.parse(json);
      setScopeError(null);
      return true;
    } catch {
      setScopeError("Invalid JSON");
      return false;
    }
  }

  function handleQuickFill(preset: string) {
    const json = JSON.stringify(SCOPE_PRESETS[preset], null, 2);
    setScopeCeiling(json);
    setScopeError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !value) {
      setError("Name and value are required.");
      return;
    }

    if (scopeCeiling.trim() && !validateScopeJson(scopeCeiling)) {
      return;
    }

    setSubmitting(true);
    try {
      await wardenApi.fetchJson("/api/credentials", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          type,
          value,
          scopeCeiling: scopeCeiling.trim()
            ? JSON.parse(scopeCeiling)
            : undefined,
        }),
      });

      setValue("");
      setName("");
      setScopeCeiling("");
      setError(null);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register credential");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Register Credential</h2>

      {error && (
        <div className="rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm text-gray-400">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          placeholder="my-github-token"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          <option value="github">GitHub</option>
          <option value="openai">OpenAI</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Value</label>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          placeholder="ghp_xxxx..."
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">
          Scope Ceiling (JSON)
        </label>
        <textarea
          value={scopeCeiling}
          onChange={(e) => {
            setScopeCeiling(e.target.value);
            if (scopeError) validateScopeJson(e.target.value);
          }}
          rows={5}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          placeholder='{"repos": ["owner/repo"], ...}'
        />
        {scopeError && (
          <p className="mt-1 text-xs text-red-400">{scopeError}</p>
        )}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => validateScopeJson(scopeCeiling)}
            className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
          >
            Validate
          </button>
          <button
            type="button"
            onClick={() => handleQuickFill("github")}
            className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
          >
            Quick-fill: GitHub
          </button>
          <button
            type="button"
            onClick={() => handleQuickFill("openai")}
            className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
          >
            Quick-fill: OpenAI
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {submitting ? "Registering…" : "Register Credential"}
      </button>
    </form>
  );
};

export default CredentialForm;
