'use client';

import { useEffect, useRef, useState } from 'react';
import { apiJson } from '@/lib/api';
import { buildDocumentIndex, DocumentIndex, DocumentNode } from '@/lib/document-index';

function TreeNodes({ nodes }: { nodes: DocumentNode[] }) {
  return <ul>{nodes.map(node => <li key={node.node_id}>
    {node.nodes?.length ? <details><summary>{node.title} · PDF pp. {node.start_index}–{node.end_index}</summary><TreeNodes nodes={node.nodes} /></details>
      : <span>{node.title} · PDF pp. {node.start_index}–{node.end_index}</span>}
  </li>)}</ul>;
}

export default function DocumentIndexStatus({ materialId, materialStatus, onReady }: { materialId: string; materialStatus: string; onReady: () => Promise<void> }) {
  const [job, setJob] = useState<DocumentIndex | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void apiJson<DocumentIndex | null>(`/v1/materials/${materialId}/index`, { signal: abort.signal })
      .then(setJob).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => { abort.abort(); controller.current?.abort(); };
  }, [materialId, materialStatus]);
  async function run(rebuild = false) {
    if (busy) return;
    setBusy(true); setError('');
    controller.current = new AbortController();
    try {
      await buildDocumentIndex(materialId, setJob, controller.current.signal, rebuild);
      await onReady();
    } catch (e) {
      if (!controller.current.signal.aborted) setError(e instanceof Error ? e.message : 'Indexing failed');
    } finally { setBusy(false); }
  }
  return <div className="document-index" aria-label="Document page index">
    {job && <p role="status">{job.status === 'ready' ? `Page index ready · ${job.page_count} pages` : `Page indexing: ${job.completed_pages}/${job.page_count || '?'} pages · ${job.status}`}</p>}
    {busy && <progress max={job?.page_count || 1} value={job?.completed_pages || 0} aria-label="Indexing progress" />}
    {(error || job?.error_message) && <p role="alert">{error || job?.error_message}</p>}
    <button className="text-button" disabled={busy} onClick={() => void run(job?.status === 'ready')}>
      {busy ? 'Indexing…' : job?.status === 'ready' ? 'Rebuild page index' : job?.status === 'failed' ? 'Retry page indexing' : job ? 'Resume page indexing' : 'Build page index'}
    </button>
    {job?.status === 'ready' && <details><summary>View document structure</summary><TreeNodes nodes={job.tree} /></details>}
  </div>;
}
