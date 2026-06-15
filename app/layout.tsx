import type { Metadata } from 'next'
import { Nunito_Sans } from 'next/font/google'

const nunitoSans = Nunito_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Athleta Front of House',
  description: 'Lead, trial, sales & retention system for Athleta Gymnastics',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-AU">
      <body
        className={nunitoSans.className}
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: '#f6f4f1',
          color: '#4a453f',
          fontFamily: "'Nunito Sans', -apple-system, system-ui, sans-serif",
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  )
}
