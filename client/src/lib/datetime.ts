// Simple manual timezone conversion for Australia/Melbourne (UTC+10 in winter, UTC+11 in summer)
// For August (winter), Melbourne is UTC+10

// Convert UTC ISO string to Melbourne local time for datetime-local input
export function localInputFromISO(iso?: string) {
  if (!iso) return "";
  
  try {
    // Add 10 hours to UTC to get Melbourne time
    const utcDate = new Date(iso);
    const melbDate = new Date(utcDate.getTime() + (10 * 60 * 60 * 1000));
    
    const p = (n: number) => String(n).padStart(2, "0");
    return `${melbDate.getUTCFullYear()}-${p(melbDate.getUTCMonth()+1)}-${p(melbDate.getUTCDate())}T${p(melbDate.getUTCHours())}:${p(melbDate.getUTCMinutes())}`;
  } catch (error) {
    console.error("Error converting ISO to local input:", error);
    return "";
  }
}

// Convert Melbourne local time from datetime-local input to UTC ISO
export function isoFromLocalInput(local?: string) {
  if (!local) return null;
  
  try {
    // Parse the datetime-local input as Melbourne time
    // We need to treat the input as if it's in Melbourne timezone, then convert to UTC
    
    // Parse components manually to avoid timezone interpretation issues
    const parts = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!parts) return null;
    
    const [, year, month, day, hour, minute, second = '0'] = parts;
    
    // Create date in Melbourne timezone by treating input as UTC then subtracting offset
    // Melbourne is UTC+10 in winter, so to convert Melbourne time to UTC, subtract 10 hours
    const melbourneDateAsUTC = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`);
    const utcDate = new Date(melbourneDateAsUTC.getTime() - (10 * 60 * 60 * 1000));
    
    return utcDate.toISOString();
  } catch (error) {
    console.error("Error converting local input to ISO:", error);
    return null;
  }
}