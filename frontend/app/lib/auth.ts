export type Role = "franqueado" | "atendente" | "admin";

const isBrowser = typeof window !== "undefined";

export function getToken(): string | null {
  return isBrowser ? localStorage.getItem("chamados_token") : null;
}

export function getName(): string {
  return (isBrowser && localStorage.getItem("chamados_name")) || "";
}

export function getUsername(): string {
  return (isBrowser && localStorage.getItem("chamados_username")) || "";
}

export function getRole(): Role {
  return (isBrowser && (localStorage.getItem("chamados_role") as Role)) || "franqueado";
}

export function isStaff(): boolean {
  const role = getRole();
  return role === "atendente" || role === "admin";
}

export function isAdmin(): boolean {
  return getRole() === "admin";
}

export function logout(): void {
  if (!isBrowser) return;
  localStorage.removeItem("chamados_token");
  localStorage.removeItem("chamados_name");
  localStorage.removeItem("chamados_role");
  localStorage.removeItem("chamados_username");
}
