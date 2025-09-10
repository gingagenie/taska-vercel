import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface SmsUsage {
  month: string;
  usage: number;
  quota: number;
  remaining: number;
  planId: string;
  planName: string;
  quotaExceeded: boolean;
  usagePercentage: number;
}

export function useSmsUsage() {
  return useQuery({
    queryKey: ["/api/jobs/sms/usage"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/jobs/sms/usage");
      if (!response.ok) {
        throw new Error("Failed to fetch SMS usage");
      }
      return response.json() as Promise<SmsUsage>;
    },
    retry: false,
  });
}

export function useSmsHistory(months: number = 3) {
  return useQuery({
    queryKey: ["/api/jobs/sms/history", months],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/jobs/sms/history?months=${months}`);
      if (!response.ok) {
        throw new Error("Failed to fetch SMS history");
      }
      return response.json() as Promise<Array<{ month: string; smsCount: number }>>;
    },
    retry: false,
  });
}