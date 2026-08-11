import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Nest Élance — Score ESG pour PMEs",
  description:
    "Votre score ESG en 5 minutes. Sans consultant, sans contrat annuel. Calcul, explication et amélioration continue de votre conformité CSRD.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
