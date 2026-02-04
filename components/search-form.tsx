'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, MapPin, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect, SearchableSelectOption } from '@/components/ui/searchable-select';
import { cn } from '@/lib/utils';
import { PROVIDER_TYPE_LABELS } from '@/lib/types';

interface Specialty {
  id: string;
  name: string;
  category?: string;
}

interface SearchFormProps {
  compact?: boolean;
  className?: string;
  onSearch?: (params: SearchParams) => void;
}

interface SearchParams {
  query: string;
  county: string;
  type: string;
  specialty: string;
}

const COUNTIES = [
  { code: 'B', name: 'București' },
  { code: 'CJ', name: 'Cluj' },
  { code: 'TM', name: 'Timiș' },
  { code: 'IS', name: 'Iași' },
  { code: 'CT', name: 'Constanța' },
  { code: 'BV', name: 'Brașov' },
  { code: 'DJ', name: 'Dolj' },
  { code: 'GL', name: 'Galați' },
  { code: 'SB', name: 'Sibiu' },
  { code: 'AB', name: 'Alba' },
  { code: 'AR', name: 'Arad' },
  { code: 'AG', name: 'Argeș' },
  { code: 'BC', name: 'Bacău' },
  { code: 'BH', name: 'Bihor' },
  { code: 'BN', name: 'Bistrița-Năsăud' },
  { code: 'BT', name: 'Botoșani' },
  { code: 'BR', name: 'Brăila' },
  { code: 'BZ', name: 'Buzău' },
  { code: 'CS', name: 'Caraș-Severin' },
  { code: 'CL', name: 'Călărași' },
  { code: 'CV', name: 'Covasna' },
  { code: 'DB', name: 'Dâmbovița' },
  { code: 'GR', name: 'Giurgiu' },
  { code: 'GJ', name: 'Gorj' },
  { code: 'HR', name: 'Harghita' },
  { code: 'HD', name: 'Hunedoara' },
  { code: 'IL', name: 'Ialomița' },
  { code: 'IF', name: 'Ilfov' },
  { code: 'MM', name: 'Maramureș' },
  { code: 'MH', name: 'Mehedinți' },
  { code: 'MS', name: 'Mureș' },
  { code: 'NT', name: 'Neamț' },
  { code: 'OT', name: 'Olt' },
  { code: 'PH', name: 'Prahova' },
  { code: 'SM', name: 'Satu Mare' },
  { code: 'SJ', name: 'Sălaj' },
  { code: 'SV', name: 'Suceava' },
  { code: 'TR', name: 'Teleorman' },
  { code: 'TL', name: 'Tulcea' },
  { code: 'VS', name: 'Vaslui' },
  { code: 'VL', name: 'Vâlcea' },
  { code: 'VN', name: 'Vrancea' },
];

// Common specialties shown first (most searched)
const COMMON_SPECIALTIES = [
  'cardiologie',
  'oftalmologie',
  'otorinolaringologie',
  'dermatovenerologie',
  'obstetrica-ginecologie',
  'neurologie',
  'ortopedie si traumatologie',
  'medicina interna',
  'endocrinologie',
  'gastroenterologie',
];

// Convert counties to searchable options
const COUNTY_OPTIONS: SearchableSelectOption[] = [
  { value: '', label: 'Toate județele' },
  ...COUNTIES.map(c => ({ value: c.code, label: c.name }))
];

// Convert provider types to searchable options
const TYPE_OPTIONS: SearchableSelectOption[] = [
  { value: '', label: 'Toate tipurile' },
  ...Object.entries(PROVIDER_TYPE_LABELS).map(([value, label]) => ({ value, label }))
];

