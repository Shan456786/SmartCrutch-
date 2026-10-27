import { useEffect, useState } from 'react';
import type { RouteId } from '../types';

const ROUTES: RouteId[] = ['dashboard', 'live', 'safety', 'history', 'profile', 'settings'];

function parse(): RouteId {
  const h = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return (ROUTES as string[]).includes(h) ? (h as RouteId) : 'dashboard';
}

export function useHashRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function href(route: RouteId): string {
  return `#/${route}`;
}

export function navigate(route: RouteId): void {
  window.location.hash = `/${route}`;
}
