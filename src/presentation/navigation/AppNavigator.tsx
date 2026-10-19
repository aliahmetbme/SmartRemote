import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RemoteScreen } from '../screens/RemoteScreen';
import { TVDiscoveryScreen } from '../screens/TVDiscoveryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { theme } from '../theme';

export type RootTabParamList = {
  Remote: undefined;
  Discovery: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 18,
    opacity: 0.6,
  },
  iconTextFocused: {
    opacity: 1,
  },
});

const TabBarIcon = ({ label, focused }: { label: string; focused: boolean }) => {
  let symbol = '📱';
  if (label === 'Remote') symbol = '🎛️';
  if (label === 'Discovery') symbol = '🔍';
  if (label === 'Settings') symbol = '⚙️';

  return (
    <View style={styles.iconContainer}>
      <Text style={[styles.iconText, focused && styles.iconTextFocused]}>{symbol}</Text>
    </View>
  );
};

const renderRemoteIcon = ({ focused }: { focused: boolean }) => (
  <TabBarIcon label="Remote" focused={focused} />
);
const renderDiscoveryIcon = ({ focused }: { focused: boolean }) => (
  <TabBarIcon label="Discovery" focused={focused} />
);
const renderSettingsIcon = ({ focused }: { focused: boolean }) => (
  <TabBarIcon label="Settings" focused={focused} />
);

interface RemoteWrapperProps {
  navigation: {
    navigate: (screen: keyof RootTabParamList) => void;
  };
}

const RemoteScreenWrapper: React.FC<RemoteWrapperProps> = ({ navigation }) => (
  <RemoteScreen onNavigateToDiscovery={() => navigation.navigate('Discovery')} />
);

const remoteOptions = { tabBarIcon: renderRemoteIcon };
const discoveryOptions = { tabBarIcon: renderDiscoveryIcon };
const settingsOptions = { tabBarIcon: renderSettingsIcon };

export const AppNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();

  const screenOptions = React.useMemo(
    () => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        height: 56 + Math.max(insets.bottom, 10),
        paddingBottom: Math.max(insets.bottom, 10),
        paddingTop: 6,
      },
      tabBarActiveTintColor: theme.colors.secondary,
      tabBarInactiveTintColor: theme.colors.textMuted,
      tabBarLabelStyle: styles.tabLabel,
    }),
    [insets.bottom],
  );

  return (
    <NavigationContainer>
      <Tab.Navigator initialRouteName="Remote" screenOptions={screenOptions}>
        <Tab.Screen name="Remote" component={RemoteScreenWrapper} options={remoteOptions} />
        <Tab.Screen name="Discovery" component={TVDiscoveryScreen} options={discoveryOptions} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={settingsOptions} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};
