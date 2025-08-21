import { Button } from "@/components/ui/button";
import { Bell, Plus } from "lucide-react";

interface TopBarProps {
  title: string;
  subtitle: string;
  onAddNew?: () => void;
  addNewText?: string;
}

export function TopBar({ title, subtitle, onAddNew, addNewText = "New Item" }: TopBarProps) {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="p-2 text-gray-500 hover:text-gray-700">
            <Bell className="h-5 w-5" />
          </Button>
          {onAddNew && (
            <Button onClick={onAddNew} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {addNewText}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
