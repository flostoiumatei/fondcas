"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

export interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  values: string[]
  onValuesChange: (values: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  disabled?: boolean
  maxDisplay?: number // Max items to show before "+N more"
}

export function MultiSelect({
  options,
  values,
  onValuesChange,
  placeholder = "Selectează...",
  searchPlaceholder = "Caută...",
  emptyText = "Nu s-a găsit nimic.",
  className,
  disabled = false,
  maxDisplay = 2,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const selectedOptions = options.filter((option) => values.includes(option.value))

  const filteredOptions = React.useMemo(() => {
    if (!search) return options
    const searchLower = search.toLowerCase()
    return options.filter((option) =>
      option.label.toLowerCase().includes(searchLower)
    )
  }, [options, search])

  const handleToggle = (optionValue: string) => {
    if (values.includes(optionValue)) {
      onValuesChange(values.filter(v => v !== optionValue))
    } else {
      onValuesChange([...values, optionValue])
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onValuesChange([])
  }

  const displayText = () => {
    if (selectedOptions.length === 0) return placeholder
    if (selectedOptions.length <= maxDisplay) {
      return selectedOptions.map(o => o.label).join(", ")
    }
    return `${selectedOptions.slice(0, maxDisplay).map(o => o.label).join(", ")} +${selectedOptions.length - maxDisplay}`
  }

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen)
      if (!isOpen) setSearch("")
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "justify-between font-normal h-10 min-w-[120px]",
            "rounded-xl border-primary/20 bg-white hover:bg-primary/5 hover:border-primary/40",
            "text-sm transition-all",
            selectedOptions.length > 0 && "border-primary/50 bg-primary/5 text-primary",
            !selectedOptions.length && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate text-left flex-1">
            {displayText()}
          </span>
          <div className="flex items-center gap-1 ml-2">
            {selectedOptions.length > 0 && (
              <button
                onClick={handleClear}
                className="rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                aria-label="Șterge selecția"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[280px] p-0 rounded-xl shadow-xl border-primary/20"
        align="start"
        sideOffset={4}
      >
        <div className="flex flex-col">
          {/* Search input */}
          <div className="flex items-center border-b border-primary/10 px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 text-primary/50" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          {/* Selected count */}
          {selectedOptions.length > 0 && (
            <div className="px-3 py-2 border-b border-primary/10 bg-primary/5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-primary font-medium">
                  {selectedOptions.length} selectat{selectedOptions.length > 1 ? 'e' : ''}
                </span>
                <button
                  onClick={() => onValuesChange([])}
                  className="text-xs text-primary/70 hover:text-primary underline"
                >
                  Șterge tot
                </button>
              </div>
            </div>
          )}

          {/* Options list */}
          <div className="max-h-[300px] overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = values.includes(option.value)
                return (
                  <button
                    key={option.value || '_empty'}
                    type="button"
                    onClick={() => handleToggle(option.value)}
                    className={cn(
                      "relative flex w-full cursor-pointer select-none items-center rounded-lg px-3 py-2.5 text-sm outline-none",
                      "hover:bg-primary/10 transition-colors",
                      "focus:bg-primary/10",
                      isSelected && "bg-primary/10"
                    )}
                  >
                    <div className={cn(
                      "mr-3 h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                      isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                    )}>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <span className="truncate">{option.label}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
