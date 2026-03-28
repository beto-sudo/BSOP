import { LoginCard } from './login-card';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return <LoginCard unauthorized={params.error === 'unauthorized'} />;
}
