import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const signedIn = request.cookies.has('__Host-bpn-admin-session') || request.cookies.has('bpn-admin-session');
  if (request.nextUrl.pathname.startsWith('/admin') && !signedIn) return NextResponse.redirect(new URL('/login', request.url));
  if (request.nextUrl.pathname === '/login' && signedIn) return NextResponse.redirect(new URL('/admin', request.url));
}

export const config = { matcher: ['/admin/:path*', '/login'] };
