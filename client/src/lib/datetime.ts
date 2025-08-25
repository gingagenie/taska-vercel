export function localInputFromISO(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Takes value from <input type="datetime-local"> (local time) -> UTC ISO
export function isoFromLocalInput(local?: string) {
  if (!local) return null;
  // new Date(local) treats it as local time; toISOString() converts to UTC Z
  const d = new Date(local);
  return isNaN(d.valueOf()) ? null : d.toISOString();
}