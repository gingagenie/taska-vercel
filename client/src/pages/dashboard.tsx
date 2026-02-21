import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { jobsApi } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { CalendarDays, Briefcase, Users, Wrench, Plus } from "lucide-react";
import { JobModal } from "@/components/modals/job-modal";
import { useSubscription } from "@/hooks/useSubscription";
import { SubscriptionBanner } from "@/components/subscription/subscription-banner";
import { UsageWidget } from "@/components/layout/usage-widget";
import { trackViewContent } from "@/lib/tiktok-tracking";
import React from "react";
import { QuotesAcceptedCard } from "@/components/dashboard/QuotesAcceptedCard";

// --- date helpers ---
function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
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
  const { data: subscription } = useSubscription();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["/api/jobs"],
    queryFn: jobsApi.getAll,
  });

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const { todaysJobs, upcomingJobs } = useMemo(() => {
    const todays = (jobs as any[]).filter((j) =>
      within(j.scheduled_at, todayStart, todayEnd)
    );
    const upcoming = (jobs as any[])
      .filter((j) => {
        if (!j.scheduled_at) return false;
        const t = new Date(j.scheduled_at).getTime();
        return t > todayEnd.getTime();
      })
      .sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime()
      )
      .slice(0, 5);
    return { todaysJobs: todays, upcomingJobs: upcoming };
  }, [jobs]);

  // Track TikTok ViewContent event for dashboard page when jobs data loads
  useEffect(() => {
    if (!isLoading && jobs.length >= 0) {
      trackViewContent({
        contentType: "dashboard",
        contentName: "Main Dashboard",
        contentCategory: "dashboard_overview",
        value: (jobs as any[]).length, // Use job count as a value metric
      });
    }
  }, [isLoading, jobs]);

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="header-row">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="header-actions">
          <div className="hidden sm:block">
            <UsageWidget variant="desktop" />
          </div>
          <Button
            data-mobile-full="true"
            onClick={() => setIsJobModalOpen(true)}
          >
            + New Job
          </Button>
        </div>
      </div>

      {/* Subscription Banner */}
      {subscription && (
        <SubscriptionBanner
          status={
            subscription.subscription.status as
              | "trial"
              | "active"
              | "past_due"
              | "canceled"
          }
          planId={subscription.subscription.planId}
          trialEnd={subscription.subscription.trialEnd}
          currentPeriodEnd={subscription.subscription.currentPeriodEnd}
        />
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/schedule">
          <a>
            <Card className="border-schedule bg-white hover:shadow-md hover:bg-gray-50 transition-all cursor-pointer">
              <CardContent className="card-pad flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500 font-medium">
                    Jobs Today
                  </div>
                  <div className="text-2xl font-semibold">
                    {todaysJobs.length}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-schedule text-schedule-foreground">
                  <CalendarDays className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </a>
        </Link>

        <Link href="/jobs">
          <a>
            <Card className="border-jobs bg-white hover:shadow-md hover:bg-gray-50 transition-all cursor-pointer">
              <CardContent className="card-pad flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500 font-medium">
                    Total Jobs
                  </div>
                  <div className="text-2xl font-semibold">
                    {(jobs as any[]).length}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-jobs text-jobs-foreground">
                  <Briefcase className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </a>
        </Link>

        {/* New Accepted Quotes card */}
        <QuotesAcceptedCard />
      </div>

      {/* Today's Schedule + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-schedule bg-white">
          <CardHeader>
            <div className="header-row">
              <CardTitle>Today&apos;s Schedule</CardTitle>
              <div className="header-actions">
                <Button
                  asChild
                  variant="outline"
                  className="border-schedule text-schedule hover:bg-schedule-light"
                >
                  <Link href="/schedule">
                    <a>View Schedule</a>
                  </Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="card-pad">
            {isLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : todaysJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-schedule/10 flex items-center justify-center mb-4">
                  <CalendarDays className="h-8 w-8 text-schedule" />
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  No jobs scheduled for today
                </p>
                <Button
                  onClick={() => setIsJobModalOpen(true)}
                  size="sm"
                  className="bg-schedule hover:bg-schedule/90 text-schedule-foreground"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Schedule a Job
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {todaysJobs.map((j: any) => (
                  <Link key={j.id} href={`/jobs/${j.id}`}>
                    <a className="block rounded-lg border border-gray-200 hover:border-schedule hover:bg-schedule-light/30 p-3 transition">
                      <div className="font-medium">{j.title}</div>
                      <div className="text-xs text-gray-500">
                        {fmtDateTime(j.scheduled_at)} •{" "}
                        {j.customer_name || "—"}
                      </div>
                    </a>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-jobs bg-white">
          <CardHeader>
            <div className="header-row">
              <CardTitle>Upcoming Jobs</CardTitle>
              <div className="header-actions">
                <Button
                  asChild
                  variant="outline"
                  className="border-jobs text-jobs hover:bg-jobs-light"
                >
                  <Link href="/jobs">
                    <a>View All</a>
                  </Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="card-pad">
            {isLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : upcomingJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-jobs/10 flex items-center justify-center mb-4">
                  <Briefcase className="h-8 w-8 text-jobs" />
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  No upcoming jobs scheduled
                </p>
                <Button
                  onClick={() => setIsJobModalOpen(true)}
                  size="sm"
                  className="bg-jobs hover:bg-jobs/90 text-jobs-foreground"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create a Job
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingJobs.map((j: any) => (
                  <Link key={j.id} href={`/jobs/${j.id}`}>
                    <a className="block rounded-lg border border-gray-200 hover:border-jobs hover:bg-jobs-light/30 p-3 transition">
                      <div className="font-medium">{j.title}</div>
                      <div className="text-xs text-gray-500">
                        {fmtDateTime(j.scheduled_at)} •{" "}
                        {j.customer_name || "—"}
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
      <Card className="border-management bg-white">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="card-pad">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Button
              data-mobile-full="true"
              onClick={() => setIsJobModalOpen(true)}
              className="bg-jobs hover:bg-jobs/90 text-jobs-foreground"
            >
              <Briefcase className="h-4 w-4 mr-2" /> New Job
            </Button>
            <Button
              asChild
              data-mobile-full="true"
              variant="outline"
              className="border-schedule text-schedule hover:bg-schedule-light"
            >
              <Link href="/schedule">
                <a>
                  <CalendarDays className="h-4 w-4 mr-2" /> Schedule
                </a>
              </Link>
            </Button>
            <Button
              asChild
              data-mobile-full="true"
              variant="outline"
              className="border-people text-people hover:bg-people-light"
            >
              <Link href="/customers">
                <a>
                  <Users className="h-4 w-4 mr-2" /> Customers
                </a>
              </Link>
            </Button>
            <Button
              asChild
              data-mobile-full="true"
              variant="outline"
              className="border-equipment text-equipment hover:bg-equipment-light"
            >
              <Link href="/equipment">
                <a>
                  <Wrench className="h-4 w-4 mr-2" /> Equipment
                </a>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reuse existing New Job modal */}
      <JobModal open={isJobModalOpen} onOpenChange={setIsJobModalOpen} />
    </div>
  );
}
