import React from 'react';
import {
  NavigationContainer,
  DarkTheme,
  useIsFocused,
  type InitialState,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TVWakeSetupScreen } from '../screens/TVWakeSetupScreen';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RemoteScreen } from '../screens/RemoteScreen';
import { TVDiscoveryScreen } from '../screens/TVDiscoveryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { theme, getTabBarLayout } from '../theme';

const DeveloperSettingsScreen = __DEV__
  ? require('../screens/DeveloperSettingsScreen').DeveloperSettingsScreen
  : undefined;

export type RootTabParamList = {
  Remote: { initialMode?: 'buttons' | 'pointer' } | undefined;
  Discovery: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: theme.colors.background,
    card: theme.colors.surface,
    text: theme.colors.textPrimary,
    border: theme.colors.border,
    primary: theme.colors.secondary,
  },
};

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

const TabBarIcon = ({
  label,
  focused,
}: {
  label: string;
  focused: boolean;
}) => {
  let symbol = '📱';
  if (label === 'Remote') symbol = '🎛️';
  if (label === 'Discovery') symbol = '🔍';
  if (label === 'Settings') symbol = '⚙️';

  return (
    <View style={styles.iconContainer}>
      <Text style={[styles.iconText, focused && styles.iconTextFocused]}>
        {symbol}
      </Text>
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
  route?: { params?: { initialMode?: 'buttons' | 'pointer' } };
  navigation: {
    navigate: (screen: keyof RootTabParamList) => void;
  };
}

const RemoteScreenWrapper: React.FC<RemoteWrapperProps> = ({
  navigation,
  route,
}) => {
  const isFocused = useIsFocused();
  return (
    <RemoteScreen
      initialMode={route?.params?.initialMode}
      isFocused={isFocused}
      onNavigateToDiscovery={() => navigation.navigate('Discovery')}
      onNavigateToSettings={() => navigation.navigate('Settings')}
    />
  );
};

const SettingsStack = createNativeStackNavigator<{
  SettingsHome: undefined;
  DeveloperSettings: undefined;
  TVWakeSetup: { deviceId: string };
}>();
const SettingsHome = ({
  navigation,
}: {
  navigation: {
    navigate: {
      (route: 'DeveloperSettings'): void;
      (route: 'TVWakeSetup', params: { deviceId: string }): void;
    };
  };
}) => (
  <SettingsScreen
    onNavigateToDeveloper={__DEV__ ? () => navigation.navigate('DeveloperSettings') : undefined}
    onNavigateToWakeSetup={deviceId =>
      navigation.navigate('TVWakeSetup', { deviceId })
    }
  />
);
const WakeSetupRoute = ({
  route,
}: {
  route: { params: { deviceId: string } };
}) => {
  const isFocused = useIsFocused();
  return (
    <TVWakeSetupScreen deviceId={route.params.deviceId} isFocused={isFocused} />
  );
};
const SettingsNavigator = () => (
  <SettingsStack.Navigator
    screenOptions={{
      headerStyle: { backgroundColor: theme.colors.surface },
      headerTintColor: theme.colors.textPrimary,
      contentStyle: { backgroundColor: theme.colors.background },
    }}
  >
    <SettingsStack.Screen
      name="SettingsHome"
      component={SettingsHome}
      options={{ title: 'Settings', headerShown: false }}
    />
    {__DEV__ && <SettingsStack.Screen
      name="DeveloperSettings"
      component={DeveloperSettingsScreen}
      options={{ title: 'Developer Settings' }}
    />}
    <SettingsStack.Screen
      name="TVWakeSetup"
      component={WakeSetupRoute}
      options={{ title: 'TV Wake Setup' }}
    />
  </SettingsStack.Navigator>
);

const remoteOptions = { tabBarIcon: renderRemoteIcon };
const discoveryOptions = { title: 'TVs', tabBarIcon: renderDiscoveryIcon };
const settingsOptions = { tabBarIcon: renderSettingsIcon };

export const AppNavigator: React.FC<{ initialState?: InitialState }> = ({
  initialState,
}) => {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();

  const screenOptions = React.useMemo(
    () => ({
      headerShown: false,
      tabBarHideOnKeyboard: true,
      tabBarLabelPosition: 'below-icon' as const,
      tabBarAllowFontScaling: true,
      tabBarStyle: {
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        ...getTabBarLayout(insets.bottom, fontScale),
      },
      tabBarActiveTintColor: theme.colors.secondary,
      tabBarInactiveTintColor: theme.colors.textMuted,
      tabBarLabelStyle: styles.tabLabel,
    }),
    [insets.bottom, fontScale],
  );

  return (
    <NavigationContainer theme={navigationTheme} initialState={initialState}>
      <Tab.Navigator initialRouteName="Remote" screenOptions={screenOptions}>
        <Tab.Screen
          name="Remote"
          component={RemoteScreenWrapper}
          options={remoteOptions}
        />
        <Tab.Screen
          name="Discovery"
          component={TVDiscoveryScreen}
          options={discoveryOptions}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsNavigator}
          options={settingsOptions}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};
