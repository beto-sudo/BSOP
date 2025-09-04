// app/(app)/products/page.tsx
import ProductsClient from "./ui";

export const revalidate = 0;
export default function Page() {
  return <ProductsClient />;
}
