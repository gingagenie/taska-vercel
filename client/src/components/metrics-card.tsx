import { Card, CardContent } from "@/components/ui/card";

interface MetricsCardProps {
  title: string;
  value: string | number;
  trend: {
    value: string;
    direction: "up" | "down";
    label: string;
  };
  icon: React.ReactNode;
  iconBgColor: string;
}

export function MetricsCard({ title, value, trend, icon, iconBgColor }: MetricsCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
          </div>
          <div className={`w-12 h-12 ${iconBgColor} rounded-lg flex items-center justify-center`}>
            {icon}
          </div>
        </div>
        <div className="flex items-center mt-4">
          <span className={`text-sm font-medium ${
            trend.direction === "up" ? "metric-trend-positive" : "metric-trend-negative"
          }`}>
            {trend.direction === "up" ? "+" : ""}{trend.value}
          </span>
          <span className="text-gray-500 text-sm ml-1">{trend.label}</span>
        </div>
      </CardContent>
    </Card>
  );
}
