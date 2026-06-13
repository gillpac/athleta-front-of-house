import type { Metadata } from 'next'
import { Nunito } from 'next/font/google'

const nunito = Nunito({
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
        className={nunito.className}
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: '#F6F3EE',
          color: '#17130E',
          fontFamily: "'Nunito', system-ui, sans-serif",
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  )
}
