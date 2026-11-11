import type { Metadata } from 'next';
import { AuthForm } from './auth-form';

export const metadata: Metadata = { title: 'Account | BackpageNew' };

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const formMode = mode === 'signup' || mode === 'reset' ? mode : 'login';

  return <AuthForm key={formMode} mode={formMode} />;
}
