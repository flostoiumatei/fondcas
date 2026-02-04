import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import {
  Heart,
  Database,
  Users,
  Shield,
  ExternalLink,
  Stethoscope,
  Building2,
  Network,
  Activity,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="min-h-screen pb-24">
      <Header title="Despre" showBack backHref="/" />

      <div className="p-4 space-y-4">
        {/* Hero */}
        <Card className="bg-gradient-to-br from-primary/10 via-cyan-500/10 to-accent/10 border-primary/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                <div className="p-2.5 bg-gradient-to-br from-primary to-cyan-600 rounded-xl shadow-lg shadow-primary/30">
                  <Activity className="h-6 w-6 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-accent to-purple-500 rounded-full flex items-center justify-center">
                  <Sparkles className="h-2.5 w-2.5 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold gradient-text">FondCAS</h1>
                <p className="text-sm text-muted-foreground">Servicii medicale CNAS</p>
              </div>
            </div>
            <p className="text-foreground/80 leading-relaxed">
              FondCAS te ajută să găsești <strong className="text-foreground">clinici și furnizori medicali</strong> care
              lucrează cu Casa Națională de Asigurări de Sănătate (CNAS), astfel încât să poți
              beneficia de servicii medicale <strong className="text-foreground">decontate</strong>.
            </p>
          </CardContent>
        </Card>

        {/* Mission */}
        <Card className="bg-white/80 backdrop-blur-sm border-white/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="h-5 w-5 text-rose-500" />
              <h2 className="font-semibold text-foreground">De ce FondCAS?</h2>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Mulți români nu știu că pot accesa <strong className="text-foreground">servicii medicale gratuite</strong> la
                clinici private, nu doar la spitalele de stat, prin asigurarea de sănătate.
              </p>
              <p>
                Problema? Fondurile alocate lunar se <strong className="text-foreground">epuizează rapid</strong>, mai ales
                spre sfârșitul lunii. FondCAS te ajută să găsești unde mai sunt fonduri.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <Card className="bg-white/80 backdrop-blur-sm border-white/50">
          <CardContent className="p-5">
            <h2 className="font-semibold text-foreground mb-4">Ce oferim</h2>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="p-2 bg-accent/10 rounded-xl h-fit">
                  <Network className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">Rețele medicale</h3>
                  <p className="text-sm text-muted-foreground">
                    MedLife, Regina Maria, SANADOR și alte rețele cu toate locațiile lor
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-xl h-fit">
                  <Building2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">Clinici individuale</h3>
                  <p className="text-sm text-muted-foreground">
                    Cabinete medicale și clinici de specialitate din toată țara
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="p-2 bg-primary/10 rounded-xl h-fit">
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">Date oficiale CNAS</h3>
                  <p className="text-sm text-muted-foreground">
                    Informații actualizate din sursele oficiale ale Casei de Asigurări
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-300/30">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-amber-600" />
              <h2 className="font-semibold text-foreground">Disclaimer</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Disponibilitatea fondurilor este o <strong className="text-foreground">estimare</strong> bazată pe date publice.
              Te rugăm să <strong className="text-foreground">contactezi clinica telefonic</strong> pentru confirmare înainte
              de programare.
            </p>
          </CardContent>
        </Card>

        {/* Data Sources */}
        <Card className="bg-white/80 backdrop-blur-sm border-white/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Database className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">Surse de date</h2>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                Liste furnizori CNAS (actualizate lunar)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                Alocări bugetare CAS județene
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                Descoperire locații prin AI
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center py-4 text-xs text-muted-foreground/60">
          <p>FondCAS v2.0</p>
          <p className="mt-1">Construit cu date publice CNAS</p>
        </div>
      </div>
    </div>
  );
}
