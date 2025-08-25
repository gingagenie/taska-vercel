import { toZonedTime, fromZonedTime } from "date-fns-tz";

const BIZ_TZ = "Australia/Melbourne";

// Convert UTC ISO string to Australia/Melbourne local time for datetime-local input
export function localInputFromISO(iso?: string) {
  if (!iso) return "";
  
  try {
    const utcDate = new Date(iso);
    const localDate = toZonedTime(utcDate, BIZ_TZ);
    
    const p = (n: number) => String(n).padStart(2, "0");
    return `${localDate.getFullYear()}-${p(localDate.getMonth()+1)}-${p(localDate.getDate())}T${p(localDate.getHours())}:${p(localDate.getMinutes())}`;
  } catch (error) {
    console.error("Error converting ISO to local input:", error);
    return "";
  }
}

// Convert Australia/Melbourne local time from datetime-local input to UTC ISO
export function isoFromLocalInput(local?: string) {
  if (!local) return null;
  
  try {
    // Parse as local Melbourne time, then convert to UTC
    const localDate = new Date(local);
    const utcDate = fromZonedTime(localDate, BIZ_TZ);
    return utcDate.toISOString();
  } catch (error) {
    console.error("Error converting local input to ISO:", error);
    return null;
  }
}