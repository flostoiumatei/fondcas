import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { BottomNav } from '@/components/layout/bottom-nav';
import { AnimatedBackground } from '@/components/layout/animated-background';
import { AccessibilityProvider, AccessibilityControls } from '@/components/accessibility-provider';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'FondCAS - Găsește Clinici cu Fonduri CNAS',
  description:
    'Găsește clinici și furnizori medicali care lucrează cu CNAS și verifică disponibilitatea fondurilor. Servicii medicale gratuite în România.',
  keywords: [
    'CNAS',
    'CAS',
    'clinici',
    'fonduri',
    'asigurare sănătate',
    'România',
    'servicii medicale gratuite',
    'analize',
    'laborator',
  ],
  authors: [{ name: 'FondCAS' }],
  creator: 'FondCAS',
  openGraph: {
    type: 'website',
    locale: 'ro_RO',
    url: 'https://fondcas.ro',
    siteName: 'FondCAS',
    title: 'FondCAS - Găsește Clinici cu Fonduri CNAS',
    description:
      'Găsește clinici și furnizori medicali care lucrează cu CNAS și verifică disponibilitatea fondurilor.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FondCAS - Găsește Clinici cu Fonduri CNAS',
    description: 'Găsește clinici și furnizori medicali care lucrează cu CNAS.',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FondCAS',
  },
  formatDetection: {
    telephone: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0891B2',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro" className={inter.variable}>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Leaflet CSS for maps */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="min-h-screen font-sans antialiased overflow-x-hidden">
        <AccessibilityProvider>
          <AnimatedBackground />
          <main className="relative pb-20 safe-bottom">{children}</main>
          <BottomNav />
          <AccessibilityControls />
        </AccessibilityProvider>
      </body>
    </html>
  );
}
