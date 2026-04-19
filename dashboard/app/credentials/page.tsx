"use client";

import { FC, useState } from "react";
import { CredentialForm } from "../../components/CredentialForm";
import { CredentialList } from "../../components/CredentialList";

const CredentialsPage: FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  function handleFormSuccess() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <CredentialForm onSuccess={handleFormSuccess} />
      </div>
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <CredentialList refreshKey={refreshKey} />
      </div>
    </div>
  );
};

export default CredentialsPage;
