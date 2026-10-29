import Link from "next/link";
export function Pagination({
  page,
  hasNext,
  query = {},
}: {
  page: number;
  hasNext: boolean;
  query?: Record<string, string>;
}) {
  const href = (value: number) => {
    const params = new URLSearchParams(query);
    params.set("page", String(value));
    return "?" + params.toString();
  };
  return (
    <nav className="pagination" aria-label="History pages">
      {page > 1 && (
        <Link className="button" href={href(page - 1)}>
          Previous page
        </Link>
      )}
      <span>Page {page} · up to 50 records</span>
      {hasNext && page < 10000 && (
        <Link className="button" href={href(page + 1)}>
          Next page
        </Link>
      )}
    </nav>
  );
}
