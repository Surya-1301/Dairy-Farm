import { useEffect, useState } from "react";

let currentSheetSearch = "";
const sheetSearchListeners = new Set<() => void>();

function emitSheetSearch() {
  sheetSearchListeners.forEach((listener) => listener());
}

export function getSheetSearch(): string {
  return currentSheetSearch;
}

export function setSheetSearch(value: string): void {
  if (value === currentSheetSearch) return;
  currentSheetSearch = value;
  emitSheetSearch();
}

export function subscribeSheetSearch(listener: () => void): () => void {
  sheetSearchListeners.add(listener);
  return () => {
    sheetSearchListeners.delete(listener);
  };
}

/** Shared customer-sheet search text between the header (tablet/mobile) and the table. */
export function useSheetSearch(): [string, (value: string) => void] {
  const [value, setValue] = useState(getSheetSearch);
  useEffect(() => subscribeSheetSearch(() => setValue(getSheetSearch())), []);
  return [value, setSheetSearch];
}
