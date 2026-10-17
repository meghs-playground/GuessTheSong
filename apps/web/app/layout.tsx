import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Noto_Sans_Devanagari } from 'next/font/google'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
  display: 'swap',
})

const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  variable: '--font-devanagari',
  display: 'swap',
  weight: ['400', '700'],
})

export const metadata: Metadata = {
  title: 'Dhun – Guess the Bollywood Song',
  description: 'Hear a tiny clip. Guess the Bollywood song. Play endlessly.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Dhun',
  },
  icons: {
    icon: '/icon-512.svg',
    apple: '/icon-192.svg',
  },
  openGraph: {
    title: 'Dhun – Bollywood Heardle',
    description: 'Hear a tiny clip. Guess the Bollywood song. Play endlessly.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${notoDevanagari.variable}`}>
      <body className="font-[var(--font-space)]">{children}</body>
    </html>
  )
}
