/**
 * Chamadas ao backend fora do modelo OData (actions, functions sem envelope, DELETE com mensagem).
 *
 * O backend responde erro de negócio como `BadRequest(string)`: o corpo JÁ É a mensagem, então
 * `responseJSON.message` seria undefined e o usuário veria só um texto genérico. Aceita também o
 * envelope OData `{ error: { message } }` e `{ message }`.
 */
export type FetchResult = { ok: boolean; data?: unknown; message?: string };

export async function readErrorMessage(response: Response): Promise<string> {
  const body = (await response.text())?.trim();
  if (!body) {
    return "";
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed === "string") {
      return parsed;
    }
    const o = parsed as { message?: string; error?: { message?: string } };
    return o?.error?.message ?? o?.message ?? body;
  } catch {
    return body;
  }
}

export async function sendJson(
  method: "GET" | "POST" | "DELETE",
  url: string,
  payload?: object
): Promise<FetchResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      const message = await readErrorMessage(response);
      return { ok: false, message: message || `Erro ${response.status} ao comunicar com o servidor.` };
    }

    const text = await response.text();
    if (!text) {
      return { ok: true, data: undefined };
    }

    try {
      return { ok: true, data: JSON.parse(text) as unknown };
    } catch {
      return { ok: true, data: text };
    }
  } catch {
    return { ok: false, message: "Não foi possível comunicar com o servidor." };
  }
}
