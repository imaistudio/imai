// app/providers.tsx

import {HeroUIProvider} from '@heroui/react'
import {ToastProvider} from "@heroui/toast";
import React, { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <HeroUIProvider>
      <ToastProvider />
      {children}
    </HeroUIProvider>
  )
}