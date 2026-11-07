import Constants from 'expo-constants';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { InfoRow } from '@/components/ui/info-row';

/** The app name and version, at the bottom of the staff profile and the visitor settings. */
export function AboutCard() {
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Card title="About" icon="info">
      <InfoRow label="App" value="Niah Ground-Truthing" />
      <InfoRow label="Version" value={version} />
      <ThemedText type="small" themeColor="textSecondary">
        COS30049 student project for Sarawak Forestry Corporation and NeuonAI.
      </ThemedText>
    </Card>
  );
}
