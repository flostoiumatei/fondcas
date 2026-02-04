'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MapPin,
  Phone,
  Globe,
  Mail,
  Navigation,
  Building2,
  Network,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  Stethoscope
} from 'lucide-react';
import { cn, formatPhone, getTelLink, getDirectionsUrl, getGoogleMapsSearchUrl } from '@/lib/utils';
import { PROVIDER_TYPE_LABELS } from '@/lib/types';

const LocationMap = dynamic(() => import('@/components/provider-map'), {
  ssr: false,
  loading: () => (
    <div className="h-[200px] w-full bg-white/60 backdrop-blur-sm animate-pulse rounded-xl flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Se încarcă harta...</p>
    </div>
  ),
});

interface Location {
  id: string;
  name: string;
  address?: string;
  address_simple?: string;
  city?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  email?: string;
  website?: string;
  source: string;
  confidence: number;
  is_primary: boolean;
  organization?: {
    id: string;
    legal_name: string;
    cui?: string;
    is_network: boolean;
    network_brand?: string;
    network_website?: string;
    provider_type: string;
    data_source_date?: string;
  };
  county?: {
    id: string;
    code: string;
    name: string;
  };
}

interface PageProps {
  params: { id: string };
}

export default function ClinicPage({ params }: PageProps) {
  const { id } = params;
  const [location, setLocation] = useState<Location | null>(null);
  const [siblingLocations, setSiblingLocations] = useState<Location[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchLocation();
  }, [id]);

  const fetchLocation = async () => {
    try {
      const response = await fetch(`/api/locations/${id}`);
      const data = await response.json();
      if (data.location) {
        setLocation(data.location);
        if (data.siblingLocations) {
          setSiblingLocations(data.siblingLocations);
        }
        if (data.specialties) {
          setSpecialties(data.specialties);
        }
      }
    } catch (error) {
      console.error('Error fetching location:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyAddress = () => {
    if (location?.address) {
      navigator.clipboard.writeText(location.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Se încarcă..." showBack backHref="/search" />
        <div className="p-4 space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-[200px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="min-h-screen">
        <Header title="Negăsit" showBack backHref="/search" />
        <div className="p-4 text-center py-12">
          <div className="w-16 h-16 bg-white/60 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 border border-border/30">
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="font-semibold text-foreground mb-2">Locație negăsită</h2>
          <p className="text-muted-foreground mb-4">Nu am putut găsi această locație.</p>
          <Link href="/search">
            <Button className="btn-gradient">Înapoi la căutare</Button>
          </Link>
        </div>
      </div>
    );
  }

  const org = location.organization;
  const typeLabel = org ? PROVIDER_TYPE_LABELS[org.provider_type as keyof typeof PROVIDER_TYPE_LABELS] : 'Clinică';
  const displayName = location.name || org?.network_brand || org?.legal_name || 'Locație';
  const isNetwork = org?.is_network;

  return (
    <div className="min-h-screen pb-24">
      <Header title={displayName} showBack backHref="/search" />

      <div className="p-4 space-y-4">
        {/* Network Banner */}
        {isNetwork && org?.network_brand && (
          <Card className="bg-gradient-to-r from-accent/10 via-purple-500/10 to-primary/10 border-accent/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/80 backdrop-blur-sm rounded-xl shadow-sm">
                  <Network className="h-6 w-6 text-accent" />
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-foreground">{org.network_brand}</h2>
                  <p className="text-sm text-muted-foreground">
                    Rețea cu {siblingLocations.length + 1} locații
                  </p>
                </div>
                {org.network_website && (
                  <a
                    href={org.network_website.startsWith('http') ? org.network_website : `https://${org.network_website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm" variant="outline" className="border-accent/30 bg-white/60">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Info Card */}
        <Card className="bg-white/80 backdrop-blur-sm border-white/50">
          <CardContent className="p-5">
            {/* Header */}
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Building2 className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-foreground leading-tight mb-2">
                  {displayName}
                </h1>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-secondary/60">{typeLabel}</Badge>
                  {location.source === 'cnas' ? (
                    <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border border-emerald-500/20">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Date CNAS
                    </Badge>
                  ) : location.confidence >= 80 ? (
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Verificat
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border border-amber-500/20">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      De verificat
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Legal Entity */}
            {org && displayName !== org.legal_name && (
              <p className="text-sm text-muted-foreground mb-4 pb-4 border-b border-border/50">
                Entitate juridică: <span className="font-medium text-foreground">{org.legal_name}</span>
                {org.cui && <span className="text-muted-foreground/60"> · CUI: {org.cui}</span>}
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 mb-5">
              {location.phone && (
                <a href={getTelLink(location.phone)} className="flex-1">
                  <Button className="w-full h-12 text-base rounded-xl btn-gradient">
                    <Phone className="h-5 w-5 mr-2" />
                    Sună acum
                  </Button>
                </a>
              )}
              {(location.lat && location.lng) && (
                <a
                  href={getDirectionsUrl(location.lat, location.lng, displayName, location.address, location.address_simple)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={location.phone ? '' : 'flex-1'}
                >
                  <Button variant="outline" className={cn("h-12 rounded-xl bg-white/60 border-white/50 hover:border-primary/30", !location.phone && "w-full")}>
                    <Navigation className="h-5 w-5 mr-2" />
                    Direcții
                  </Button>
                </a>
              )}
            </div>

            {/* Contact Details */}
            <div className="space-y-3">
              {location.address && (
                <div className="flex items-start gap-3 group">
                  <MapPin className="h-5 w-5 text-primary/60 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-foreground">{location.address}</p>
                    {location.city && (
                      <p className="text-sm text-muted-foreground">
                        {location.city}{location.county && `, ${location.county.name}`}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={copyAddress}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              )}

              {location.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-primary/60" />
                  <a href={getTelLink(location.phone)} className="text-primary font-medium">
                    {formatPhone(location.phone)}
                  </a>
                </div>
              )}

              {location.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-primary/60" />
                  <a href={`mailto:${location.email}`} className="text-primary">
                    {location.email}
                  </a>
                </div>
              )}

              {location.website && (
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-primary/60" />
                  <a
                    href={location.website.startsWith('http') ? location.website : `https://${location.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary"
                  >
                    {location.website.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Specialties */}
        {specialties.length > 0 && (
          <Card className="bg-white/80 backdrop-blur-sm border-white/50">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-gradient-to-br from-primary/20 to-cyan-500/20 rounded-xl">
                  <Stethoscope className="h-5 w-5 text-primary" />
                </div>
                <h2 className="font-semibold text-foreground">Specialități medicale</h2>
                <Badge variant="secondary" className="ml-auto bg-primary/10 text-primary">
                  {specialties.length}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {specialties.map((specialty, index) => (
                  <Link
                    key={index}
                    href={`/search?specialty=${encodeURIComponent(specialty)}`}
                    className="group"
                  >
                    <Badge
                      className="px-3 py-1.5 bg-gradient-to-r from-primary/5 to-cyan-500/5 text-foreground border border-primary/20 hover:border-primary/40 hover:from-primary/10 hover:to-cyan-500/10 transition-all cursor-pointer capitalize"
                    >
                      {specialty}
                    </Badge>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Map */}
        <Card className="overflow-hidden bg-white/80 backdrop-blur-sm border-white/50">
          <CardContent className="p-0">
            {location.lat && location.lng ? (
              <>
                <LocationMap
                  lat={location.lat}
                  lng={location.lng}
                  name={displayName}
                  address={location.address}
                />
                <div className="p-3 border-t border-border/50">
                  <a
                    href={getDirectionsUrl(location.lat, location.lng, displayName, location.address, location.address_simple)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" className="w-full bg-white/60 border-white/50 hover:border-primary/30">
                      <Navigation className="h-4 w-4 mr-2" />
                      Deschide în Google Maps
                    </Button>
                  </a>
                </div>
              </>
            ) : (
              <div className="p-5 text-center">
                <div className="w-12 h-12 bg-white/60 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-3 border border-border/30">
                  <MapPin className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Nu avem coordonatele exacte pentru această locație
                </p>
                <a
                  href={getGoogleMapsSearchUrl(displayName, location.address, location.city)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="bg-white/60 border-white/50">
                    Caută pe Google Maps
                  </Button>
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sibling Locations (for networks) */}
        {siblingLocations.length > 0 && (
          <Card className="bg-white/80 backdrop-blur-sm border-white/50">
            <CardContent className="p-4">
              <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Network className="h-5 w-5 text-accent" />
                Alte locații {org?.network_brand}
              </h2>
              <div className="space-y-2">
                {siblingLocations.slice(0, 5).map((sib) => (
                  <Link key={sib.id} href={`/clinic/${sib.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 hover:bg-white/60 hover:border-primary/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{sib.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {sib.city}{sib.county && `, ${sib.county.name}`}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Link>
                ))}
                {siblingLocations.length > 5 && (
                  <Link href={`/search?network=true&query=${encodeURIComponent(org?.network_brand || '')}`}>
                    <Button variant="ghost" size="sm" className="w-full mt-2">
                      Vezi toate cele {siblingLocations.length} locații
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data Source Info */}
        <Card className="bg-white/40 backdrop-blur-sm border-border/30">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">Sursa datelor: </span>
              {location.source === 'cnas' ? 'CNAS (date oficiale)' : 'Descoperit prin AI'}
              {org?.data_source_date && (
                <> · Actualizat: {new Date(org.data_source_date).toLocaleDateString('ro-RO')}</>
              )}
            </p>
            <p className="text-xs text-amber-600/80">
              Adresa și locația pe hartă sunt informative. Vă rugăm verificați adresa înainte de a vă deplasa.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
