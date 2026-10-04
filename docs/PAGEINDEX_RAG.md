# Application-owned document tree retrieval

PDFs are stored privately in Supabase Storage. New PDFs queue an application-owned text index. No PDF page is rendered, transcribed, or sent to a model during indexing. Only PDFs with directly extractable text are supported. Pages without extractable text (including image-only covers and blank pages) are skipped and listed in the Library UI. Original PDF page numbers are preserved; skipped pages retain an explicit missing-content marker for retrieval. Any selectable text on mixed pages is kept, even short captions; their images are not extracted. PDFs with no selectable text anywhere still fail clearly.

## Low-memory indexing

PDFium reads embedded text one page at a time and closes native page/text handles immediately. Image objects are not inspected, decoded or rendered. Numbered section headings independently verify the contents-page offset and establish chapter/topic ranges. Documents without verified numbered contents receive exact page nodes rather than guessed chapter boundaries. Decorative/non-numbered chapter detection is less complete than the previous Flash layout parser. The PageIndex package and rendering path are removed; the application-owned tree and retrieval concept remain.

One indexing request is admitted per API process before download and lease acquisition. Other requests return persisted status for the browser to retry. Run one Uvicorn worker in small-memory containers. Parsing runs inside an active HTTP request, not a background task. Text, tree, hash, version and progress are persisted under existing family RLS. Indexing still checkpoints after the text pass; it does not save every page individually. Navigation pauses the browser request loop; Resume continues it.

Old jobs awaiting OCR are reparsed with the same text-only policy on Resume/Retry. Their image-only pages are skipped, with no rendering or model call. Entirely scanned documents still fail with a selectable-text message. Existing ready indexes and chapter links are unchanged until rebuilt.

## Extraction and retrieval

Chapter preview reads the complete tree and up to 20 opening pages. A verified contents tree must produce every chapter once. Confirmation binds chapters to exact node IDs and index version. Tutor and test generation select chapter/topic nodes and read their stored page ranges. Unknown nodes, incomplete source pages, stale links and oversized reading selections are rejected. Source page references remain attached to generated content.

Text extraction/indexing makes no paid model calls. Chapter identification, tutor answers and test generation still use the existing LLM integration and incur normal model costs.

## Deployment and limits

This change requires no new database migration. The original `20261004101859_pageindex_rag.sql` must already be installed. The database retains its historical `ocr` stage/origin values for compatibility; API code no longer performs OCR. Documents support up to 1,000 pages and 40,000 characters per page. Retrieval reads at most 80,000 source characters and 20 candidate documents.

## Validation

All 53 API tests passed, including image-only-cover skipping without renumbering, short mixed-page caption preservation, entirely scanned/empty PDF rejection, legacy-job recovery without a model, persisted skipped-page notices, admission control, preservation of material deletion and the uploaded Science PDF. The original 33.6 MB, 265-page Science PDF has directly extractable text on all pages. All 18 chapters were verified, including Metals and Non-metals at PDF pages 57–68 and Sound at PDF page 170.

Earlier local measurements of the same low-memory text pass were 0.64 seconds and 91.3 MiB peak standalone RSS; with API modules loaded, 0.63 seconds and 119.1 MiB. These exclude source download, database writes and production concurrency; they are not Cloud Run measurements or guarantees for arbitrary PDFs.

Run `python -m pytest tests -q` from `apps/api`. Set `SCIENCE_TEST_PDF` to the original Science PDF for the full regression. The textbook is not included in this public repository.
