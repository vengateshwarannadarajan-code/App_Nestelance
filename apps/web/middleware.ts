import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let API routes through
  if (pathname.startsWith('/api')) return NextResponse.next()
  // Let Next.js internals through
  if (pathname.startsWith('/_next')) return NextResponse.next()
  // Let the coming soon page serve itself
  if (pathname === '/coming-soon.html') return NextResponse.next()
  // Let static assets through
  if (pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|woff|woff2|ttf)$/)) return NextResponse.next()

  // Rewrite everything else to the coming soon page
  return NextResponse.rewrite(new URL('/coming-soon.html', request.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
