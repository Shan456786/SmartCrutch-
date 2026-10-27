import { AppProvider } from './state/AppContext';
import { LiveProvider } from './state/LiveContext';
import { useHashRoute } from './lib/router';
import { Layout } from './components/Layout';
import { Toasts } from './components/Toasts';
import { Dashboard } from './pages/Dashboard';
import { LiveMonitoring } from './pages/LiveMonitoring';
import { SafetyCentre } from './pages/SafetyCentre';
import { SessionHistory } from './pages/SessionHistory';
import { PatientProfilePage } from './pages/PatientProfile';
import { DeviceSettings } from './pages/DeviceSettings';
import type { RouteId } from './types';

const PAGES: Record<RouteId, () => JSX.Element> = {
  dashboard: Dashboard,
  live: LiveMonitoring,
  safety: SafetyCentre,
  history: SessionHistory,
  profile: PatientProfilePage,
  settings: DeviceSettings,
};

function Routed() {
  const route = useHashRoute();
  const Page = PAGES[route];
  return (
    <Layout route={route}>
      <Page />
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <LiveProvider>
        <Routed />
        <Toasts />
      </LiveProvider>
    </AppProvider>
  );
}
