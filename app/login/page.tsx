import { LoginCard } from './login-card';

/**
 * @module Login
 * @responsive responsive
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return <LoginCard unauthorized={params.error === 'unauthorized'} />;
}
