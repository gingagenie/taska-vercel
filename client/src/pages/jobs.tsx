import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobModal } from "@/components/modals/job-modal";
import { jobsApi } from "@/lib/api";
import { Eye, Edit } from "lucide-react";

export default function Jobs() {
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["/api/jobs"],
    queryFn: jobsApi.getAll, // expects id,title,status,scheduled_at,customer_id,customer_name
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "new":
        return "status-badge status-new";
      case "scheduled":
        return "status-badge status-scheduled";
      case "in_progress":
        return "status-badge status-in-progress";
      case "done":
      case "completed":
        return "status-badge status-completed";
      case "cancelled":
        return "status-badge status-cancelled";
      default:
        return "status-badge status-new";
    }
  };

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (jobs as any[]).filter((job) => {
      const matchesStatus = statusFilter === "all" || job.status === statusFilter;
      const matchesSearch =
        !q ||
        job.title?.toLowerCase().includes(q) ||
        job.id?.toLowerCase().includes(q) ||
        job.customer_name?.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [jobs, statusFilter, searchQuery]);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-gray-200 animate-pulse">
          <div className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg sm:text-xl">All Jobs</CardTitle>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Search by title, customer, or ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64"
              />
              <Button onClick={() => setIsJobModalOpen(true)}>New Job</Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {filteredJobs.length === 0 ? (
            <div className="text-center py-8">
              <h3 className="mt-2 text-sm font-medium text-gray-900">No jobs found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {jobs.length === 0 ? "Get started by creating a new job." : "Try adjusting your search or filter."}
              </p>
            </div>
          ) : (
            <>
            {/* Mobile Card View */}
            <div className="block md:hidden space-y-4">
              {filteredJobs.map((job: any) => (
                <Card key={job.id} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 text-sm">{job.title}</h3>
                      <p className="text-xs text-gray-500 mt-1">#{job.id}</p>
                      <p className="text-sm text-gray-600 mt-1">{job.customer_name || "Not assigned"}</p>
                    </div>
                    <Badge className={getStatusBadgeClass(job.status)}>
                      {(job.status || "new").replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "Not scheduled"}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:text-blue-700 p-1"
                        onClick={() => navigate(`/jobs/${job.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-600 hover:text-gray-900 p-1"
                        onClick={() => navigate(`/jobs/${job.id}/edit`)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scheduled</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredJobs.map((job: any) => (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{job.title}</div>
                          <div className="text-sm text-gray-500">#{job.id}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {job.customer_name || "Not assigned"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge className={getStatusBadgeClass(job.status)}>
                          {(job.status || "new").replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "Not scheduled"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:text-blue-700"
                          onClick={() => navigate(`/jobs/${job.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-gray-600 hover:text-gray-800 ml-2"
                          onClick={() => navigate(`/jobs/${job.id}/edit`)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <JobModal 
        open={isJobModalOpen} 
        onOpenChange={setIsJobModalOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["/api/jobs"] })}
      />
    </div>
  );
}
