import { useState, useMemo, useEffect } from 'react';

// usePagination — cắt 1 mảng đã lọc/tìm kiếm (useMemo ở nơi gọi) thành từng
// trang cố định số bản ghi. Tự quay về trang 1 mỗi khi mảng nguồn đổi (lọc/
// tìm kiếm/tải lại) — không phải khi người dùng tự bấm chuyển trang, vì lúc
// đó `items` (reference từ useMemo) không đổi.
//
// Usage:
//   const { pageItems, page, setPage, pageCount, totalItems } = usePagination(filtered, 10);
//   ...filtered.map(...) → ...pageItems.map(...)
//   <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={10} />
export function usePagination(items, pageSize = 10) {
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [items]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);

  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  );

  return { page: safePage, setPage, pageCount, pageItems, totalItems: items.length, pageSize };
}
