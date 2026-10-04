"""Application-owned PageIndex tree, page text, and bounded retrieval helpers."""

import base64
import hashlib
import re
from collections import Counter
from io import BytesIO
from threading import Lock

from pypdf import PdfReader

PDFIUM_LOCK = Lock()
MAX_PAGES = 1000
MAX_PAGE_CHARS = 40000


def flatten(nodes):
    for node in nodes:
        yield node
        yield from flatten(node.get("nodes", []))


def numbered_contents(pages):
    entries = []
    for page in pages[:30]:
        text = page["text"]
        if len(re.findall(r"Chapter\s+\d+", text)) < 3:
            continue
        parts = re.split(r"Chapter\s+(\d+)\s*", text)
        for i in range(1, len(parts), 2):
            segment = parts[i + 1]
            # The first standalone page number after a chapter heading is its printed page.
            match = re.search(r"^(.*?)\s+(\d{1,4})(?:\s|$)", segment, re.S)
            if match:
                title = " ".join(match[1].split())
                if title:
                    entries.append((int(parts[i]), title, int(match[2])))
    if len(entries) < 3 or [e[0] for e in entries] != list(range(1, len(entries) + 1)):
        return []
    if any(b[2] <= a[2] for a, b in zip(entries, entries[1:])):
        return []
    return entries


def reconcile_contents(tree, pages):
    """Use independent numbered section locations to verify printed/PDF page offset."""
    entries = numbered_contents(pages)
    sections = {}
    for node in flatten(tree):
        match = re.match(r"\s*(\d+)\.\d+\b", node["title"])
        if match:
            number = int(match[1])
            sections[number] = min(sections.get(number, MAX_PAGES + 1), node["start_index"])
    offsets = [sections[n] - printed for n, _, printed in entries if n in sections]
    if len(offsets) < 3:
        return tree, False
    offset, votes = Counter(offsets).most_common(1)[0]
    if votes / len(offsets) < 0.7:
        return tree, False
    roots = []
    for i, (number, title, printed) in enumerate(entries):
        start = printed + offset
        end = entries[i + 1][2] + offset - 1 if i + 1 < len(entries) else len(pages)
        if not 1 <= start <= end <= len(pages):
            return tree, False
        # Pull section nodes from the full tree, including sections under a missed root.
        children = []
        seen = set()
        for node in flatten(tree):
            if (
                re.match(rf"\s*{number}\.\d+\b", node["title"])
                and start <= node["start_index"] <= end
            ):
                title_key = node["title"].strip()
                if title_key in seen:
                    continue
                seen.add(title_key)
                children.append({**node, "nodes": [], "end_index": min(node["end_index"], end)})
        roots.append(
            {
                "node_id": f"chapter-{number}",
                "title": title,
                "kind": "chapter",
                "start_index": start,
                "end_index": end,
                "nodes": children,
            }
        )
    return roots, True


def validate_tree(tree, page_count):
    seen = set()
    for node in flatten(tree):
        if not node.get("node_id") or node["node_id"] in seen:
            raise ValueError("Document tree contains duplicate or missing node IDs.")
        seen.add(node["node_id"])
        if not 1 <= node["start_index"] <= node["end_index"] <= page_count:
            raise ValueError("Document tree contains invalid page ranges.")
    if not seen:
        raise ValueError("Document has no readable structure.")


def parse_pdf(content):
    from pageindex.flash import page_index_flash

    reader = PdfReader(BytesIO(content))
    if reader.is_encrypted and not reader.decrypt(""):
        raise ValueError("Upload an unlocked PDF.")
    if not 1 <= len(reader.pages) <= MAX_PAGES:
        raise ValueError(f"Use a PDF containing 1–{MAX_PAGES} pages.")
    pages = []
    for number, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ""
        if len(text) > MAX_PAGE_CHARS:
            raise ValueError(f"PDF page {number} is too dense; split the document.")
        pending = len(text.strip()) < 30 and len(page.images) > 0
        pages.append(
            {
                "page_number": number,
                "text": text,
                "origin": "pending" if pending else "text" if text.strip() else "blank",
            }
        )
    # PDFium is not thread safe; serialize native parsing/rendering within each process.
    with PDFIUM_LOCK:
        result = page_index_flash(BytesIO(content), summary=False, optimize=False)
    tree = result.get("structure") or []
    if not tree:
        tree = [
            {
                "node_id": f"page-{p['page_number']}",
                "title": f"Page {p['page_number']}",
                "start_index": p["page_number"],
                "end_index": p["page_number"],
            }
            for p in pages
        ]
    tree, verified = reconcile_contents(tree, pages)
    validate_tree(tree, len(pages))
    return {
        "tree": tree,
        "pages": pages,
        "page_count": len(pages),
        "contents_verified": verified,
        "content_hash": hashlib.sha256(content).hexdigest(),
        "engine": "pageindex-flash-0.2.10",
    }


def page_image(content, number):
    import pypdfium2 as pdfium

    with PDFIUM_LOCK, pdfium.PdfDocument(content) as doc:
        page = doc[number - 1]
        bitmap = page.render(scale=min(1.5, 1200 / max(page.get_width(), page.get_height())))
        image = bitmap.to_pil()
        out = BytesIO()
        image.convert("RGB").save(out, format="JPEG", quality=80)
        bitmap.close()
        page.close()
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()


def words(text):
    return set(re.findall(r"\w+", text.casefold()))


def select_nodes(tree, query, chapter_titles=(), source_nodes=()):
    nodes = list(flatten(tree))
    if source_nodes:
        selected = [n for n in nodes if n["node_id"] in source_nodes]
        if len(selected) != len(set(source_nodes)):
            raise ValueError("Chapter index changed. Extract and confirm the book again.")
        return selected
    if chapter_titles:
        selected = [
            n
            for n in nodes
            if re.sub(r"\W+", "", n["title"]).casefold()
            in {re.sub(r"\W+", "", t).casefold() for t in chapter_titles}
        ]
        expected = {re.sub(r"\W+", "", t).casefold() for t in chapter_titles}
        matched = {re.sub(r"\W+", "", n["title"]).casefold() for n in selected}
        if matched != expected:
            raise ValueError(
                "Chapter is not linked to this index. Extract and confirm the book again."
            )
        return selected
    terms = words(query)
    scored = sorted(nodes, key=lambda n: len(words(n["title"]) & terms), reverse=True)
    # A bounded lexical shortlist is a fallback; the API's LLM chooses nodes from the tree.
    return scored[:8]


def source_context(material, pages, numbers, max_chars=80000):
    selected = [p for p in pages if p["page_number"] in numbers]
    output = []
    size = 0
    for page in selected:
        citation = f"[{material['title']}, PDF page {page['page_number']}]"
        text = f"{citation}\n{page['text']}"
        if size + len(text) > max_chars:
            raise ValueError(
                "Selected source exceeds the reading budget. Choose fewer chapters or topics."
            )
        output.append(text)
        size += len(text)
    return "\n\n".join(output)
