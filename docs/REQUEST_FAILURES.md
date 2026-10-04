# Diagnosing generation failures

A browser's “Failed to fetch” does not identify a retrieval failure. It can mean a lost connection, a platform timeout, or a backend exception whose response lacks CORS headers.

The API's request diagnostics run inside CORS. Unexpected application exceptions return a JSON error with a reference, and the response includes `X-Request-ID`. Connection failures return 503, upstream timeouts 504, rejected upstream requests 502 (401/403 access errors remain 401/403), and unexpected application failures 500. Expected FastAPI errors retain their normal status. OpenAI transport failures become handled AI-service errors. The browser distinguishes its own request timeout, a failed connection, and intentional caller cancellation. Requests are never automatically retried: a result may have been saved before a connection or usage-recording failure.

The API emits `request_started`, `request_failed`, and `request_finished` JSON messages through the existing Uvicorn logger. Finished requests include duration and status. Failed requests include the exception class and code-frame locations; upstream HTTP errors include status and hostname. Search the Cloud Run service logs for the reference shown in the error to correlate these events. These application references are separate from Google's trace IDs. Uvicorn may prefix the JSON message, so inspect the log's text payload too.

Request bodies, bearer tokens, headers, query strings, provider response bodies and exception messages are excluded from these records. Standard hosting logs may still contain their own platform request metadata. This does not add an external logging service.

A process termination, platform-generated error or failure before the request reaches the API cannot be caught by application middleware. In that case inspect Cloud Run platform logs and the browser's failed request status and duration. Healthy indexes and successful earlier generations do not establish the cause of an individual failed request.

Checks: run the API tests from `apps/api`, and run `npm run test:api` from `apps/web`. Both run in CI. The diagnostics regression reproduces the former missing-CORS 500 response and verifies readable, correlated, redacted failures; browser-client checks cover connection errors, timeout, caller cancellation, server references and expired sessions.
