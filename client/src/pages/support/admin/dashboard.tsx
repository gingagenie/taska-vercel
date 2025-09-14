import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  Users, 
  Mail, 
  Activity, 
  Shield,
  TrendingUp,
  Clock,
  Eye,
  UserPlus,
  Settings
} from "lucide-react";

// Support API client for admin stats
const supportAdminApi = {
  getStats: async () => {
    const response = await fetch('/support/api/admin/stats', {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch admin stats');
    return response.json();
  }
};

interface AdminStats {
  user_stats: {
    total_users: number;
    active_users: number;
    inactive_users: number;
    admin_users: number;
    regular_users: number;
    recent_logins: number;
  };
  invite_stats: {
    total_invites: number;
    used_invites: number;
    cancelled_invites: number;
    pending_invites: number;
    expired_invites: number;
  };
  activity_stats: {
    last_24h: number;
    last_7d: number;
    last_30d: number;
  };
}

export default function SupportAdminDashboard() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['/support/api/admin/stats'],
    queryFn: supportAdminApi.getStats,
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500" data-testid="text-loading">Loading admin dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="text-red-800" data-testid="text-error">
              Failed to load admin dashboard. Please check your permissions and try again.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const adminStats = stats as AdminStats;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="text-title">Admin Dashboard</h1>
          <p className="text-gray-600" data-testid="text-subtitle">Support staff management overview</p>
        </div>
        <div className="flex gap-3">
          <Button asChild data-testid="button-manage-users">
            <Link href="/support-admin/users">
              <Users className="h-4 w-4 mr-2" />
              Manage Users
            </Link>
          </Button>
          <Button asChild variant="outline" data-testid="button-manage-invites">
            <Link href="/support-admin/invites">
              <Mail className="h-4 w-4 mr-2" />
              Manage Invites
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-total-users">Total Users</p>
                <p className="text-2xl font-bold text-blue-600" data-testid="text-stat-total-users-count">
                  {adminStats?.user_stats?.total_users || 0}
                </p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-active-users">Active Users</p>
                <p className="text-2xl font-bold text-green-600" data-testid="text-stat-active-users-count">
                  {adminStats?.user_stats?.active_users || 0}
                </p>
              </div>
              <Shield className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-pending-invites">Pending Invites</p>
                <p className="text-2xl font-bold text-orange-600" data-testid="text-stat-pending-invites-count">
                  {adminStats?.invite_stats?.pending_invites || 0}
                </p>
              </div>
              <Mail className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-recent-activity">24h Activity</p>
                <p className="text-2xl font-bold text-purple-600" data-testid="text-stat-recent-activity-count">
                  {adminStats?.activity_stats?.last_24h || 0}
                </p>
              </div>
              <Activity className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" data-testid="text-user-stats-title">
              <Users className="h-5 w-5" />
              User Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Support Users</span>
                <span className="font-semibold" data-testid="text-detail-total-users">
                  {adminStats?.user_stats?.total_users || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Active Users</span>
                <span className="font-semibold text-green-600" data-testid="text-detail-active-users">
                  {adminStats?.user_stats?.active_users || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Inactive Users</span>
                <span className="font-semibold text-gray-600" data-testid="text-detail-inactive-users">
                  {adminStats?.user_stats?.inactive_users || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Admin Users</span>
                <span className="font-semibold text-purple-600" data-testid="text-detail-admin-users">
                  {adminStats?.user_stats?.admin_users || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Support Agents</span>
                <span className="font-semibold text-blue-600" data-testid="text-detail-agent-users">
                  {adminStats?.user_stats?.regular_users || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Recent Logins (7 days)</span>
                <span className="font-semibold" data-testid="text-detail-recent-logins">
                  {adminStats?.user_stats?.recent_logins || 0}
                </span>
              </div>
            </div>
            
            <div className="mt-6">
              <Button asChild className="w-full" data-testid="button-view-users">
                <Link href="/support-admin/users">
                  <Eye className="h-4 w-4 mr-2" />
                  View All Users
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Invite Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" data-testid="text-invite-stats-title">
              <Mail className="h-5 w-5" />
              Invite Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Invites Sent</span>
                <span className="font-semibold" data-testid="text-detail-total-invites">
                  {adminStats?.invite_stats?.total_invites || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Successfully Used</span>
                <span className="font-semibold text-green-600" data-testid="text-detail-used-invites">
                  {adminStats?.invite_stats?.used_invites || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Pending Invites</span>
                <span className="font-semibold text-orange-600" data-testid="text-detail-pending-invites">
                  {adminStats?.invite_stats?.pending_invites || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Expired Invites</span>
                <span className="font-semibold text-red-600" data-testid="text-detail-expired-invites">
                  {adminStats?.invite_stats?.expired_invites || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Cancelled Invites</span>
                <span className="font-semibold text-gray-600" data-testid="text-detail-cancelled-invites">
                  {adminStats?.invite_stats?.cancelled_invites || 0}
                </span>
              </div>
            </div>
            
            <div className="mt-6">
              <Button asChild className="w-full" data-testid="button-view-invites">
                <Link href="/support-admin/invites">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Manage Invites
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="text-activity-stats-title">
            <Activity className="h-5 w-5" />
            Activity Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Clock className="h-8 w-8 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-blue-600" data-testid="text-activity-24h">
                {adminStats?.activity_stats?.last_24h || 0}
              </p>
              <p className="text-sm text-gray-600">Actions Last 24 Hours</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <TrendingUp className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-green-600" data-testid="text-activity-7d">
                {adminStats?.activity_stats?.last_7d || 0}
              </p>
              <p className="text-sm text-gray-600">Actions Last 7 Days</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Activity className="h-8 w-8 text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-purple-600" data-testid="text-activity-30d">
                {adminStats?.activity_stats?.last_30d || 0}
              </p>
              <p className="text-sm text-gray-600">Actions Last 30 Days</p>
            </div>
          </div>
          
          <div className="mt-6">
            <Button asChild className="w-full" variant="outline" data-testid="button-view-audit">
              <Link href="/support-admin/audit">
                <Settings className="h-4 w-4 mr-2" />
                View Audit Logs
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle data-testid="text-quick-actions-title">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button asChild className="h-24 flex-col gap-2" data-testid="button-quick-add-user">
              <Link href="/support-admin/users">
                <UserPlus className="h-8 w-8" />
                <span>Add Support User</span>
              </Link>
            </Button>
            
            <Button asChild variant="outline" className="h-24 flex-col gap-2" data-testid="button-quick-send-invite">
              <Link href="/support-admin/invites">
                <Mail className="h-8 w-8" />
                <span>Send Invite</span>
              </Link>
            </Button>
            
            <Button asChild variant="outline" className="h-24 flex-col gap-2" data-testid="button-quick-view-audit">
              <Link href="/support-admin/audit">
                <Eye className="h-8 w-8" />
                <span>View Audit Trail</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}