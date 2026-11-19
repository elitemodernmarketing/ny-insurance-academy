import { content } from '@/content';
/** Optional local LLM (Ollama) client. Everything it says is labeled "AI-generated — not verified" by the UI. */

export interface Snippet { id: string; title: string; text: string }
export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }

export const NOT_COVERED = 'That is not covered in the provided course material.';

export function buildSystemPrompt(snippets: Snippet[]): string {
  const body = snippets.map((s) => `[${s.id}] ${s.title}\n${s.text}`).join('\n\n');
  return [
    `You are a study helper for the ${content.manifest.title} insurance licensing exam (New York).`,
    'Answer ONLY from the course snippets below. Do not use outside knowledge, and do not invent facts, numbers, dates or statutes.',
    `Cite the snippet id in square brackets after each claim, like [term:annuity]. If the snippets do not contain the answer, say exactly: "${NOT_COVERED}"`,
    'Use short, plain English suitable for a beginner.',
    '',
    'COURSE SNIPPETS:',
    body || '(none)',
  ].join('\n');
}

export function buildMessages(system: string, history: ChatMsg[], question: string): ChatMsg[] {
  return [{ role: 'system', content: system }, ...history.slice(-6), { role: 'user', content: question }];
}

export type OllamaErrorKind = 'network' | 'timeout' | 'model-missing' | 'http' | 'bad-response';
export class OllamaError extends Error {
  constructor(public kind: OllamaErrorKind, message: string, public status?: number) { super(message); this.name = 'OllamaError'; }
}

export const normalizeBase = (u: string) => u.trim().replace(/\/+$/, '');

async function request(url: string, init: RequestInit, timeoutMs: number, fetchImpl: typeof fetch): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctl.signal });
  } catch (e) {
    if (ctl.signal.aborted) throw new OllamaError('timeout', `No answer from ${url} within ${Math.round(timeoutMs / 1000)} seconds.`);
    throw new OllamaError('network', e instanceof Error ? e.message : 'Network error');
  } finally { clearTimeout(timer); }
}

export async function askOllama(o: { baseUrl: string; model: string; messages: ChatMsg[]; timeoutMs?: number; fetchImpl?: typeof fetch }): Promise<string> {
  const f = o.fetchImpl ?? fetch;
  const res = await request(`${normalizeBase(o.baseUrl)}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: o.model, messages: o.messages, stream: false }),
  }, o.timeoutMs ?? 120_000, f);
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()) as { error?: string }).error ?? ''; } catch { /* ignore */ }
    if (res.status === 404 || /not found/i.test(detail)) throw new OllamaError('model-missing', detail || `Model "${o.model}" was not found.`, res.status);
    throw new OllamaError('http', detail || `Ollama returned HTTP ${res.status}.`, res.status);
  }
  let data: { message?: { content?: string } };
  try { data = await res.json(); } catch { throw new OllamaError('bad-response', 'Ollama sent a reply this app could not read.'); }
  const text = data.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new OllamaError('bad-response', 'Ollama returned an empty reply.');
  return text.trim();
}

/** Names of locally installed models (GET /api/tags). Used by "Test connection". */
export async function listModels(baseUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 8000): Promise<string[]> {
  const res = await request(`${normalizeBase(baseUrl)}/api/tags`, { method: 'GET' }, timeoutMs, fetchImpl);
  if (!res.ok) throw new OllamaError('http', `Ollama returned HTTP ${res.status}.`, res.status);
  const data = (await res.json()) as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => m.name);
}

export function describeError(e: unknown, model: string, baseUrl: string): string {
  if (e instanceof OllamaError) {
    switch (e.kind) {
      case 'network': return `Could not reach Ollama at ${baseUrl}. It is probably not running, or the browser blocked the request (CORS).`;
      case 'timeout': return `${e.message} The model may still be loading; try again in a moment.`;
      case 'model-missing': return `Ollama does not have the model "${model}". Download it first.`;
      default: return e.message;
    }
  }
  return e instanceof Error ? e.message : 'Unknown error talking to Ollama.';
}

/** Citation ids the model mentioned that are actually among the provided snippets. */
export function extractCitations(reply: string, valid: string[]): string[] {
  const out: string[] = [];
  for (const m of reply.matchAll(/\[([a-z]+:[^\]\s]+)\]/g)) if (valid.includes(m[1]) && !out.includes(m[1])) out.push(m[1]);
  return out;
}
