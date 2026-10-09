import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Private Assistant Toolkit - WP',
  description: "Develop a custom assistant"
}

export default function AssistantLoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
