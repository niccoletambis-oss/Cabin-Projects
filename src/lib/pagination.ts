export const PAGE_SIZE = 50;
export function pageNumber(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,6}$/.test(value)) return 1;
  return Math.max(1, Math.min(10000, Number(value)));
}
export function pageQuery(page: number) {
  return { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE + 1 };
}
