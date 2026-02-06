import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, Settings, Wrench, Heart, CircleDot, Loader2 } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Logo & Title */}
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <CircleDot className="h-8 w-8 text-primary" />
          <div className="flex flex-col">
            <span className="font-bold text-lg leading-tight">Perle Entusiasterne</span>
            <span className="text-xs text-muted-foreground italic">Keep it simple</span>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              {/* Favorites - only for logged in users */}
              {user && (
                <Button
                  variant={isActive('/favoritter') ? 'secondary' : 'ghost'}
                  size="sm"
                  asChild
                  className="hidden sm:flex"
                >
                  <Link to="/favoritter" className="flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    <span className="hidden md:inline">Favoritter</span>
                  </Link>
                </Button>
              )}

              {/* Admin link */}
              {isAdmin && (
                <Button
                  variant={isActive('/administration') ? 'secondary' : 'ghost'}
                  size="sm"
                  asChild
                >
                  <Link to="/administration" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    <span className="hidden md:inline">Administration</span>
                  </Link>
                </Button>
              )}

              {/* Workshop - for logged in users */}
              {user && (
                <Button
                  variant={isActive('/workshop') ? 'secondary' : 'ghost'}
                  size="sm"
                  asChild
                >
                  <Link to="/workshop" className="flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    <span className="hidden md:inline">WorkShop</span>
                  </Link>
                </Button>
              )}

              {/* Theme toggle */}
              <ThemeToggle />

              {/* Auth buttons */}
              {user ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Log ud</span>
                </Button>
              ) : (
                <Button size="sm" asChild>
                  <Link to="/login">Log ind</Link>
                </Button>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
};
