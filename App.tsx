import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import DashboardScreen from './src/screens/DashboardScreen';
import LogScreen from './src/screens/LogScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

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
          options={{ title: 'Dashboard', tabBarLabel: 'Home', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} /> }}
        />
        <Tab.Screen
          name="Log"
          component={LogScreen}
          options={{ title: 'Log Feed', tabBarLabel: 'Log', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={24} color={color} /> }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{ title: 'History', tabBarLabel: 'History', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'list' : 'list-outline'} size={24} color={color} /> }}
        />
        <Tab.Screen
          name="Analytics"
          component={AnalyticsScreen}
          options={{ title: 'Analytics', tabBarLabel: 'Analytics', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={24} color={color} /> }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings', tabBarLabel: 'Settings', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'settings' : 'settings-outline'} size={24} color={color} /> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
