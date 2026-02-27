import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobModal } from "@/components/modals/job-modal";
import { jobsApi } from "@/lib/api";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Edit, MoreHorizontal, Calendar, User, ArrowRight, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { utcIsoToLocalString } from "@/lib/time";
import { trackClickButton } from "@/lib/tiktok-tracking";

// Helper to get urgency status
function getUrgencyStatus(scheduledAt: string | null): {
  level: 'overdue' | 'today' | 'upcoming' | 'none';
  label: string;
  color: string;
  icon: any;
} {
  if (!scheduledAt) {
    return { level: 'none', label: '', color: '', icon: null };
  }

  const scheduled = new Date(scheduledAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const scheduledDay = new Date(scheduled.getFullYear(), scheduled.getMonth(), scheduled.getDate());
  
  const diffMs = scheduled.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // Overdue
  if (diffMs < 0) {
    const hoursOverdue = Math.abs(diffHours);
    const daysOverdue = Math.abs(diffDays);
    
    if (hoursOverdue < 24) {
      return {
        level: 'overdue',
        label: `Overdue by ${Math.floor(hoursOverdue)}h`,
        color: 'bg-red-100 text-red-700 border-red-200',
        icon: AlertCircle
      };
    } else {
      return {
        level: 'overdue',
        label: `Overdue by ${daysOverdue}d`,
        color: 'bg-red-100 text-red-700 border-red-200',
        icon: AlertCircle
      };
    }
  }
  
  // Due today
  if (scheduledDay.getTime() === today.getTime()) {
    if (diffHours < 2) {
      return {
        level: 'today',
        label: `Due in ${Math.floor(diffHours * 60)}m`,
        color: 'bg-orange-100 text-orange-700 border-orange-200',
        icon: Clock
      };
    } else if (diffHours < 24) {
      return {
        level: 'today',
        label: `Due in ${Math.floor(diffHours)}h`,
        color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        icon: Clock
      };
    }
  }
  
  // Upcoming
  if (diffDays <= 7) {
    return {
      level: 'upcoming',
      label: `In ${diffDays}d`,
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      icon: Calendar
    };
  }

  return { level: 'none', label: '', color: '', icon: null };
}

export default function Jobs() {
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["/api/jobs"],
    queryFn: jobsApi.getAll,
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "new":
        return "status-badge status-new";
      case "scheduled":
        return "status-badge status-scheduled";
      case "confirmed":
        return "status-badge status-confirmed";
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
      const equipmentNames = job.equipment?.map((eq: any) => eq.name.toLowerCase()).join(" ") || "";
      const matchesSearch =
        !q ||
        job.title?.toLowerCase().includes(q) ||
        job.id?.toLowerCase().includes(q) ||
        job.customer_name?.toLowerCase().includes(q) ||
        equipmentNames.includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [jobs, statusFilter, searchQuery]);

  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      const urgencyA = getUrgencyStatus(a.scheduled_at);
      const urgencyB = getUrgencyStatus(b.scheduled_at);
      
      const urgencyOrder = { overdue: 0, today: 1, upcoming: 2, none: 3 };
      const orderA = urgencyOrder[urgencyA.level];
      const orderB = urgencyOrder[urgencyB.level];
      
      if (orderA !== orderB) return orderA - orderB;
      
      if (a.scheduled_at && b.scheduled_at) {
        return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
      }
      
      return 0;
    });
  }, [filteredJobs]);

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
    <div className="space-y-4">
      <div className="header-row">
        <h1 className="text-2xl font-bold text-jobs">Jobs</h1>
        <div className="header-actions">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Search title, customer, ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-72"
            data-testid="input-search-jobs"
          />
          <Button 
            variant="outline"
            onClick={() => navigate('/completed-jobs')}
            data-testid="button-view-completed"
            className="border-green-200 text-green-700 hover:bg-green-50"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Completed Jobs
          </Button>
          <Button 
            onClick={() => {
              trackClickButton({
                contentName: "New Job Button",
                contentCategory: "lead_generation",
              });
              setIsJobModalOpen(true);
            }}
            data-testid="button-new-job"
            data-mobile-full="true"
            className="bg-jobs hover:bg-jobs/90 text-jobs-foreground"
          >
            New Job
          </Button>
        </div>
      </div>

      {sortedJobs.length === 0 ? (
        <Card className="border-jobs bg-white">
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">
              {jobs.length === 0 ? "No jobs found. Create your first job!" : "No jobs match your search or filter"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sortedJobs.map((job: any) => {
            const urgency = getUrgencyStatus(job.scheduled_at);
            const UrgencyIcon = urgency.icon;
            
            return (
              <Card 
                key={job.id} 
                className={`bg-white hover:shadow-md transition-all cursor-pointer group ${
                  urgency.level === 'overdue' 
                    ? 'border-2 border-red-300 hover:border-red-400' 
                    : urgency.level === 'today'
                    ? 'border-2 border-yellow-300 hover:border-yellow-400'
                    : 'border-jobs hover:bg-gray-50'
                }`}
                onClick={() => navigate(`/jobs/${job.id}`)}
                data-testid={`card-job-${job.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start gap-3 flex-wrap">
                        <div className="font-semibold text-lg group-hover:text-blue-600 transition-colors">
                          {job.title || "Untitled Job"}
                        </div>
                        <Badge className={getStatusBadgeClass(job.status)}>
                          {(job.status || "new").replace("_", " ")}
                        </Badge>
                        {urgency.label && (
                          <Badge variant="outline" className={`${urgency.color} border font-medium`}>
                            {UrgencyIcon && <UrgencyIcon className="h-3 w-3 mr-1" />}
                            {urgency.label}
                          </Badge>
                        )}
                      </div>
                      
                      {job.description && (
                        <div className="text-sm text-gray-600">
                          {job.description}
                        </div>
                      )}

                      {job.equipment && job.equipment.length > 0 && (
                        <div className="text-sm">
                          <span className="text-gray-500">Equipment: </span>
                          <span className="font-medium text-blue-600">
                            {job.equipment.map((eq: any) => eq.name).join(", ")}
                          </span>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-gray-500">Customer</div>
                          <div className="font-medium flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {job.customer_name || "Not assigned"}
                          </div>
                        </div>
                        
                        <div>
                          <div className="text-gray-500">Scheduled</div>
                          <div className="font-medium flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {job.scheduled_at ? utcIsoToLocalString(job.scheduled_at, { dateStyle: "medium" }) : "Not scheduled"}
                          </div>
                        </div>
                        
                        <div>
                          <div className="text-gray-500">Time</div>
                          <div className="font-medium">
                            {job.scheduled_at ? utcIsoToLocalString(job.scheduled_at, { timeStyle: "short" }) : "—"}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 text-xs text-gray-400 group-hover:text-blue-500 transition-colors pt-1">
                        <span>Click for details</span>
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 opacity-70 hover:opacity-100"
                          data-testid={`button-actions-job-${job.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/jobs/${job.id}/edit`);
                        }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <JobModal 
        open={isJobModalOpen} 
        onOpenChange={setIsJobModalOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["/api/jobs"] })}
      />
    </div>
  );
}
