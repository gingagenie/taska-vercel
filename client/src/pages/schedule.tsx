import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday, format } from "date-fns";
import { jobsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useLocation, Link } from "wouter";

type Job = {
  id: string;
  title: string;
  status: string;
  scheduled_at: string;
  customer_name?: string;
};

function rangeISO(d1: Date, d2: Date) {
  return [d1.toISOString(), d2.toISOString()];
}

function statusTone(s: string) {
  if (!s) return "bg-gray-200 text-gray-700";
  if (s === "new") return "bg-blue-100 text-blue-800";
  if (s === "scheduled") return "bg-indigo-100 text-indigo-800";
  if (s === "in_progress") return "bg-amber-100 text-amber-800";
  if (s === "done" || s === "completed") return "bg-emerald-100 text-emerald-800";
  if (s === "cancelled") return "bg-rose-100 text-rose-800";
  return "bg-gray-200 text-gray-700";
}

export default function SchedulePage() {
  const [, navigate] = useLocation();
  const [cursor, setCursor] = useState<Date>(new Date());
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

  // We fetch a little buffer: full weeks that cover the month grid
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Mon
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const [startISO, endISO] = rangeISO(gridStart, gridEnd);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["/api/jobs/range", startISO, endISO],
    queryFn: () => jobsApi.byRange(startISO, endISO),
  });

  // Bucket jobs by day (yyyy-MM-dd)
  const byDay = useMemo(() => {
    const map: Record<string, Job[]> = {};
    (jobs as Job[]).forEach((j) => {
      const key = format(new Date(j.scheduled_at), "yyyy-MM-dd");
      (map[key] ||= []).push(j);
    });
    return map;
  }, [jobs]);

  // day modal
  const [openDay, setOpenDay] = useState<Date | null>(null);
  const dayJobs: Job[] = useMemo(() => {
    if (!openDay) return [];
    const k = format(openDay, "yyyy-MM-dd");
    return byDay[k] || [];
  }, [openDay, byDay]);

  // Build 6 weeks grid
  const cells: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) cells.push(d);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <div className="text-sm text-gray-500">{format(monthStart, "MMMM yyyy")}</div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setCursor(new Date())}
            data-testid="button-schedule-today"
          >
            Today
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setCursor(subMonths(cursor, 1))}
            data-testid="button-schedule-prev"
          >
            Prev
          </Button>
          <Button 
            onClick={() => setCursor(addMonths(cursor, 1))}
            data-testid="button-schedule-next"
          >
            Next
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
      <Card>
        <CardContent className="p-0">
          {/* Weekday header */}
          <div className="grid grid-cols-7 text-xs uppercase text-gray-500 border-b">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((w) => (
              <div key={w} className="px-3 py-2">{w}</div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7">
            {isLoading ? (
              <div className="col-span-7 p-8 text-center text-sm text-gray-500">Loading…</div>
            ) : (
              cells.map((d) => {
                const k = format(d, "yyyy-MM-dd");
                const list = byDay[k] || [];
                const faded = !isSameMonth(d, monthStart);
                const today = isToday(d);
                return (
                  <button
                    key={k}
                    onClick={() => setOpenDay(d)}
                    className={[
                      "h-36 p-2 border -m-[0.5px] text-left overflow-hidden",
                      "hover:bg-gray-50 transition",
                      faded ? "bg-gray-50/40 text-gray-400" : "bg-white",
                      today ? "ring-2 ring-primary/60 z-[1]" : ""
                    ].join(" ")}
                    data-testid={`day-cell-${k}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-medium">{format(d, "d")}</div>
                      {!!list.length && (
                        <Badge className="text-[10px] py-0 px-1.5" data-testid={`day-badge-${k}`}>
                          {list.length}
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1">
                      {list.slice(0, 3).map((j) => (
                        <div
                          key={j.id}
                          className={[
                            "text-[11px] px-1.5 py-0.5 rounded line-clamp-1 cursor-pointer",
                            statusTone(j.status)
                          ].join(" ")}
                          onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${j.id}`); }}
                          title={`${j.title}${j.customer_name ? " — " + j.customer_name : ""}`}
                          data-testid={`job-pill-${j.id}`}
                        >
                          {j.title}{j.customer_name ? ` — ${j.customer_name}` : ""}
                        </div>
                      ))}
                      {list.length > 3 && (
                        <div className="text-[10px] text-gray-500">+{list.length - 3} more…</div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Day modal */}
      <Dialog open={!!openDay} onOpenChange={(v) => setOpenDay(v ? openDay : null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="day-modal-title">
              {openDay ? format(openDay, "EEEE, d MMM yyyy") : "Day"}
            </DialogTitle>
          </DialogHeader>
          {dayJobs.length === 0 ? (
            <div className="text-sm text-gray-500" data-testid="no-jobs-message">
              No jobs scheduled.
            </div>
          ) : (
            <div className="space-y-2">
              {dayJobs.map((j) => (
                <Link key={j.id} href={`/jobs/${j.id}`}>
                  <a 
                    className="block border rounded p-2 hover:bg-gray-50"
                    data-testid={`day-job-${j.id}`}
                  >
                    <div className="text-sm font-medium">{j.title}</div>
                    <div className="text-xs text-gray-600">
                      {j.customer_name || "—"} • {new Date(j.scheduled_at).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}
                    </div>
                  </a>
                </Link>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}