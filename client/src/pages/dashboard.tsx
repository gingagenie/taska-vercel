import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { jobsApi } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { CalendarDays, Briefcase, Users, Wrench } from "lucide-react";
import { JobModal } from "@/components/modals/job-modal";

// --- date helpers ---
function startOfDay(d = new Date()) {
  const x = new Date(d); x.setHours(0,0,0,0); return x;
}
function endOfDay(d = new Date()) {
  const x = new Date(d); x.setHours(23,59,59,999); return x;
}
function within(dateStr: string | null, from: Date, to: Date) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  return t >= from.getTime() && t <= to.getTime();
}
function fmtDateTime(s: string | null) {
  if (!s) return "Not scheduled";
  const d = new Date(s);
  return d.toLocaleString();
}

export default function Dashboard() {
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["/api/jobs"],
    queryFn: jobsApi.getAll,
  });

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const { todaysJobs, upcomingJobs } = useMemo(() => {
    const todays = (jobs as any[]).filter(j =>
      within(j.scheduled_at, todayStart, todayEnd)
    );
    const upcoming = (jobs as any[])
      .filter(j => {
        if (!j.scheduled_at) return false;
        const t = new Date(j.scheduled_at).getTime();
        return t > todayEnd.getTime();
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      .slice(0, 5);
    return { todaysJobs: todays, upcomingJobs: upcoming };
  }, [jobs]);

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="header-row">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="header-actions">
          <Button data-mobile-full="true" onClick={() => setIsJobModalOpen(true)}>
            + New Job
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="card-pad flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Jobs Today</div>
              <div className="text-2xl font-semibold">{todaysJobs.length}</div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
              <CalendarDays className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="card-pad flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Total Jobs</div>
              <div className="text-2xl font-semibold">{(jobs as any[]).length}</div>
            </div>
            <div className="p-3 rounded-lg bg-indigo-50 text-indigo-600">
              <Briefcase className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Schedule + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="header-row">
              <CardTitle>Today's Schedule</CardTitle>
              <div className="header-actions">
                <Link href="/schedule"><a><Button variant="outline">View Schedule</Button></a></Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="card-pad">
            {isLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : todaysJobs.length === 0 ? (
              <div className="text-sm text-gray-500">No jobs scheduled for today.</div>
            ) : (
              <div className="space-y-3">
                {todaysJobs.map((j: any) => (
                  <Link key={j.id} href={`/jobs/${j.id}`}>
                    <a className="block rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 p-3 transition">
                      <div className="font-medium">{j.title}</div>
                      <div className="text-xs text-gray-500">
                        {fmtDateTime(j.scheduled_at)} • {j.customer_name || "—"}
                      </div>
                    </a>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="header-row">
              <CardTitle>Upcoming Jobs</CardTitle>
              <div className="header-actions">
                <Link href="/jobs"><a><Button variant="outline">View All</Button></a></Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="card-pad">
            {isLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : upcomingJobs.length === 0 ? (
              <div className="text-sm text-gray-500">No upcoming jobs.</div>
            ) : (
              <div className="space-y-3">
                {upcomingJobs.map((j: any) => (
                  <Link key={j.id} href={`/jobs/${j.id}`}>
                    <a className="block rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 p-3 transition">
                      <div className="font-medium">{j.title}</div>
                      <div className="text-xs text-gray-500">
                        {fmtDateTime(j.scheduled_at)} • {j.customer_name || "—"}
                      </div>
                    </a>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="card-pad">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Button data-mobile-full="true" onClick={() => setIsJobModalOpen(true)}>
              <Briefcase className="h-4 w-4 mr-2" /> New Job
            </Button>
            <Link href="/schedule">
              <a><Button data-mobile-full="true" variant="outline"><CalendarDays className="h-4 w-4 mr-2" /> Schedule</Button></a>
            </Link>
            <Link href="/customers">
              <a><Button data-mobile-full="true" variant="outline"><Users className="h-4 w-4 mr-2" /> Customers</Button></a>
            </Link>
            <Link href="/equipment">
              <a><Button data-mobile-full="true" variant="outline"><Wrench className="h-4 w-4 mr-2" /> Equipment</Button></a>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Reuse existing New Job modal */}
      <JobModal open={isJobModalOpen} onOpenChange={setIsJobModalOpen} />
    </div>
  );
}