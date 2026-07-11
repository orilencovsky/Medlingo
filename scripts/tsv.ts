export function parseTsv(text: string): Array<Record<string, string>> {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const header = lines[0].split('\t').map((h) => h.trim());
  return lines.slice(1).map((line, i) => {
    const cells = line.split('\t');
    if (cells.length !== header.length) {
      throw new Error(`row ${i + 2}: expected ${header.length} columns, got ${cells.length}`);
    }
    const rec: Record<string, string> = {};
    header.forEach((h, c) => (rec[h] = cells[c].trim()));
    return rec;
  });
}
