/**
 * Paged Supabase fetch helper.
 * PostgREST caps a single response at 1000 rows. For long periods (month/year/All)
 * we MUST page or aggregates silently drop rows. Use this for any "load every
 * row that matches" query — never `.limit(big_number)`.
 */
const PAGE_SIZE = 1000;

export const fetchPaged = async <T,>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
};
