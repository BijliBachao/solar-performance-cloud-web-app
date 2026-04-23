import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

const SITE_URL = 'https://spc.bijlibachao.pk'
const SITE_NAME = 'Solar Performance Cloud'
const HEADLINE = 'Detect underperforming solar strings before they cost you money'
const DESCRIPTION = 'Pakistan\'s first string-level solar monitoring. Our engineers install a compact monitoring device at your plant — live data every 5 minutes across Huawei, Solis, Growatt, and Sungrow inverters. A Product of Bijli Bachao.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: `${SITE_NAME} — ${HEADLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,

  keywords: [
    'solar monitoring Pakistan',
    'PV string monitoring',
    'commercial solar Pakistan',
    'industrial solar monitoring',
    'Huawei FusionSolar alternative',
    'SolisCloud monitoring',
    'Growatt monitoring',
    'Sungrow iSolarCloud',
    'IEC 61724',
    'IEC 62446',
    'Bijli Bachao',
    'solar fault detection',
    'rooftop solar Lahore',
    'solar O&M Pakistan',
  ],

  authors: [{ name: 'Engr. Reyyan Niaz Khan', url: 'https://bijlibachao.pk' }],
  creator: 'BijliBachao.pk',
  publisher: 'BijliBachao.pk',
  applicationName: SITE_NAME,
  category: 'Solar Energy Monitoring',

  openGraph: {
    type: 'website',
    locale: 'en_PK',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: HEADLINE,
    description: DESCRIPTION,
    // opengraph-image.tsx in app/ auto-populates og:image
  },

  twitter: {
    card: 'summary_large_image',
    title: HEADLINE,
    description: 'Pakistan\'s first string-level solar monitoring · Engineer-installed · Huawei · Solis · Growatt · Sungrow · Live every 5 min. By Bijli Bachao.',
    creator: '@BijliBachaoPk',
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  alternates: {
    canonical: SITE_URL,
  },

  icons: {
    icon: '/favicon.ico',
  },

  formatDetection: {
    telephone: true,
    email: true,
    address: true,
  },
}

export const viewport: Viewport = {
  themeColor: '#F8F7F6',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className={`${inter.className} h-full`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
