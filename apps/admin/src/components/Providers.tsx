'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@carq/ui';

/**
 * `SessionProvider` **مش هنا** عن قصد — ده wrapper عالمي بيغلف حتى
 * `/login`. `SessionProvider` نفسه متحط جوه `(dash)/layout.tsx` بس
 * (المسارات المحمية فعلًا) — راجع التعليق هناك.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // الداشبورد دي كلها polling/refetch — الكاش القصير هو الصح
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
