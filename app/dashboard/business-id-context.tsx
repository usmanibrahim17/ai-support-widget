"use client";

import { createContext, useContext } from "react";

const BusinessIdContext = createContext<string | null>(null);

export function BusinessIdProvider({
  businessId,
  children,
}: {
  businessId: string;
  children: React.ReactNode;
}) {
  return (
    <BusinessIdContext.Provider value={businessId}>
      {children}
    </BusinessIdContext.Provider>
  );
}

export function useBusinessId(): string {
  const value = useContext(BusinessIdContext);
  if (!value) {
    throw new Error("useBusinessId must be used within a BusinessIdProvider");
  }
  return value;
}
