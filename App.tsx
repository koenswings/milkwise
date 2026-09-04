import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, { Path, Circle } from 'react-native-svg';

import DashboardScreen from './src/screens/DashboardScreen';
import LogScreen from './src/screens/LogScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

function IconHome({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M9 21V12h6v9" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

function IconLog({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.5} />
      <Path d="M12 8v4l2.5 2.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function IconHistory({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M4 6h16M4 12h10M4 18h7" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function IconAnalytics({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M3 17l5-6 4 4 4.5-6 4.5 5" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function IconSettings({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.5} />
      <Path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

const Tab = createBottomTabNavigator();

const COLORS = {
  bg: '#0f172a',
  card: '#1e293b',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  blue: '#3b82f6',
  border: '#1e293b',
};

const MilkWiseTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.bg,
    card: COLORS.card,
    text: COLORS.textPrimary,
    border: COLORS.border,
    primary: COLORS.blue,
    notification: COLORS.blue,
  },
};

export default function App() {
  return (
    <NavigationContainer theme={MilkWiseTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.card },
          headerTintColor: COLORS.textPrimary,
          tabBarStyle: {
            backgroundColor: COLORS.card,
            borderTopColor: '#334155',
            paddingBottom: 16,
            paddingTop: 10,
            height: 90,
          },
          tabBarActiveTintColor: COLORS.blue,
          tabBarInactiveTintColor: COLORS.textSecondary,
          tabBarLabelStyle: { fontSize: 13, fontWeight: '600', marginTop: 0 },
          tabBarIconStyle: { marginBottom: 0 },
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: 'Dashboard', tabBarLabel: 'Home', tabBarIcon: ({ color }) => <IconHome color={color} /> }}
        />
        <Tab.Screen
          name="Log"
          component={LogScreen}
          options={{ title: 'Log Feed', tabBarLabel: 'Log', tabBarIcon: ({ color }) => <IconLog color={color} /> }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{ title: 'History', tabBarLabel: 'History', tabBarIcon: ({ color }) => <IconHistory color={color} /> }}
        />
        <Tab.Screen
          name="Analytics"
          component={AnalyticsScreen}
          options={{ title: 'Analytics', tabBarLabel: 'Analytics', tabBarIcon: ({ color }) => <IconAnalytics color={color} /> }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings', tabBarLabel: 'Settings', tabBarIcon: ({ color }) => <IconSettings color={color} /> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
