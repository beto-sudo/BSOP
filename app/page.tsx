import { redirect } from 'next/navigation';

/**
 * @module Root (redirect)
 * @responsive responsive
 */
export default function HomePage() {
  redirect('/inicio');
}
