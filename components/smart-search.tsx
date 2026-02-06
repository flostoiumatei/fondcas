'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Building2,
  Stethoscope,
  MapPin,
  Network,
  Loader2,
  ArrowRight,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Suggestion {
  type: 'location' | 'specialty' | 'network';
  id: string;
  name: string;
  subtitle?: string;
  score: number;
}

interface SmartSearchProps {
  onSearch?: (query: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function SmartSearch({
  onSearch,
  placeholder = "Caută clinică, specialitate...",
  autoFocus = false,
  className,
}: SmartSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Fetch suggestions with debounce
  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      setSuggestions(data.suggestions || []);
      setIsOpen(data.suggestions?.length > 0);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(query);
    }, 150); // Fast debounce for responsive feel

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, fetchSuggestions]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsOpen(false);

    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      handleSuggestionClick(suggestions[selectedIndex]);
    } else if (query.trim()) {
      if (onSearch) {
        onSearch(query.trim());
      } else {
        router.push(`/search?query=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    setIsOpen(false);
    setQuery('');

    switch (suggestion.type) {
      case 'specialty':
        router.push(`/search?specialty=${encodeURIComponent(suggestion.name)}`);
        break;
      case 'network':
        router.push(`/search?query=${encodeURIComponent(suggestion.name)}&network=true`);
        break;
      case 'location':
        router.push(`/clinic/${suggestion.id}`);
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault();
          handleSuggestionClick(suggestions[selectedIndex]);
        }
        break;
    }
  };

  const getIcon = (type: Suggestion['type']) => {
    switch (type) {
      case 'specialty':
        return <Stethoscope className="h-4 w-4 text-accent" />;
      case 'network':
        return <Network className="h-4 w-4 text-purple-500" />;
      case 'location':
        return <Building2 className="h-4 w-4 text-primary" />;
    }
  };

  const getTypeLabel = (type: Suggestion['type']) => {
    switch (type) {
      case 'specialty':
        return 'Specialitate';
      case 'network':
        return 'Rețea';
      case 'location':
        return 'Clinică';
    }
  };

  // Highlight matching text
  const highlightMatch = (text: string, query: string) => {
    if (!query || query.length < 2) return text;

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return text;

    return (
      <>
        {text.slice(0, index)}
        <span className="bg-primary/20 text-primary font-semibold rounded px-0.5">
          {text.slice(index, index + query.length)}
        </span>
        {text.slice(index + query.length)}
      </>
    );
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.length >= 2 && suggestions.length > 0 && setIsOpen(true)}
            onKeyDown={handleKeyDown}
            autoFocus={autoFocus}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="pl-12 pr-12 h-14 text-base rounded-2xl bg-white/80 backdrop-blur-sm border-white/50 shadow-lg focus:shadow-xl focus:border-primary/50 transition-all"
          />
          {loading && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary animate-spin" />
          )}
          {!loading && query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
                setIsOpen(false);
                inputRef.current?.focus();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </form>

      {/* Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-primary/10 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.id}`}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all",
                  selectedIndex === index
                    ? "bg-primary/10"
                    : "hover:bg-muted/50"
                )}
              >
                <div className={cn(
                  "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                  suggestion.type === 'specialty' && "bg-accent/10",
                  suggestion.type === 'network' && "bg-purple-500/10",
                  suggestion.type === 'location' && "bg-primary/10"
                )}>
                  {getIcon(suggestion.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {highlightMatch(suggestion.name, query)}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium",
                      suggestion.type === 'specialty' && "bg-accent/10 text-accent",
                      suggestion.type === 'network' && "bg-purple-500/10 text-purple-600",
                      suggestion.type === 'location' && "bg-primary/10 text-primary"
                    )}>
                      {getTypeLabel(suggestion.type)}
                    </span>
                    {suggestion.subtitle && (
                      <>
                        <span className="text-muted-foreground/50">•</span>
                        <span className="truncate">{suggestion.subtitle}</span>
                      </>
                    )}
                  </p>
                </div>
                <ArrowRight className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  selectedIndex === index && "translate-x-1 text-primary"
                )} />
              </button>
            ))}
          </div>

          {/* Search all results option */}
          <div className="border-t border-primary/10 p-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                router.push(`/search?query=${encodeURIComponent(query)}`);
              }}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-primary hover:bg-primary/5 transition-colors font-medium"
            >
              <Search className="h-4 w-4" />
              Caută "{query}" în toate rezultatele
            </button>
          </div>
        </div>
      )}

      {/* No results state */}
      {isOpen && query.length >= 2 && suggestions.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-primary/10 p-6 z-50 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-muted-foreground text-sm mb-3">
            Nu am găsit rezultate pentru "{query}"
          </p>
          <Button
            variant="soft"
            size="sm"
            onClick={() => {
              setIsOpen(false);
              router.push(`/search?query=${encodeURIComponent(query)}`);
            }}
          >
            Caută oricum
          </Button>
        </div>
      )}
    </div>
  );
}
