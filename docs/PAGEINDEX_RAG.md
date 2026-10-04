# Application-owned PageIndex retrieval

PDFs are stored privately in Supabase Storage. New PDF registration queues an application-owned index instead of uploading the file into OpenAI File Search. Existing managed documents continue to work; build a page index in Library to migrate an existing PDF. Other file formats retain their existing managed ingestion path.

## Indexing and recovery

The memory-conscious parser reads embedded text through PDFium one page at a time, closing page and text handles immediately. It detects image-only scans using object types without decoding images. Numbered section headings verify a contents-page offset and build chapter/topic ranges. PageIndex Flash remains the layout fallback for unverified PDFs up to 40 pages; larger unverified documents receive exact page nodes. Decorative/non-numbered chapter extraction can therefore be less complete. They never receive guessed chapter ranges. Page text, structure, source hash, version and progress remain persisted under family RLS.

For numbered contents lists, independent numbered section locations must agree on the printed/PDF page offset before replacing chapter roots. This repairs missed decorative headings without guessing page numbers. The uploaded 265-page Class 8 Science regression resolves all 18 chapters, including Metals and Non-metals at PDF pages 57–68.

Library advances a persisted job in leased requests: parse once, then OCR at most one scanned page per request. A failed OCR request checkpoints pages already completed. Retry resumes that version; rebuild clears old page data and increments the version. Only one request can hold a document lease. Native PDFium operations are serialized per process. An API-process semaphore admits one indexing request before downloading; other requests return persisted status for retry. Run one Uvicorn worker in a small-memory container. Navigation pauses the request loop; Resume continues it. There is no new background worker or credential to provision.

Scans with little embedded text are rendered and transcribed through the existing OpenAI Responses integration. Rendered pages and selected retrieval text therefore still reach OpenAI for model inference. OCR usage is recorded separately. Flash may fall back to page nodes for documents without detectable headings; extraction asks for clearer contents when a complete chapter structure cannot be established. A page-node fallback is not a guarantee of usable chapter/topic extraction from every scan.

## Extraction and retrieval

- **Extract chapters:** reads the complete stored tree and bounded opening pages. A verified contents tree must produce each chapter exactly once. The review/save step binds curriculum chapters to exact node IDs and index version, atomically with the plan.
- **Tutor:** narrows candidates by student, year, subject and selected chapter, then asks the model to select existing tree nodes. It reads the corresponding stored pages and supplies explicit book/page labels. Unknown node IDs and missing source pages are rejected.
- **Tests:** reads linked whole chapters when no topic subset is requested; topic requests select relevant nodes within the selected chapter tree. Question generation receives source text rather than a PDF or vector-store search tool.
- **Evidence:** page references are retained with chat answers and assessments. Rebuilt indexes invalidate previous curriculum links until chapters are extracted and confirmed again.

When a chapter is selected, retrieval resolves its saved source node or exact chapter title before model selection. An unresolved chapter never falls back to an unrelated heading. Full-document extraction enumerates structure; relevance retrieval is reserved for questions and topic selection.

## Limits and deployment

Apply `20261004101859_pageindex_rag.sql` before deploying the API and web changes. It adds RLS-protected tables, lease/checkpoint RPCs, versioned chapter links and source evidence. Functions remain security invoker and use the caller JWT; no service-role bypass is introduced.

Documents support up to 1,000 pages and 40,000 characters per stored page. A request may read up to 80,000 source characters. Oversized selections fail with a request to narrow the selection instead of silently dropping pages. Chapter preview uses at most 20 opening pages plus the complete tree. Retrieval scopes support up to 20 candidate documents. Large scans may require several resumable steps.

## Verification

Run API tests with `python -m pytest tests -q` from `apps/api`. Set `SCIENCE_TEST_PDF` to the original Class 8 Science PDF for the full textbook regression; it is not checked into the public repository. A generated one-page PDF also exercises the actual PageIndex package in CI without an API key. Mocked provider tests check invalid node rejection, exact chapter scope, stale links and partial OCR recovery.

From `apps/web`, run `npm run test:db`, `npm run build`, and `npm run test:e2e`. Database tests cover lease contention, checkpoint ownership, partial retry, atomic import rollback, cross-family/anonymous denial and student deletion. Browser checks exercise indexing before chapter preview and confirmation before subject reassignment. Paid model calls require deployment credentials and are not claimed as local integration verification.


## Small-container validation

The uploaded 33.6 MB, 265-page Science PDF processed in 0.64 seconds with 91.3 MiB peak process RSS in a standalone Python run. All 18 chapters were verified, including PDF pages 57–68 for Metals and Non-metals and page 170 for Sound. This includes source bytes and the parser but excludes the API runtime, network buffering, persistence, and paid OCR. It is not a guarantee for arbitrary PDFs or measured Cloud Run performance. No CPU/RAM increase or new schema migration is required. OCR keeps the existing lease/checkpoint/retry protocol.

A second local measurement loaded the FastAPI application first: peak RSS was 119.1 MiB and parsing took 0.63 seconds. All 45 API tests passed, including the actual uploaded PDF, bounded OCR rendering, lease/retry behavior, and admission control. These are local results, not production measurements.
