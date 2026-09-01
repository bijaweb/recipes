import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/use-auth';
import { AuthGate } from '@/components/auth-gate';
import { AppSwitcher } from '@/components/app-switcher';
import { BottomTabBar } from '@/components/bottom-tab-bar';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import RecipeDetail from '@/pages/recipe-detail';
import AddRecipe from '@/pages/add-recipe';
import Favorites from '@/pages/favorites';
import Settings from '@/pages/settings';

import {
  Link,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();
  const showTabBar = location === '/' || location === '/favorites' || location === '/settings';

  return (
    <RoutedErrorBoundary>
      <AppSwitcher
        leftSlot={
          <Link
            href="/add"
            aria-label="Add recipe"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card/95 text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </Link>
        }
      />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/add" component={AddRecipe} />
        <Route path="/recipe/:slug" component={RecipeDetail} />
        <Route path="/favorites" component={Favorites} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
      {showTabBar && <BottomTabBar />}
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <AuthGate>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
            </WouterRouter>
          </AuthGate>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
