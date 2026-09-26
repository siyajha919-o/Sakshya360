import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { loadSession, saveSession } from './src/api';
import { LangToggle } from './src/components';
import { loadLang, t, useLang } from './src/i18n';
import { startAutoSync } from './src/outbox';
import { onNotificationOpen, registerForPush, unregisterPush } from './src/push';
import { C } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import DutiesScreen from './src/screens/DutiesScreen';
import InspectionScreen from './src/screens/InspectionScreen';
import MyReportsScreen from './src/screens/MyReportsScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';
import VcScreen from './src/screens/VcScreen';
import OfficialDashboardScreen from './src/screens/OfficialDashboardScreen';
import ProjectScreen from './src/screens/ProjectScreen';
import CctvScreen, { CameraScreen } from './src/screens/CctvScreen';
import OfficialVcScreen from './src/screens/OfficialVcScreen';
import AssignScreen from './src/screens/AssignScreen';
import GrievancesScreen from './src/screens/GrievancesScreen';
import FeedbackScreen from './src/screens/FeedbackScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const nav = createNavigationContainerRef();
const MONITOR_ROLES = ['official', 'state', 'district'];

const header = (onLogout) => ({
  headerStyle: { backgroundColor: C.navy },
  headerTintColor: '#fff',
  headerRight: () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <LangToggle light />
      <Pressable onPress={onLogout} hitSlop={10}><Text style={{ color: '#fff' }}>{t('Sign out')}</Text></Pressable>
    </View>
  ),
});
const icon = (emoji) => () => <Text style={{ fontSize: 20 }}>{emoji}</Text>;

// [route name, component, title, emoji] per role
const TABS = {
  inspector: [['Duties', DutiesScreen, 'My duties', '🗂️'], ['Reports', MyReportsScreen, 'My reports', '📋']],
  ngo: [['Attendance', AttendanceScreen, 'Attendance', '✅'], ['VC', VcScreen, 'Video calls', '📞']],
  monitor: [
    ['Dashboard', OfficialDashboardScreen, 'Dashboard', '📊'], ['CCTV', CctvScreen, 'CCTV', '📹'], ['VC', OfficialVcScreen, 'Random VC', '📞'],
    ['Assign', AssignScreen, 'Inspections', '🎲'], ['Grievances', GrievancesScreen, 'Grievances', '🗣️'],
  ],
  beneficiary: [['Feedback', FeedbackScreen, 'Feedback', '🗣️']],
};
const tabsFor = (role) => TABS[MONITOR_ROLES.includes(role) ? 'monitor' : role] || [];

function RoleTabs({ role, onLogout }) {
  useLang();
  return (
    <Tabs.Navigator screenOptions={{ ...header(onLogout), tabBarActiveTintColor: C.navy }}>
      {tabsFor(role).map(([name, component, title, emoji]) => (
        <Tabs.Screen key={name} name={name} component={component} options={{ title: t(title), tabBarIcon: icon(emoji) }} />
      ))}
    </Tabs.Navigator>
  );
}

// Where a tapped notification should take the user.
function routeFor(data, role) {
  if (data.type === 'vc' && role === 'ngo') return ['Home', { screen: 'VC' }];
  if (data.type === 'assignment' && role === 'inspector') return ['Home', { screen: 'Duties' }];
  if (data.type === 'alert' && MONITOR_ROLES.includes(role) && data.projectId) return ['Project', { id: data.projectId }];
  if (data.type === 'feedback' && role === 'beneficiary') return ['Home', { screen: 'Feedback' }];
  return null;
}

export default function App() {
  const lang = useLang();
  const [session, setSession] = useState(undefined);
  const pendingNav = useRef(null);

  useEffect(() => { Promise.all([loadLang(), loadSession()]).then(([, s]) => setSession(s)); }, []);
  const role = session?.user.role;

  // Push registration (re-done on language change so notifications arrive in the chosen language).
  useEffect(() => {
    if (!session) return;
    registerForPush().then((r) => { if (!r.ok) console.log(`Push unavailable: ${r.reason}`); });
  }, [session, lang]);

  useEffect(() => {
    if (!session) return undefined;
    return onNotificationOpen((data) => {
      const target = routeFor(data, role);
      if (!target) return;
      if (nav.isReady()) nav.navigate(...target); else pendingNav.current = target;
    });
  }, [session, role]);

  // Inspectors: upload queued offline reports automatically.
  useEffect(() => {
    if (role !== 'inspector') return undefined;
    return startAutoSync((n) => Alert.alert(t('Offline reports uploaded'), t('{n} queued report(s) were submitted.', { n })));
  }, [role]);

  const logout = async () => { await unregisterPush(); await saveSession(null); setSession(null); };

  if (session === undefined) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer ref={nav} onReady={() => { if (pendingNav.current) { nav.navigate(...pendingNav.current); pendingNav.current = null; } }}>
        {!session ? (
          <LoginScreen onLogin={setSession} />
        ) : (
          <Stack.Navigator screenOptions={header(logout)}>
            <Stack.Screen name="Home" options={{ headerShown: false }}>{() => <RoleTabs role={role} onLogout={logout} />}</Stack.Screen>
            {role === 'inspector' && <Stack.Screen name="Inspection" component={InspectionScreen} options={{ title: t('Surprise inspection'), headerRight: undefined }} />}
            {MONITOR_ROLES.includes(role) && (
              <>
                <Stack.Screen name="Project" component={ProjectScreen} options={{ title: t('Project'), headerRight: undefined }} />
                <Stack.Screen name="Camera" component={CameraScreen} options={{ title: t('Live CCTV'), headerRight: undefined }} />
              </>
            )}
          </Stack.Navigator>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
