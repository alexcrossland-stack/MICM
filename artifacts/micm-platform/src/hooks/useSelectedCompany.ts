import { useEffect, useState } from "react";
import { useCurrentUser } from "./useAuth";

const STORAGE_KEY = "micm-selected-company-id";

function readCompanyIdFromSearch(): number | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("companyId");
  const parsed = value ? Number(value) : null;
  return parsed && Number.isFinite(parsed) ? parsed : null;
}

function readStoredCompanyId(): number | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(STORAGE_KEY);
  const parsed = value ? Number(value) : null;
  return parsed && Number.isFinite(parsed) ? parsed : null;
}

export function companyScopedPath(path: string, companyId: number | null | undefined) {
  return companyId ? `${path}?companyId=${companyId}` : path;
}

export function useSelectedCompany() {
  const { companyId, isSuperAdmin } = useCurrentUser();
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<number | null>(() =>
    readCompanyIdFromSearch() ?? readStoredCompanyId(),
  );

  useEffect(() => {
    if (!isSuperAdmin) {
      setSelectedCompanyIdState(companyId ?? null);
      return;
    }

    const searchCompanyId = readCompanyIdFromSearch();
    if (searchCompanyId) setSelectedCompanyIdState(searchCompanyId);
  }, [companyId, isSuperAdmin]);

  const setSelectedCompanyId = (nextCompanyId: number | null) => {
    setSelectedCompanyIdState(nextCompanyId);
    if (typeof window === "undefined") return;
    if (nextCompanyId) window.localStorage.setItem(STORAGE_KEY, String(nextCompanyId));
    else window.localStorage.removeItem(STORAGE_KEY);
  };

  return {
    selectedCompanyId: isSuperAdmin ? selectedCompanyId : companyId ?? null,
    targetCompanyId: isSuperAdmin ? selectedCompanyId : companyId ?? null,
    setSelectedCompanyId,
  };
}