export function SearchForm({ compact = false, className, onSearch }: SearchFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('query') || '');
  const [county, setCounty] = useState(searchParams.get('county') || '');
  const [type, setType] = useState(searchParams.get('type') || '');
  const [specialty, setSpecialty] = useState(searchParams.get('specialty') || '');
  const [showFilters, setShowFilters] = useState(!compact);
  const [isLocating, setIsLocating] = useState(false);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loadingSpecialties, setLoadingSpecialties] = useState(false);

  // Load specialties from API
  useEffect(() => {
    const fetchSpecialties = async () => {
      setLoadingSpecialties(true);
      try {
        const response = await fetch('/api/specialties');
        const data = await response.json();
        if (data.specialties) {
          // Sort: common specialties first, then alphabetically
          const sorted = data.specialties.sort((a: Specialty, b: Specialty) => {
            const aIsCommon = COMMON_SPECIALTIES.includes(a.name);
            const bIsCommon = COMMON_SPECIALTIES.includes(b.name);
            if (aIsCommon && !bIsCommon) return -1;
            if (!aIsCommon && bIsCommon) return 1;
            return a.name.localeCompare(b.name, 'ro');
          });
          setSpecialties(sorted);
        }
      } catch (error) {
        console.error('Failed to load specialties:', error);
      } finally {
        setLoadingSpecialties(false);
      }
    };
    fetchSpecialties();
  }, []);

  // Convert specialties to searchable options
  const specialtyOptions: SearchableSelectOption[] = useMemo(() => {
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return [
      { value: '', label: 'Toate specialitățile' },
      ...specialties.map(s => ({ value: s.name, label: capitalize(s.name) }))
    ];
  }, [specialties]);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (county) params.set('county', county);
    if (type) params.set('type', type);
    if (specialty) params.set('specialty', specialty);

    if (onSearch) {
      onSearch({ query, county, type, specialty });
    } else {
      router.push(`/search?${params.toString()}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleLocationSearch = () => {
    if (!navigator.geolocation) {
      alert('Geolocalizarea nu este suportată de browserul tău.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const params = new URLSearchParams();
        params.set('lat', position.coords.latitude.toString());
        params.set('lng', position.coords.longitude.toString());
        params.set('radius', '10');
        if (type) params.set('type', type);
        if (specialty) params.set('specialty', specialty);
        router.push(`/search?${params.toString()}`);
        setIsLocating(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Nu am putut obține locația. Verifică setările browserului.');
        setIsLocating(false);
      }
    );
  };

  const clearFilters = () => {
    setQuery('');
    setCounty('');
    setType('');
    setSpecialty('');
  };

  const hasFilters = query || county || type || specialty;
  const activeFilterCount = [county, type, specialty].filter(Boolean).length;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Main search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Caută clinică, laborator, serviciu..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-10 pr-10"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-accent"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Compact mode toggle */}
      {compact && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="flex-1"
          >
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filtre
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLocationSearch}
            disabled={isLocating}
          >
            <MapPin className="h-4 w-4 mr-2" />
            {isLocating ? 'Se caută...' : 'Lângă mine'}
          </Button>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="space-y-3">
          {/* County - searchable */}
          <SearchableSelect
            options={COUNTY_OPTIONS}
            value={county}
            onValueChange={setCounty}
            placeholder="Toate județele"
            searchPlaceholder="Caută județ..."
            emptyText="Niciun județ găsit."
          />

          {/* Provider type - searchable */}
          <SearchableSelect
            options={TYPE_OPTIONS}
            value={type}
            onValueChange={setType}
            placeholder="Toate tipurile"
            searchPlaceholder="Caută tip..."
            emptyText="Niciun tip găsit."
          />

          {/* Specialty - searchable */}
          <SearchableSelect
            options={specialtyOptions}
            value={specialty}
            onValueChange={setSpecialty}
            placeholder={loadingSpecialties ? "Se încarcă..." : "Toate specialitățile"}
            searchPlaceholder="Caută specialitate..."
            emptyText="Nicio specialitate găsită."
            disabled={loadingSpecialties}
          />

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button onClick={handleSearch} className="flex-1">
              <Search className="h-4 w-4 mr-2" />
              Caută
            </Button>
            {hasFilters && (
              <Button variant="outline" onClick={clearFilters}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {!compact && (
            <Button
              variant="outline"
              onClick={handleLocationSearch}
              disabled={isLocating}
              className="w-full"
            >
              <MapPin className="h-4 w-4 mr-2" />
              {isLocating ? 'Se caută locația...' : 'Caută lângă mine'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
