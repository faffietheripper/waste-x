import type { Metadata } from "next";
import { Inter as FontSans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Providers from "@/components/Providers";
import { ErrorProvider } from "@/components/providers/error-provider";
import { GlobalError } from "@/components/ui/global-error";

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.wastextracking.com"),

  title: {
    default: "Waste X | Digital Waste Tracking Platform UK",
    template: "%s | Waste X",
  },

  description:
    "Waste X is a digital waste tracking platform for the UK construction and waste industry. Manage waste transfers, verify carriers, and maintain full compliance with emerging regulations.",

  keywords: [
    "waste tracking UK",
    "digital waste tracking",
    "construction waste management",
    "waste compliance software",
    "waste transfer notes UK",
    "licensed waste carriers",
    "waste audit system",
  ],

  authors: [{ name: "Waste X" }],
  creator: "Waste X",

  openGraph: {
    title: "Waste X | Digital Waste Tracking Platform",
    description:
      "Track, manage, and verify waste movement across the UK. Built for construction, waste carriers, and compliance.",
    url: "https://www.wastextracking.com",
    siteName: "Waste X",
    images: [
      {
        url: "/wastex.png",
        width: 1200,
        height: 630,
        alt: "Waste X Platform",
      },
    ],
    locale: "en_GB",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "Waste X | Digital Waste Tracking",
    description:
      "Digital infrastructure for waste tracking and compliance in the UK.",
    images: ["/og-image.png"],
  },

  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={cn("font-sans antialiased", fontSans.variable)}>
        <Providers>
          <ErrorProvider>
            {children}
            <GlobalError />
          </ErrorProvider>
        </Providers>
      </body>
    </html>
  );
}
