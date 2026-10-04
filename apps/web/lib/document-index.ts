import { apiJson } from './api';

export type DocumentNode = { node_id: string; title: string; start_index: number; end_index: number; nodes?: DocumentNode[] };
export type DocumentIndex = { material_id: string; status: 'queued' | 'running' | 'ready' | 'failed'; stage: string; version: number; page_count: number; completed_pages: number; error_message: string | null; contents_verified: boolean; tree: DocumentNode[]; skipped_pages?: number[] };

export async function buildDocumentIndex(id: string, onProgress: (job: DocumentIndex) => void, signal?: AbortSignal, rebuild = false): Promise<DocumentIndex> {
  let job = await apiJson<DocumentIndex>(`/v1/materials/${id}/index`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rebuild }), signal });
  onProgress(job);
  while (job.status !== 'ready') {
    if (signal?.aborted) throw new DOMException('Indexing paused', 'AbortError');
    if (job.status === 'failed') throw new Error(job.error_message || 'Indexing failed. Retry to resume.');
    job = await apiJson<DocumentIndex>(`/v1/materials/${id}/index/advance`, { method: 'POST', signal });
    onProgress(job);
    if (job.status === 'running') await new Promise<void>((resolve, reject) => {
      const abort = () => { window.clearTimeout(timer); reject(new DOMException('Indexing paused', 'AbortError')); };
      const timer = window.setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 2000);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
  return job;
}
