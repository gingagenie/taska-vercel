import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SearchableComboboxProps {
  items: Array<{ id: string; name: string; [key: string]: any }>;
  value: string;
  onValueChange: (value: string) => void;
  onCreateNew?: (name: string) => Promise<{ id: string; name: string }>;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  createNewLabel?: (name: string) => string;
}

export function SearchableCombobox({
  items,
  value,
  onValueChange,
  onCreateNew,
  placeholder = "Select item...",
  emptyText = "No items found.",
  searchPlaceholder = "Search items...",
  disabled = false,
  className,
  createNewLabel = (name) => `Create new: ${name}`,
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const selectedItem = items.find((item) => item.id === value);

  // Filter items based on search value
  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Show "Create new" option when:
  // 1. There's a search value
  // 2. No exact match exists in filtered items
  // 3. onCreateNew function is provided
  const showCreateNew = 
    searchValue.trim() && 
    !filteredItems.some(item => item.name.toLowerCase() === searchValue.toLowerCase()) &&
    onCreateNew;

  const handleCreateNew = async () => {
    if (!onCreateNew || !searchValue.trim()) return;
    
    setIsCreating(true);
    try {
      const newItem = await onCreateNew(searchValue.trim());
      onValueChange(newItem.id);
      setOpen(false);
      setSearchValue("");
    } catch (error) {
      console.error("Failed to create new item:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
          data-testid="combobox-trigger"
        >
          {selectedItem ? selectedItem.name : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput 
            placeholder={searchPlaceholder}
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {filteredItems.length > 0 && (
              <CommandGroup>
                {filteredItems.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.name}
                    onSelect={() => {
                      onValueChange(item.id);
                      setOpen(false);
                      setSearchValue("");
                    }}
                    data-testid={`combobox-item-${item.id}`}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === item.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {item.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreateNew && (
              <CommandGroup>
                <CommandItem
                  value={searchValue}
                  onSelect={handleCreateNew}
                  disabled={isCreating}
                  className="text-blue-600 font-medium"
                  data-testid="combobox-create-new"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {isCreating ? "Creating..." : createNewLabel(searchValue)}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}