/** Renders structured data for search engines. Pass several objects to emit several blocks. */
export function JsonLd({ data }: { data: object | (object | null | false | undefined)[] | null | false | undefined }) {
  const list = (Array.isArray(data) ? data : [data]).filter(Boolean) as object[];
  if (!list.length) return null;
  return <>{list.map((item, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(item).replace(/</g, '\\u003c') }} />)}</>;
}
