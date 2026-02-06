'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  MapPin,
  Building2,
  Stethoscope,
  Heart,
  Eye,
  Baby,
  FlaskConical,
  ChevronRight,
  Locate,
  Info,
  Map,
  Loader2,
  Activity,
  Sparkles,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const POPULAR_SPECIALTIES = [
  { name: 'Cardiologie', icon: Heart, slug: 'cardiologie', gradient: 'from-rose-500 to-pink-600' },
  { name: 'Oftalmologie', icon: Eye, slug: 'oftalmologie', gradient: 'from-cyan-500 to-blue-600' },
  { name: 'Ginecologie', icon: Baby, slug: 'obstetrica-ginecologie', gradient: 'from-purple-500 to-violet-600' },
  { name: 'Analize', icon: FlaskConical, slug: 'laborator', gradient: 'from-emerald-500 to-teal-600' },
];

const PROVIDER_TYPES = [
  { name: 'Clinici', type: 'clinic', icon: Building2, gradient: 'from-primary to-cyan-600' },
  { name: 'Laboratoare', type: 'paraclinic', icon: FlaskConical, gradient: 'from-violet-500 to-purple-600' },
  { name: 'Spitale', type: 'hospital', icon: Stethoscope, gradient: 'from-blue-500 to-indigo-600' },
];

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [locating, setLocating] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?query=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push('/search');
    }
  };

  const handleNearbySearch = () => {
    if (!navigator.geolocation) {
      alert('Geolocalizarea nu este suportată de browserul tău.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // Go to map view with user location
        router.push(`/map?lat=${latitude}&lng=${longitude}&radius=3`);
        setLocating(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Nu am putut obține locația. Verifică permisiunile browserului.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="px-4 pt-20 pb-6">
        <div className="max-w-lg mx-auto">
          {/* Logo/Brand */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-cyan-600 flex items-center justify-center shadow-lg shadow-primary/30">
                <Activity className="h-6 w-6 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-accent to-purple-500 rounded-full flex items-center justify-center">
                <Sparkles className="h-2.5 w-2.5 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text">FondCAS</h1>
              <p className="text-xs text-muted-foreground">Servicii medicale CNAS</p>
            </div>
          </div>

          {/* Headline */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Găsește clinici cu
              <span className="gradient-text"> fonduri disponibile</span>
            </h2>
            <p className="text-muted-foreground text-sm">
              Caută servicii medicale decontate de Casa de Asigurări
            </p>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Caută clinică, specialitate..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 text-base rounded-2xl bg-white/80 backdrop-blur-sm border-white/50 shadow-lg focus:shadow-xl focus:border-primary/50 transition-all"
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                size="lg"
                className="flex-1 rounded-2xl text-base"
              >
                <Search className="h-5 w-5 mr-2" />
                Caută
              </Button>

              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleNearbySearch}
                disabled={locating}
                className="rounded-2xl px-4"
                title="Găsește în apropierea mea"
              >
                {locating ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Locate className="h-5 w-5" />
                )}
              </Button>

              <Link href="/map">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="rounded-2xl px-4"
                  title="Vezi pe hartă"
                >
                  <Map className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </form>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="px-4 py-4">
        <div className="max-w-lg mx-auto flex gap-3">
          <Card
            className="flex-1 overflow-hidden cursor-pointer hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-primary to-cyan-600"
            onClick={handleNearbySearch}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                {locating ? (
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                ) : (
                  <Locate className="h-6 w-6 text-white" />
                )}
              </div>
              <div className="text-white">
                <p className="font-semibold">Lângă mine</p>
                <p className="text-sm text-white/80">Caută în zonă</p>
              </div>
            </CardContent>
          </Card>

          <Link href="/map" className="flex-1">
            <Card className="h-full overflow-hidden cursor-pointer hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-accent to-purple-600">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Map className="h-6 w-6 text-white" />
                </div>
                <div className="text-white">
                  <p className="font-semibold">Hartă</p>
                  <p className="text-sm text-white/80">Vezi toate</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      {/* Quick Specialty Search */}
      <section className="px-4 py-6">
        <div className="max-w-lg mx-auto">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            Specialități populare
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {POPULAR_SPECIALTIES.map((spec) => (
              <Link key={spec.slug} href={`/search?specialty=${spec.slug}`}>
                <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group bg-white/80 backdrop-blur-sm border-white/50 hover:border-primary/30">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${spec.gradient} shadow-lg group-hover:scale-110 transition-transform`}>
                      <spec.icon className="h-5 w-5 text-white" />
                    </div>
                    <span className="font-medium text-foreground">{spec.name}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Provider Types */}
      <section className="px-4 py-6">
        <div className="max-w-lg mx-auto">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Tipuri de furnizori
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
            {PROVIDER_TYPES.map((type) => (
              <Link key={type.type} href={`/search?type=${type.type}`} className="flex-shrink-0">
                <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer w-32 bg-white/80 backdrop-blur-sm border-white/50 hover:border-primary/30 group">
                  <CardContent className="p-4 text-center">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${type.gradient} flex items-center justify-center mx-auto mb-3 shadow-lg group-hover:scale-110 transition-transform`}>
                      <type.icon className="h-7 w-7 text-white" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{type.name}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Networks Section */}
      <section className="px-4 py-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Shield className="h-5 w-5 text-accent" />
              Rețele medicale
            </h2>
            <Link href="/search?network=true" className="text-sm text-primary font-medium hover:underline">
              Vezi toate
            </Link>
          </div>
          <Link href="/search?network=true">
            <Card className="overflow-hidden bg-gradient-to-r from-accent/10 via-purple-500/10 to-primary/10 border-accent/20 hover:shadow-lg transition-all duration-300 cursor-pointer group">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 bg-gradient-to-br from-accent to-purple-600 rounded-2xl shadow-lg shadow-accent/30 group-hover:scale-110 transition-transform">
                    <Building2 className="h-8 w-8 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">MedLife, Regina Maria, SANADOR</h3>
                    <p className="text-sm text-muted-foreground">și alte rețele cu multiple locații</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      {/* Info Banner */}
      <section className="px-4 py-6 pb-24">
        <div className="max-w-lg mx-auto">
          <Card className="overflow-hidden bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-300/30">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex-shrink-0">
                  <Info className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground mb-1">
                    Informație importantă
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Disponibilitatea fondurilor este o <strong className="text-foreground">estimare</strong>.
                    Contactează clinica telefonic pentru confirmare.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
