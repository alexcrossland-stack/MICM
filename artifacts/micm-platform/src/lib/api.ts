import axios from "axios";

const BASE_URL = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");

export const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Intercept to inject Clerk token
apiClient.interceptors.request.use(async (config) => {
  try {
    const { getToken } = await import("@clerk/react").then(m => ({ getToken: (window as any).__clerk_getToken }));
    if ((window as any).__clerk_getToken) {
      const token = await (window as any).__clerk_getToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // ignore
  }
  return config;
});

export default apiClient;
