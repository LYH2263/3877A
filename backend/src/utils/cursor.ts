export function decodeCursor(cursor: string | undefined): number | null {
  if (!cursor) {
    return null;
  }
  const value = Number(cursor);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

export function encodeCursor(id: number | null): string | null {
  if (!id) {
    return null;
  }
  return String(id);
}
