import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'THE SYSTEM — Hunter Training Protocol',
  description:
    'Become a Hunter. Clear the daily quest. Level up. A Solo Leveling–inspired training tracker.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-[#e6f4ff] selection:bg-accent-cyan/30">
        {children}
      </body>
    </html>
  );
}
