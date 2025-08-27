import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Calendar, User, Clock, ArrowLeft } from "lucide-react";
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

export default function CompletedJobView() {
  const { id } = useParams();
  const [job, setJob] = useState<CompletedJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCompletedJob();
  }, [id]);

  async function loadCompletedJob() {
    try {
      setLoading(true);
      const response = await fetch(`/api/jobs/completed/${id}`);
      if (!response.ok) {
        throw new Error('Failed to load completed job');
      }
      const jobData = await response.json();
      setJob(jobData);
    } catch (e: any) {
      setError(e.message || 'Failed to load completed job');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 min-h-screen bg-gray-100">
        <div className="text-center">Loading completed job...</div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="p-4 sm:p-6 space-y-6 min-h-screen bg-gray-100">
        <div className="text-center text-red-600">
          Error: {error || 'Job not found'}
        </div>
        <div className="text-center">
          <Link href="/completed-jobs">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Completed Jobs
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 min-h-screen bg-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/completed-jobs">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="w-9 h-9 rounded-xl bg-green-500 grid place-items-center">
            <CheckCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
            <p className="text-sm text-gray-500">Completed Job Details</p>
          </div>
        </div>
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle className="h-4 w-4 mr-2" />
          Completed
        </Badge>
      </div>

      {/* Job Details Card */}
      <Card className="bg-white border-l-4 border-l-green-500">
        <CardHeader>
          <CardTitle className="text-xl">Job Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Customer */}
          {job.customer_name && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Customer</h3>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{job.customer_name}</span>
              </div>
            </div>
          )}

          {/* Description */}
          {job.description && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Description</h3>
              <p className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                {job.description}
              </p>
            </div>
          )}

          {/* Work Notes */}
          {job.notes && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Work Notes</h3>
              <p className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                {job.notes}
              </p>
            </div>
          )}

          {/* Timing Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {job.scheduled_at && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Originally Scheduled</h3>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="font-medium">
                    {utcIsoToLocalString(job.scheduled_at, { 
                      dateStyle: "full", 
                      timeStyle: "short" 
                    })}
                  </span>
                </div>
              </div>
            )}
            
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Completed</h3>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="font-medium">
                  {utcIsoToLocalString(job.completed_at, { 
                    dateStyle: "full", 
                    timeStyle: "short" 
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Job ID Reference */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Original Job ID</h3>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
              {job.original_job_id}
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}