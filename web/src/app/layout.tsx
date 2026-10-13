import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Manrope, Sora } from "next/font/google";
import "./globals.css";

// Three roles, three families (DECISIONS D-048). Sora and Manrope are variable
// fonts: one file each covers every weight the site uses.

// Display: wide geometric sans with round bowls, for headlines and the wordmark.
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
});

// Text: geometric but quieter than the display, comfortable at 15-17px.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

// Figures and labels. Static weights (not variable): 400 and 500 are the only
// ones the UI uses.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const TITLE = "PROFI | Conditional protection and premium, fully funded";
const DESCRIPTION =
  "PROFI is a structured-finance platform on Robinhood Chain. Asset owners buy conditional protection; stablecoin holders earn conditional premium. Testnet / mock data, not live, not audited.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: { default: TITLE, template: "%s | PROFI" },
  description: DESCRIPTION,
  applicationName: "PROFI",
  openGraph: {
    type: "website",
    siteName: "PROFI",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${manrope.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:border focus:border-pulse focus:bg-ground-3 focus:px-4 focus:py-2 focus:text-sm focus:text-ink-1"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
