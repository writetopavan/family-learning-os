"""Bounded text-only PDF opening pages; never render images or invoke OCR."""

import pypdfium2 as pdfium

from .document_index import PDFIUM_LOCK

PREVIEW_PAGES = 20
MAX_TEXT = 80000


def book_preview(content: bytes) -> dict:
    try:
        chunks = []
        size = 0
        with PDFIUM_LOCK, pdfium.PdfDocument(content) as document:
            for number in range(min(len(document), PREVIEW_PAGES)):
                page = document[number]
                text_page = None
                try:
                    text_page = page.get_textpage()
                    if text_page.count_chars() > MAX_TEXT:
                        raise ValueError(
                            "Opening pages contain too much text. Upload the contents pages separately."
                        )
                    text = text_page.get_text_range()
                finally:
                    if text_page is not None:
                        text_page.close()
                    page.close()
                if text.strip():
                    chunk = f"[PDF page {number + 1}]\n{text}"
                    size += len(chunk) + 2
                    if size > MAX_TEXT:
                        raise ValueError(
                            "Opening pages contain too much text. Upload the contents pages separately."
                        )
                    chunks.append(chunk)
        if not chunks:
            raise ValueError(
                "Opening pages have no extractable text. Image processing and OCR are disabled."
            )
        return {"type": "input_text", "text": "\n\n".join(chunks)}
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(
            "Could not read this PDF. Upload an unlocked PDF or its contents pages."
        ) from exc
