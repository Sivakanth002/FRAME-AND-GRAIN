import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0B0A09',
  colorScheme: 'dark',
};

export const metadata: Metadata = {
  title: 'FRAME & GRAIN — Find the Film Worth Your Time',
  description: 'A thoughtful film discovery experience. Explore a living archive of cinema, tuned to your mood and streaming access.',
  applicationName: 'Frame & Grain',
  authors: [{ name: 'Frame & Grain Team' }],
  keywords: ['film discovery', 'cinema archive', 'movie recommendations', 'streaming guide', 'mood discovery', 'cinema lens'],
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
  openGraph: {
    title: 'FRAME & GRAIN — Find the Film Worth Your Time',
    description: 'A thoughtful film discovery experience. Explore a living archive of cinema, tuned to your mood and streaming access.',
    type: 'website',
    locale: 'en_US',
    siteName: 'Frame & Grain',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FRAME & GRAIN — Find the Film Worth Your Time',
    description: 'A thoughtful film discovery experience. Explore a living archive of cinema, tuned to your mood and streaming access.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Josefin+Sans:wght@300;400;500;600&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div id="app-root">{children}</div>
      </body>
    </html>
  );
}
