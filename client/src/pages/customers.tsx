import { useMemo, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi, jobsApi } from "@/lib/api";
import { Link, useLocation } from "wouter";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import { Mail, Phone, MapPin, MoreHorizontal, Edit, ArrowRight, Upload, Star, TrendingUp, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

/** Helpers */
function addrLine(c: any) {
  return [c.street, c.suburb, c.state, c.postcode].filter(Boolean).join(", ");
}
function hasAddress(c: any) {
  return Boolean(c.street || c.suburb || c.state || c.postcode);
}
function initials(name?: string) {
  if (!name) return "C";
  const parts = name.split(/\s+/).filter(Boolean);
  const a = (parts[0]?.[0] || "").toUpperCase();
  const b = (parts[1]?.[0] || (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
  return (a + b).trim() || "C";
}
function hueFrom(name?: string) {
  const s = name || "Customer";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

// Helper to get customer tier based on job count
function getCustomerTier(jobCount: number): {
  tier: 'vip' | 'regular' | 'new';
  label: string;
  color: string;
  icon: any;
} {
  if (jobCount >= 10) {
    return { tier: 'vip', label: 'VIP', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Star };
  } else if (jobCount >= 3) {
    return { tier: 'regular', label: 'Regular', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: TrendingUp };
  } else {
    return { tier: 'new', label: 'New', color: 'bg-gray-100 text-gray-600 border-gray-200', icon: null };
  }
}

// Helper to format last contact time
function getLastContactLabel(lastJobDate: string | null): string {
  if (!lastJobDate) return "No jobs yet";
  
  const lastDate = new Date(lastJobDate);
  const now = new Date();
  const diffMs = now.getTime() - lastDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

export default function Customers() {
  const { data: list = [], isLoading } = useQuery({
    queryKey: ["/api/customers"],
    queryFn: customersApi.getAll,
  });

  // Fetch all jobs to calculate last contact
  const { data: allJobs = [] } = useQuery({
    queryKey: ["/api/jobs"],
    queryFn: jobsApi.getAll,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [, navigate] = useLocation();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate job stats per customer
  const customerStats = useMemo(() => {
    const stats: Record<string, { jobCount: number; lastJobDate: string | null }> = {};
    
    (allJobs as any[]).forEach((job: any) => {
      if (!job.customer_id) return;
      
      if (!stats[job.customer_id]) {
        stats[job.customer_id] = { jobCount: 0, lastJobDate: null };
      }
      
      stats[job.customer_id].jobCount++;
      
      // Track most recent job
      if (job.scheduled_at) {
        const jobDate = new Date(job.scheduled_at).toISOString();
        if (!stats[job.customer_id].lastJobDate || jobDate > stats[job.customer_id].lastJobDate!) {
          stats[job.customer_id].lastJobDate = jobDate;
        }
      }
    });
    
    return stats;
  }, [allJobs]);

  const filtered = useMemo(() => {
    const text = q.toLowerCase();
    const byText = (c: any) =>
      [c.name, c.contact_name, c.email, c.phone, addrLine(c), c.notes]
        .join(" ")
        .toLowerCase()
        .includes(text);

    return (list as any[]).filter(byText);
  }, [list, q]);

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV file",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("csvFile", file);

      const response = await fetch("/api/customers/import-csv", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to upload CSV");
      }

      const result = await response.json();

      toast({
        title: "CSV Import Successful",
        description: `Imported ${result.imported} of ${result.total} customers${
          result.errors ? `. ${result.errors.length} errors occurred.` : ""
        }`,
      });

      if (result.errors) {
        console.log("Import errors:", result.errors);
      }

      // Refresh the customers list
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    } catch (error: any) {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import CSV",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="header-row">
        <h1 className="text-2xl font-bold text-people">Customers</h1>
        <div className="header-actions">
          <Input
            placeholder="Search company, contact, email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-72"
            data-testid="input-search-customers"
          />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleCSVUpload}
            accept=".csv"
            className="hidden"
          />
          <Button
            onClick={() => {
              fileInputRef.current?.click();
            }}
            disabled={isUploading}
            variant="outline"
            data-testid="button-import-csv"
          >
            <Upload className="h-4 w-4 mr-2" />
            {isUploading ? "Importing..." : "Import CSV"}
          </Button>
          <Button
            onClick={() => {
              navigate("/customers/new");
            }}
            data-testid="button-new-customer"
            data-mobile-full="true"
            className="bg-people hover:bg-people/90 text-people-foreground"
          >
            New Customer
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="border-people bg-white">
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">Loading customers...</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-people bg-white">
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">
              {q ? "No customers match your search" : "No customers found. Create your first customer!"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((c: any) => {
            const addr = addrLine(c);
            const hue = hueFrom(c.name);
            const stats = customerStats[c.id] || { jobCount: 0, lastJobDate: null };
            const tier = getCustomerTier(stats.jobCount);
            const TierIcon = tier.icon;
            const lastContact = getLastContactLabel(stats.lastJobDate);
            
            return (
              <Card
                key={c.id}
                className="border-people bg-white hover:shadow-md hover:bg-gray-50 transition-all cursor-pointer group"
                onClick={() => {
                  console.log("Clicking customer card:", c.id);
                  navigate(`/customers/${c.id}`);
                }}
                data-testid={`card-customer-${c.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start gap-3">
                        <div
                          className="h-12 w-12 flex items-center justify-center rounded-lg text-white text-sm font-semibold shadow-sm shrink-0"
                          style={{ background: `hsl(${hue} 70% 45%)` }}
                        >
                          {initials(c.name)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-semibold text-lg group-hover:text-blue-600 transition-colors">
                              {c.name || "Unnamed Customer"}
                            </div>
                            {tier.tier !== 'new' && (
                              <Badge variant="outline" className={`${tier.color} border font-medium`}>
                                {TierIcon && <TierIcon className="h-3 w-3 mr-1" />}
                                {tier.label}
                              </Badge>
                            )}
                          </div>
                          {c.contact_name && (
                            <div className="text-sm text-gray-600">Contact: {c.contact_name}</div>
                          )}
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                            <Calendar className="h-3 w-3" />
                            <span>{stats.jobCount} jobs • Last: {lastContact}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-gray-500">Email</div>
                          <div className="font-medium flex items-center gap-2">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{c.email || "—"}</span>
                            {c.email && (
                              <a
                                href={`mailto:${c.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-700"
                                title="Send email"
                              >
                                <Mail className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-gray-500">Phone</div>
                          <div className="font-medium flex items-center gap-2">
                            <Phone className="h-3 w-3" />
                            <span className="truncate">{c.phone || "—"}</span>
                            {c.phone && (
                              <a
                                href={`tel:${c.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-700"
                                title="Call"
                              >
                                <Phone className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-gray-500">Address</div>
                          <div className="font-medium flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{addr || "—"}</span>
                          </div>
                        </div>
                      </div>

                      {c.notes && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Notes</div>
                          <div className="text-sm text-gray-700">{c.notes}</div>
                        </div>
                      )}

                      <div className="flex items-center gap-1 text-xs text-gray-400 group-hover:text-blue-500 transition-colors pt-1">
                        <span>Click for details</span>
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
