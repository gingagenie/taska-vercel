import { Button } from "@/components/ui/button";
import { Bell, Plus, Menu } from "lucide-react";

interface TopBarProps {
  title: string;
  subtitle: string;
  onAddNew?: () => void;
  addNewText?: string;
  onMenuToggle?: () => void;
}

export function TopBar({ title, subtitle, onAddNew, addNewText = "New Item", onMenuToggle }: TopBarProps) {
  return (
    <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Mobile Menu Toggle */}
          {onMenuToggle && (
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden p-2"
              onClick={onMenuToggle}
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-600 mt-1 hidden sm:block">{subtitle}</p>
          </div>
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
