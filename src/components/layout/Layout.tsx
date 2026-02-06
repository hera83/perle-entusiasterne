import React from 'react';
import { Header } from './Header';
import { Announcements } from '@/components/announcements/Announcements';

interface LayoutProps {
  children: React.ReactNode;
  showAnnouncements?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children, showAnnouncements = false }) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      {showAnnouncements && <Announcements />}
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t py-4 text-center text-sm text-muted-foreground no-print">
        <p>© {new Date().getFullYear()} Perle Entusiasterne - Keep it simple</p>
      </footer>
    </div>
  );
};
