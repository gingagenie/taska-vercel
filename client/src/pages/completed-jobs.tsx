import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Calendar, User, Clock } from "lucide-react";
import { utcIsoToLocalString } from "@/lib/time";

interface CompletedJob {
  id: string;
  original_job_id: string;
  customer_id: string | null;
  customer_name: string | null;
  title: string;
  description: string | null;
  notes: string | null;
  scheduled_at: string | null;
  completed_at: string;
  completed_by: string | null;
  original_created_by: string | null;
  original_created_at: string | null;
}

export default function CompletedJobsPage() {
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCompletedJobs();
  }, []);

  async function loadCompletedJobs() {
    try {
      setLoading(true);
      const response = await fetch('/api/jobs/completed');
      if (!response.ok) {
        throw new Error('Failed to load completed jobs');
      }
      const jobs = await response.json();
      setCompletedJobs(jobs);
    } catch (e: any) {
      setError(e.message || 'Failed to load completed jobs');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 min-h-screen bg-gray-100">
        <div className="text-center">Loading completed jobs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 space-y-6 min-h-screen bg-gray-100">
        <div className="text-center text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 min-h-screen bg-gray-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-500 grid place-items-center">
            <CheckCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Completed Jobs</h1>
            <p className="text-sm text-gray-500">{completedJobs.length} jobs completed</p>
          </div>
        </div>
        <Link href="/schedule">
          <Button variant="outline">
            Back to Schedule
          </Button>
        </Link>
      </div>

      {completedJobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No completed jobs yet</h3>
            <p className="text-gray-500 text-center max-w-md">
              When you complete jobs from your schedule, they'll appear here for easy reference.
            </p>
            <Link href="/schedule">
              <Button className="mt-4">View Schedule</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {completedJobs.map((job) => (
            <Card key={job.id} className="bg-white border-l-4 border-l-green-500">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      {job.title}
                    </CardTitle>
                    {job.customer_name && (
                      <p className="text-sm text-gray-600 mt-1">
                        Customer: {job.customer_name}
                      </p>
                    )}
                  </div>
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Completed
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {job.description && (
                  <p className="text-gray-700 mb-4 whitespace-pre-wrap">
                    {job.description}
                  </p>
                )}
                
                {job.notes && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-1">Work Notes:</p>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                      {job.notes}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                  {job.scheduled_at && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-gray-500">Originally Scheduled</p>
                        <p className="font-medium">
                          {utcIsoToLocalString(job.scheduled_at, { 
                            dateStyle: "medium", 
                            timeStyle: "short" 
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-gray-500">Completed</p>
                      <p className="font-medium">
                        {utcIsoToLocalString(job.completed_at, { 
                          dateStyle: "medium", 
                          timeStyle: "short" 
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-gray-500">Job ID</p>
                      <p className="font-medium text-xs">
                        {job.original_job_id.slice(0, 8)}...
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}