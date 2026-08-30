import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/use-auth';
import { AuthGate } from '@/components/auth-gate';
import { BottomTabBar } from '@/components/bottom-tab-bar';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import RecipeDetail from '@/pages/recipe-detail';
import Favorites from '@/pages/favorites';
import Settings from '@/pages/settings';

import {
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
      <Switch>
        <Route path="/" component={Home} />
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
