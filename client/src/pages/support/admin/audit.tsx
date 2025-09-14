import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Search, 
  Calendar as CalendarIcon, 
  Download, 
  Filter,
  Activity,
  User,
  FileText,
  RefreshCw,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// Support API client for audit logs
const supportAuditApi = {
  getAuditLogs: async (params?: any) => {
    const searchParams = new URLSearchParams(params);
    const response = await fetch(`/support/api/admin/audit?${searchParams}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch audit logs');
    return response.json();
  },
  
  getUsers: async () => {
    const response = await fetch('/support/api/admin/users?limit=100', {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch users');
    return response.json();
  }
};

interface AuditLog {
  id: string;
  action: string;
  target: string;
  meta: any;
  created_at: string;
  actor_id: string;
  user_name: string;
  user_email: string;
}

export default function SupportAuditAdmin() {
  const [searchTerm, setSearchTerm] = useState("");
  const [userFilter, setUserFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [page, setPage] = useState(1);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Query for audit logs
  const { data: auditData, isLoading, refetch } = useQuery({
    queryKey: ['/support/api/admin/audit', { 
      action: actionFilter,
      user_id: userFilter,
      start_date: startDate?.toISOString(),
      end_date: endDate?.toISOString(),
      page 
    }],
    queryFn: () => supportAuditApi.getAuditLogs({ 
      action: actionFilter || undefined,
      user_id: userFilter || undefined,
      start_date: startDate?.toISOString(),
      end_date: endDate?.toISOString(),
      page 
    }),
    refetchInterval: 60000, // Refresh every minute
  });

  // Query for users list for filtering
  const { data: usersData } = useQuery({
    queryKey: ['/support/api/admin/users', 'filter'],
    queryFn: supportAuditApi.getUsers,
  });

  const clearFilters = () => {
    setSearchTerm("");
    setUserFilter("");
    setActionFilter("");
    setStartDate(undefined);
    setEndDate(undefined);
    setPage(1);
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('created') || action.includes('login')) return 'bg-green-100 text-green-800';
    if (action.includes('updated') || action.includes('activated')) return 'bg-blue-100 text-blue-800';
    if (action.includes('deleted') || action.includes('deactivated')) return 'bg-red-100 text-red-800';
    if (action.includes('failed') || action.includes('denied')) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const formatActionName = (action: string) => {
    return action
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatMetaData = (meta: any) => {
    if (!meta) return 'No additional data';
    
    if (typeof meta === 'string') {
      try {
        return JSON.stringify(JSON.parse(meta), null, 2);
      } catch {
        return meta;
      }
    }
    
    return JSON.stringify(meta, null, 2);
  };

  const filteredLogs = auditData?.audit_logs?.filter((log: AuditLog) => {
    const matchesSearch = !searchTerm || 
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user_email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  }) || [];

  const commonActions = [
    'admin_user_created',
    'admin_user_updated',
    'admin_user_deleted',
    'admin_invite_created',
    'login_success',
    'login_failed',
    'admin_users_list',
    'admin_audit_viewed'
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="text-title">Audit Logs</h1>
          <p className="text-gray-600" data-testid="text-subtitle">View comprehensive audit trail of support staff actions</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-total">Total Entries</p>
                <p className="text-2xl font-bold" data-testid="text-stat-total-count">{auditData?.pagination?.total || 0}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-today">Today's Actions</p>
                <p className="text-2xl font-bold text-green-600" data-testid="text-stat-today-count">
                  {auditData?.audit_logs?.filter((log: AuditLog) => {
                    const logDate = new Date(log.created_at);
                    const today = new Date();
                    return logDate.toDateString() === today.toDateString();
                  }).length || 0}
                </p>
              </div>
              <Activity className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-users">Active Users</p>
                <p className="text-2xl font-bold text-purple-600" data-testid="text-stat-users-count">
                  {new Set(auditData?.audit_logs?.map((log: AuditLog) => log.actor_id)).size || 0}
                </p>
              </div>
              <User className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-admin">Admin Actions</p>
                <p className="text-2xl font-bold text-orange-600" data-testid="text-stat-admin-count">
                  {auditData?.audit_logs?.filter((log: AuditLog) => log.action.startsWith('admin_')).length || 0}
                </p>
              </div>
              <Filter className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search actions, users, or details..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
              </div>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="w-[200px]" data-testid="select-user-filter">
                  <SelectValue placeholder="Filter by user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Users</SelectItem>
                  {usersData?.users?.map((user: any) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[200px]" data-testid="select-action-filter">
                  <SelectValue placeholder="Filter by action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Actions</SelectItem>
                  {commonActions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {formatActionName(action)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[200px] justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                      data-testid="button-start-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[200px] justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                      data-testid="button-end-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "End date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle data-testid="text-audit-table-title">Audit Trail</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="text-gray-500" data-testid="text-loading">Loading audit logs...</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log: AuditLog) => (
                  <>
                    <TableRow 
                      key={log.id} 
                      className={expandedLog === log.id ? "bg-gray-50" : ""}
                      data-testid={`row-audit-${log.id}`}
                    >
                      <TableCell data-testid={`text-audit-timestamp-${log.id}`}>
                        <div className="text-sm">
                          {format(new Date(log.created_at), "MMM dd, yyyy")}
                        </div>
                        <div className="text-xs text-gray-500">
                          {format(new Date(log.created_at), "HH:mm:ss")}
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-audit-user-${log.id}`}>
                        <div className="text-sm font-medium">{log.user_name || 'Unknown'}</div>
                        <div className="text-xs text-gray-500">{log.user_email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={getActionBadgeColor(log.action)} 
                          data-testid={`badge-audit-action-${log.id}`}
                        >
                          {formatActionName(log.action)}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-audit-target-${log.id}`}>
                        <div className="text-sm font-mono">{log.target || 'N/A'}</div>
                      </TableCell>
                      <TableCell data-testid={`text-audit-details-${log.id}`}>
                        {log.meta && Object.keys(log.meta).length > 0 ? (
                          <div className="text-xs text-gray-600 max-w-xs truncate">
                            {JSON.stringify(log.meta)}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">No details</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                          data-testid={`button-expand-${log.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandedLog === log.id && (
                      <TableRow data-testid={`row-expanded-${log.id}`}>
                        <TableCell colSpan={6} className="bg-gray-50">
                          <div className="p-4 space-y-3">
                            <div>
                              <label className="text-sm font-medium text-gray-600">Full Action Details</label>
                              <div className="text-sm mt-1">
                                <span className="font-mono bg-gray-100 px-2 py-1 rounded">{log.action}</span>
                              </div>
                            </div>
                            
                            {log.target && (
                              <div>
                                <label className="text-sm font-medium text-gray-600">Target ID</label>
                                <div className="text-sm mt-1 font-mono">{log.target}</div>
                              </div>
                            )}
                            
                            {log.meta && Object.keys(log.meta).length > 0 && (
                              <div>
                                <label className="text-sm font-medium text-gray-600">Metadata</label>
                                <pre className="text-xs mt-1 bg-gray-100 p-3 rounded-md overflow-auto max-h-32">
                                  {formatMetaData(log.meta)}
                                </pre>
                              </div>
                            )}
                            
                            <div>
                              <label className="text-sm font-medium text-gray-600">Timestamp</label>
                              <div className="text-sm mt-1">{new Date(log.created_at).toLocaleString()}</div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
          
          {filteredLogs.length === 0 && !isLoading && (
            <div className="text-center py-8 text-gray-500" data-testid="text-no-logs">
              No audit logs found matching your criteria.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {auditData?.pagination && auditData.pagination.totalPages > 1 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600" data-testid="text-pagination-info">
                Showing {((page - 1) * (auditData.pagination.limit || 50)) + 1} to{' '}
                {Math.min(page * (auditData.pagination.limit || 50), auditData.pagination.total)} of{' '}
                {auditData.pagination.total} entries
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  data-testid="button-prev-page"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPage(Math.min(auditData.pagination.totalPages, page + 1))}
                  disabled={page >= auditData.pagination.totalPages}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}