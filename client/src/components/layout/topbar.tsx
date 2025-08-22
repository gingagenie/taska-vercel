import { Menu } from "lucide-react";

type Props = { onMenu: () => void; title?: string };

export function Topbar({ onMenu, title = "Taska" }: Props) {
  return (
    <header className="md:hidden sticky top-0 z-40 bg-white border-b">
      <div className="h-12 flex items-center gap-3 px-3">
        <button
          aria-label="Open menu"
          onClick={onMenu}
          className="p-2 rounded hover:bg-gray-100 active:bg-gray-200"
          data-testid="button-menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-lg text-gray-900" data-testid="text-title">
          {title}
        </h1>
      </div>
    </header>
  );
}