import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const GOOGLE_SCRIPT_ID = 'google-identity-script';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

function GoogleSignInButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initialize = () => {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
      if (!window.google || !buttonRef.current || !clientId) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 280,
      });
    };

    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existingScript) {
      initialize();
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initialize;
    document.body.appendChild(script);
  }, [onCredential]);

  return <div ref={buttonRef} className="flex justify-center" />;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading, error, signIn, signOut } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-sm">
          <h1 className="mb-6 text-center text-2xl font-semibold text-card-foreground">
            Recipes
          </h1>
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <GoogleSignInButton onCredential={signIn} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border bg-card/95 py-1 pl-1 pr-3 shadow-sm backdrop-blur">
        <Avatar className="h-6 w-6">
          <AvatarImage src={user.picture} alt={user.name ?? user.email} />
          <AvatarFallback>{(user.name ?? user.email).slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="max-w-[10rem] truncate text-xs text-muted-foreground">
          {user.name ?? user.email}
        </span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={signOut}>
          Sign out
        </Button>
      </div>
      {children}
    </div>
  );
}
