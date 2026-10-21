export function parseCsv(text: string): string[][] {
  if (text.length > 1000000) throw new Error("CSV is too large");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell.length) quoted = !quoted;
      else throw new Error("Invalid CSV quoting");
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function csvCell(value: string) {
  const safe = /^\s*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
