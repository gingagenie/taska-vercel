import { useQuery } from "@tanstack/react-query";
import { MetricsCard } from "@/components/metrics-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { jobsApi } from "@/lib/api";
import { Briefcase, CheckCircle, DollarSign, Users, Wrench, Calendar, Settings } from "lucide-react";

export default function Dashboard() {
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["/api/jobs"],
    queryFn: jobsApi.getAll,
  });

  // Calculate metrics from jobs data
  const activeJobs = jobs.filter((job: any) => job.status === "new" || job.status === "in_progress").length;
  const completedToday = jobs.filter((job: any) => {
    const today = new Date().toDateString();
    return job.status === "completed" && new Date(job.updated_at).toDateString() === today;
  }).length;

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "new": return "status-badge status-new";
      case "in_progress": return "status-badge status-in-progress";
      case "completed": return "status-badge status-completed";
      default: return "status-badge status-new";
    }
  };

  const getJobIcon = (index: number) => {
    const icons = [Wrench, Settings, Calendar];
    const Icon = icons[index % icons.length];
    return <Icon className="text-blue-600" />;
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-xl border border-gray-200 animate-pulse">
              <div className="h-20"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <MetricsCard
          title="Active Jobs"
          value={activeJobs}
          trend={{ value: "12%", direction: "up", label: "from last week" }}
          icon={<Briefcase className="text-blue-600" />}
          iconBgColor="bg-blue-100"
        />
        
        <MetricsCard
          title="Completed Today"
          value={completedToday}
          trend={{ value: "5%", direction: "up", label: "from yesterday" }}
          icon={<CheckCircle className="text-green-600" />}
          iconBgColor="bg-green-100"
        />
        
        <MetricsCard
          title="Revenue MTD"
          value="$48,250"
          trend={{ value: "18%", direction: "up", label: "from last month" }}
          icon={<DollarSign className="text-yellow-600" />}
          iconBgColor="bg-yellow-100"
        />
        
        <MetricsCard
          title="Team Utilization"
          value="87%"
          trend={{ value: "2%", direction: "down", label: "from last week" }}
          icon={<Users className="text-purple-600" />}
          iconBgColor="bg-purple-100"
        />
      </div>
      
      {/* Recent Activity & Upcoming Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Recent Jobs */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <div className="text-center py-8">
                <Briefcase className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No jobs found</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating a new job.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.slice(0, 5).map((job: any, index: number) => (
                  <div key={job.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        {getJobIcon(index)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{job.title}</p>
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {job.description?.trim()
                            ? job.description
                            : "No description yet"}
                        </p>
                        <p className="text-sm text-gray-500">
                          {job.customer_name && `${job.customer_name} • `}
                          {job.scheduled_at ? new Date(job.scheduled_at).toLocaleDateString() : "Not scheduled"}
                        </p>
                      </div>
                    </div>
                    <Badge className={getStatusBadgeClass(job.status)}>
                      {job.status?.replace("_", " ") || "New"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Today's Schedule */}
        <Card>
          <CardHeader>
            <CardTitle>Today's Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.filter((job: any) => {
              if (!job.scheduled_at) return false;
              const today = new Date().toDateString();
              return new Date(job.scheduled_at).toDateString() === today;
            }).length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No jobs scheduled</h3>
                <p className="mt-1 text-sm text-gray-500">No jobs are scheduled for today.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs
                  .filter((job: any) => {
                    if (!job.scheduled_at) return false;
                    const today = new Date().toDateString();
                    return new Date(job.scheduled_at).toDateString() === today;
                  })
                  .slice(0, 5)
                  .map((job: any) => (
                    <div key={job.id} className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
                      <div className="text-sm font-medium text-gray-500 w-16">
                        {new Date(job.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{job.title}</p>
                        <p className="text-sm text-gray-500">Status: {job.status?.replace("_", " ") || "New"}</p>
                      </div>
                      <div className={`w-3 h-3 rounded-full ${
                        job.status === "completed" ? "bg-green-500" : 
                        job.status === "in_progress" ? "bg-blue-500" : "bg-gray-500"
                      }`}></div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
        
      </div>
    </div>
  );
}
