import type { SourceReference } from "@/lib/types";

export default function SourceReferences({ sources }: { sources?: SourceReference[] }) {
  if (!sources?.length) return null;
  const books = new Map<string, { title: string; pages: Set<number> }>();
  for (const source of sources) {
    const book = books.get(source.material_id) || { title: source.title, pages: new Set<number>() };
    book.pages.add(source.page);
    books.set(source.material_id, book);
  }
  return <details>
    <summary>Retrieved PDF sources · {sources.length} pages</summary>
    <p>Text only. Images and diagrams were not read.</p>
    <ul>{Array.from(books, ([id, book]) => <li key={id}>
      {book.title} · PDF pages {Array.from(book.pages).sort((a, b) => a - b).join(", ")}
    </li>)}</ul>
  </details>;
}
