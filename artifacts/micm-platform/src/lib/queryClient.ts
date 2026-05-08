import { QueryClient } from "@tanstack/react-query";
import axios from "axios";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.response?.status === 401 || error?.response?.status === 403) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
    },
  },
});

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

export function getApiUrl(path: string) {
  return `${BASE}/api${path}`;
}

// Orval custom instance - Clerk token injected via header
let _getToken: (() => Promise<string | null>) | null = null;

export function setTokenFn(fn: () => Promise<string | null>) {
  _getToken = fn;
}

export const customInstance = async <T>({
  url,
  method,
  params,
  data,
  headers,
}: {
  url: string;
  method: string;
  params?: Record<string, unknown>;
  data?: unknown;
  headers?: Record<string, string>;
}): Promise<T> => {
  const token = _getToken ? await _getToken() : null;
  const response = await axios.request<T>({
    url: `${BASE}/api${url}`,
    method,
    params,
    data,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    withCredentials: true,
  });
  return response.data;
};
