import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from './types';
import { MonitorScreen } from '../screens/MonitorScreen';
import { MissionListScreen } from '../screens/MissionListScreen';
import { RewardsStoreScreen } from '../screens/RewardsStoreScreen';
import { BadgesScreen } from '../screens/BadgesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs(): React.JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#2563eb',
      }}>
      <Tab.Screen name="Monitor" component={MonitorScreen} options={{ title: 'Monitor' }} />
      <Tab.Screen name="Missions" component={MissionListScreen} options={{ title: 'Missions' }} />
      <Tab.Screen name="Rewards" component={RewardsStoreScreen} options={{ title: 'Rewards' }} />
      <Tab.Screen name="Badges" component={BadgesScreen} options={{ title: 'Badges' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
