// client/src/components/ui/date-time-picker.tsx
import { useState, useEffect } from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * DateTimePicker
 *
 * value / onChange use the same "YYYY-MM-DDTHH:mm" string format as
 * <input type="datetime-local"> so it's a drop-in replacement.
 */
interface DateTimePickerProps {
  value: string;           // "YYYY-MM-DDTHH:mm" or ""
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatHour(h: number) {
  const period = h < 12 ? "am" : "pm";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

function formatMinute(m: number) {
  return `:${pad(m)}`;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  className,
}: DateTimePickerProps) {
  // Parse incoming value into date + hour + minute
  const parsed = value ? new Date(value.includes("T") ? value : value + "T00:00") : null;
  const validDate = parsed && isValid(parsed) ? parsed : null;

  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(validDate ?? undefined);
  const [hour, setHour] = useState<number>(validDate ? validDate.getHours() : 8);
  const [minute, setMinute] = useState<number>(
    validDate ? MINUTES.find(m => m === validDate.getMinutes()) ?? 0 : 0
  );

  // Keep internal state in sync if parent resets value externally
  useEffect(() => {
    if (!value) {
      setSelectedDate(undefined);
      setHour(8);
      setMinute(0);
    }
  }, [value]);

  function emit(date: Date | undefined, h: number, m: number) {
    if (!date) return;
    const str = `${format(date, "yyyy-MM-dd")}T${pad(h)}:${pad(m)}`;
    onChange(str);
  }

  function handleDaySelect(day: Date | undefined) {
    setSelectedDate(day);
    emit(day, hour, minute);
  }

  function handleHourChange(val: string) {
    const h = Number(val);
    setHour(h);
    emit(selectedDate, h, minute);
  }

  function handleMinuteChange(val: string) {
    const m = Number(val);
    setMinute(m);
    emit(selectedDate, hour, m);
  }

  const displayLabel = selectedDate
    ? `${format(selectedDate, "d MMM yyyy")} at ${formatHour(hour).replace(":00", "")}${formatMinute(minute)}`
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !displayLabel && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {displayLabel ?? placeholder}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        {/* Calendar */}
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDaySelect}
          initialFocus
        />

        {/* Time row */}
        <div className="border-t px-3 py-3 flex items-center gap-2">
          <span className="text-sm text-muted-foreground shrink-0">Time</span>

          {/* Hour */}
          <Select value={String(hour)} onValueChange={handleHourChange}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-52 overflow-y-auto">
              {HOURS.map(h => (
                <SelectItem key={h} value={String(h)}>
                  {formatHour(h)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Minute */}
          <Select value={String(minute)} onValueChange={handleMinuteChange}>
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MINUTES.map(m => (
                <SelectItem key={m} value={String(m)}>
                  {formatMinute(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedDate && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-8 text-xs"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
