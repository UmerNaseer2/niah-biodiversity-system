import AppTabs from '@/components/app-tabs';

// The tab bar lives in components/app-tabs.tsx (native tabs on iOS and Android)
// and components/app-tabs.web.tsx (a custom bar for the web preview).
export default function TabLayout() {
  return <AppTabs />;
}
