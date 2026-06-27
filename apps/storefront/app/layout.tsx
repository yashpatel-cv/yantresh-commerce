import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { readStorefrontRequestState } from "./storefront-request";

export const metadata: Metadata = {
  title: "Yantresh Commerce Storefront",
  description: "Shared multi-tenant storefront for Yantresh Commerce."
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const { tenantStyle } = await readStorefrontRequestState();

  return (
    <html lang="en" style={tenantStyle}>
      <body>{children}</body>
    </html>
  );
}
