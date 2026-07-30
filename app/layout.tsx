import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import DevChat from "@/components/DevChat";
import FallbackBanner from "@/components/FallbackBanner";
import RepSubNav from "@/components/RepSubNav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Network — MLE",
  description: "Every person is revenue plus doors. Light the nodes.",
};

const nav = [
  { href: "/", label: "Overview" },
  { href: "/network", label: "Network" },
  { href: "/companies", label: "Companies" },
  { href: "/people", label: "People" },
  { href: "/deals", label: "Deals" },
  { href: "/rep", label: "Rep View" },
  { href: "/booker", label: "Booker" },
  { href: "/projects", label: "Projects" },
  { href: "/ops", label: "Ops" },
  { href: "/training", label: "Training" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen starfield`}
      >
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b14]/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_12px_2px_rgba(251,191,36,0.8)]" />
              <span className="text-sm font-semibold tracking-wide text-white">
                THE NETWORK
              </span>
            </Link>
            {/* min-w-0 lets this flex item actually shrink so overflow-x-auto can
                scroll it internally instead of widening the page (Critic Rob
                punch #4: 458px nav caused a 589px page at a 390px viewport). */}
            <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto text-sm">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto hidden text-xs text-slate-500 sm:block">
              sign the agreement · get paid fast · reduce all friction
            </div>
          </div>
        </header>
        <RepSubNav />
        <FallbackBanner />
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
        {process.env.NEXT_PUBLIC_DEV_CHAT === "1" && <DevChat />}
      </body>
    </html>
  );
}
