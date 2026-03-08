// Maps routes to their dynamic import functions for prefetching
const routeImports: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/Index"),
  "/auth": () => import("@/pages/Auth"),
  "/forgot-password": () => import("@/pages/ForgotPassword"),
  "/reset-password": () => import("@/pages/ResetPassword"),
  "/settings": () => import("@/pages/Settings"),
  "/messages": () => import("@/pages/Messages"),
};

const prefetched = new Set<string>();

export function prefetchRoute(path: string) {
  const normalized = path.split("?")[0].split("#")[0];
  if (prefetched.has(normalized)) return;
  const loader = routeImports[normalized];
  if (loader) {
    prefetched.add(normalized);
    loader();
  }
}
