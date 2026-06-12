import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface StationOption {
  id: string;
  name: string;
}

interface Props {
  value: string;
  options: StationOption[];
  onSelect: (id: string) => void;
  ariaLabel: string;
}

/**
 * Searchable station picker for the O/D fields on the region pages.
 * Replaces the plain Select: type to filter (cmdk does the matching on the
 * station name), click or Enter to pick. Trigger mirrors SelectTrigger styling
 * so the route card looks unchanged.
 */
export default function StationCombobox({ value, options, onSelect, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="truncate">{selected?.name ?? "Loading…"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search station…" />
          <CommandList>
            <CommandEmpty>No station found.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.name}
                  onSelect={() => {
                    onSelect(o.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", o.id === value ? "opacity-100" : "opacity-0")} />
                  {o.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
