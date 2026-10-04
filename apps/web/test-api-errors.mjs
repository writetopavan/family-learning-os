import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.test';
let timeoutCallback;
let session = { access_token: 'test-token' };
globalThis.window = {
  setTimeout(callback) { timeoutCallback = callback; return 1; },
  clearTimeout() {},
};
const output = ts.transpileModule(fs.readFileSync(new URL('./lib/api.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = { exports: {} };
const mockedRequire = (name) => name === '@/lib/supabase-browser'
  ? { createSupabaseBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session } }) } }) }
  : require(name);
new Function('require', 'module', 'exports', output)(mockedRequire, compiled, compiled.exports);
const { apiFetch, apiJson } = compiled.exports;

globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
await assert.rejects(() => apiFetch('/test'), /Could not reach the learning API/);

globalThis.fetch = async () => { timeoutCallback(); throw new DOMException('aborted', 'AbortError'); };
await assert.rejects(() => apiFetch('/test'), /request took too long/);

const cancelled = new AbortController();
cancelled.abort();
const abortError = new DOMException('cancelled by caller', 'AbortError');
globalThis.fetch = async () => { throw abortError; };
await assert.rejects(() => apiFetch('/test', { signal: cancelled.signal }), (error) => error === abortError);

globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'A required service timed out. Reference: request123' }), { status: 504 });
await assert.rejects(() => apiJson('/test'), /Reference: request123/);

globalThis.fetch = async () => new Response(JSON.stringify({ detail: "The AI service timed out." }), { status: 503, headers: { "X-Request-ID": "handled123" } });
await assert.rejects(() => apiJson("/test"), /Reference: handled123/);

session = null;
await assert.rejects(() => apiFetch('/test'), /session has expired/);
console.log('API error handling checks passed: connection, timeout, cancellation, server reference, expired session');
