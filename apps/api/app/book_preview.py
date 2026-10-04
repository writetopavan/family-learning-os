"""Bounded PDF input for chapter discovery; independent of search indexing."""

import base64
from io import BytesIO

from pypdf import PdfReader, PdfWriter

PREVIEW_PAGES = 20
MAX_TEXT = 80000


def book_preview(content: bytes) -> dict:
    try:
        reader = PdfReader(BytesIO(content))
        if reader.is_encrypted and not reader.decrypt(""):
            raise ValueError("Upload an unlocked PDF to extract chapters.")
        count = min(len(reader.pages), PREVIEW_PAGES)
        if not count:
            raise ValueError("The PDF has no pages.")
        pages = [reader.pages[i] for i in range(count)]
        texts = [page.extract_text() or "" for page in pages]
        # Use text when every page has a text layer. Mixed/scanned books need vision.
        if all(len(text.strip()) >= 30 for text in texts):
            text = "\n\n".join(f"[PDF page {i + 1}]\n{value}" for i, value in enumerate(texts))
            if len(text) <= MAX_TEXT:
                return {"type": "input_text", "text": text}
        writer = PdfWriter()
        for page in pages:
            writer.add_page(page)
        output = BytesIO()
        writer.write(output)
        if output.tell() > 12_000_000:
            raise ValueError("Opening pages are too large. Upload the contents pages separately.")
        return {
            "type": "input_file",
            "filename": "book-opening-pages.pdf",
            "file_data": "data:application/pdf;base64,"
            + base64.b64encode(output.getvalue()).decode(),
        }
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(
            "Could not read this PDF. Upload an unlocked PDF or its contents pages."
        ) from exc
