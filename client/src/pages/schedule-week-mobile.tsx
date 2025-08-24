import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { scheduleApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, User, MapPin } from "lucide-react";
import { format, startOfWeek, endOfWeek, addDays, parseISO } from "date-fns";

// Status color mapping
const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 border-blue-200",
  "in-progress": "bg-yellow-100 text-yellow-800 border-yellow-200", 
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

export default function ScheduleWeekMobile() {
  const [, navigate] = useLocation();
  const [selectedTech, setSelectedTech] = useState<string>("all");
  
  // Get current week range
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 }); // Sunday
  
  const startStr = format(weekStart, "yyyy-MM-dd");
  const endStr = format(addDays(weekEnd, 1), "yyyy-MM-dd"); // Include Sunday

  // Fetch jobs for current week
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["/api/schedule/range", { start: startStr, end: endStr, techId: selectedTech === "all" ? undefined : selectedTech }],
    queryFn: () => scheduleApi.range({ start: startStr, end: endStr, techId: selectedTech === "all" ? undefined : selectedTech }),
  });

  // Group jobs by day
  const jobsByDay = useMemo(() => {
    const groups: Record<string, any[]> = {};
    
    // Initialize all days of the week
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      const dayKey = format(day, "yyyy-MM-dd");
      groups[dayKey] = [];
    }
    
    // Group jobs by their scheduled date
    jobs.forEach((job: any) => {
      if (job.scheduled_at) {
        const jobDate = format(parseISO(job.scheduled_at), "yyyy-MM-dd");
        if (groups[jobDate]) {
          groups[jobDate].push(job);
        }
      }
    });
    
    return groups;
  }, [jobs, weekStart]);

  // Get unique technicians for filter
  const technicians = useMemo(() => {
    const techSet = new Set<string>();
    jobs.forEach((job: any) => {
      if (job.technicians) {
        job.technicians.forEach((tech: any) => {
          techSet.add(JSON.stringify({ id: tech.id, name: tech.name }));
        });
      }
    });
    return Array.from(techSet).map(str => JSON.parse(str));
  }, [jobs]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">This Week</h1>
          <div className="text-sm text-gray-600">
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d")}
          </div>
        </div>
        
        {/* Tech Filter */}
        {technicians.length > 0 && (
          <Select value={selectedTech} onValueChange={setSelectedTech}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filter by technician" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Technicians</SelectItem>
              {technicians.map((tech: any) => (
                <SelectItem key={tech.id} value={tech.id}>
                  {tech.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Week Days */}
      <div className="px-4 pb-4">
        {Object.entries(jobsByDay).map(([dateKey, dayJobs]) => {
          const date = parseISO(dateKey);
          const dayName = format(date, "EEEE");
          const dayNumber = format(date, "d");
          const isToday = format(new Date(), "yyyy-MM-dd") === dateKey;
          
          return (
            <div key={dateKey} className="mb-6">
              {/* Day Header */}
              <div className={`sticky top-[120px] bg-white border rounded-lg p-3 mb-3 z-[5] ${
                isToday ? "bg-blue-50 border-blue-200" : "border-gray-200"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      isToday ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
                    }`}>
                      {dayNumber}
                    </div>
                    <div>
                      <div className={`font-semibold ${isToday ? "text-blue-900" : "text-gray-900"}`}>
                        {dayName}
                      </div>
                      <div className="text-xs text-gray-600">
                        {format(date, "MMM d")}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {dayJobs.length} {dayJobs.length === 1 ? "job" : "jobs"}
                  </Badge>
                </div>
              </div>

              {/* Jobs for this day */}
              <div className="space-y-3">
                {dayJobs.length === 0 ? (
                  <Card className="border-dashed border-gray-300">
                    <CardContent className="p-4 text-center text-gray-500 text-sm">
                      No jobs scheduled
                    </CardContent>
                  </Card>
                ) : (
                  dayJobs.map((job: any) => (
                    <Card 
                      key={job.id} 
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 mb-1">
                              {job.title || "Untitled Job"}
                            </div>
                            <div className="text-sm text-gray-600 mb-2">
                              {job.customer_name}
                            </div>
                          </div>
                          <Badge 
                            className={`text-xs ${statusColors[job.status] || "bg-gray-100 text-gray-800"}`}
                          >
                            {job.status}
                          </Badge>
                        </div>

                        {/* Time */}
                        {job.scheduled_at && (
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                            <Clock className="h-4 w-4" />
                            <span>{format(parseISO(job.scheduled_at), "h:mm a")}</span>
                          </div>
                        )}

                        {/* Technicians */}
                        {job.technicians && job.technicians.length > 0 && (
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                            <User className="h-4 w-4" />
                            <span>
                              {job.technicians.map((tech: any) => tech.name).join(", ")}
                            </span>
                          </div>
                        )}

                        {/* Description */}
                        {job.description && (
                          <div className="text-sm text-gray-600 line-clamp-2">
                            {job.description}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}