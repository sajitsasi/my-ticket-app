export interface BootstrapUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface BootstrapResponse {
  users: BootstrapUser[];
  defaultPersonaId: string | null;
}

export async function fetchBootstrap(): Promise<BootstrapResponse> {
  const response = await fetch('/bootstrap');
  if (!response.ok) {
    throw new Error(`Bootstrap failed with status ${response.status}`);
  }
  const data = (await response.json()) as BootstrapResponse;
  return data;
}
