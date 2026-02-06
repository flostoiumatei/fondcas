"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

export interface SearchableSelectOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  disabled?: boolean
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Selectează...",
  searchPlaceholder = "Caută...",
  emptyText = "Nu s-a găsit nimic.",
  className,
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const selectedOption = options.find((option) => option.value === value)

  const filteredOptions = React.useMemo(() => {
    if (!search) return options
    const searchLower = search.toLowerCase()
    return options.filter((option) =>
      option.label.toLowerCase().includes(searchLower)
    )
  }, [options, search])

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue === value ? "" : optionValue)
    setOpen(false)
    setSearch("")
  }

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen)
      if (!isOpen) setSearch("")
    }}>
      <PopoverTrigger asChild>
        <Button
          variant={selectedOption ? "filterActive" : "filter"}
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          size="sm"
          className={cn(
            "justify-between min-w-[100px]",
            !selectedOption && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[200px] p-0 rounded-xl shadow-xl border-primary/20"
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

          {/* Options list */}
          <div className="max-h-[300px] overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value || '_empty'}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center rounded-lg px-3 py-2.5 text-sm outline-none transition-colors",
                    "hover:bg-primary/10",
                    "focus:bg-primary/10",
                    value === option.value && "bg-primary/10 text-primary font-medium"
                  )}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 flex-shrink-0 text-primary",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
