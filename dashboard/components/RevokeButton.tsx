"use client";

import { FC, useState } from "react";
import { wardenApi } from "../lib/api";

interface RevokeButtonProps {
  capabilityId: string;
  onRevoked: (id: string) => void;
}

export const RevokeButton: FC<RevokeButtonProps> = ({
  capabilityId,
  onRevoked,
}) => {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("Manual revocation");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFirstClick = () => {
    setConfirming(true);
    setError(null);
  };

  const handleCancel = () => {
    setConfirming(false);
    setReason("Manual revocation");
    setError(null);
  };

  const handleRevoke = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await wardenApi.fetchJson(
        `/api/capabilities/${encodeURIComponent(capabilityId)}/revoke`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        }
      );
      onRevoked(capabilityId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Revocation failed"
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={handleFirstClick}
        className="rounded bg-red-700 px-2 py-1 text-xs font-medium text-red-100 hover:bg-red-600 transition-colors"
      >
        Revoke
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for revocation"
        className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:border-red-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={handleRevoke}
        disabled={submitting}
        className="rounded bg-red-700 px-2 py-1 text-xs font-medium text-red-100 hover:bg-red-600 transition-colors disabled:opacity-50"
      >
        {submitting ? "Revoking..." : "Confirm"}
      </button>
      <button
        type="button"
        onClick={handleCancel}
        className="rounded bg-gray-700 px-2 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600 transition-colors"
      >
        Cancel
      </button>
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
};

export default RevokeButton;
