import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { subscribeFirebaseAuth, getActiveUserFromFirebase } from "./firebase";
import { colors } from "./theme";
import LoginScreen from "./screens/LoginScreen";
import DashboardScreen from "./screens/DashboardScreen";
import CustomersScreen from "./screens/CustomersScreen";
import DataScreen from "./screens/DataScreen";
import HistoryScreen from "./screens/HistoryScreen";
import ProfileScreen from "./screens/ProfileScreen";
import OwnerDashboardScreen from "./screens/OwnerDashboardScreen";
import type { ActiveUser } from "./types";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function DashboardTabs({ isOwner }: { isOwner: boolean }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1
        },
        headerStyle: {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
          borderBottomWidth: 1
        },
        headerTintColor: colors.foreground,
        headerTitleStyle: {
          fontWeight: "600"
        }
      }}
    >
      {isOwner ? (
        <Tab.Screen
          name="OwnerDashboard"
          component={OwnerDashboardScreen}
          options={{
            title: "Owner Dashboard",
            tabBarLabel: "Dashboard",
            tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-dashboard" color={color} size={size} />
          }}
        />
      ) : (
        <>
          <Tab.Screen
            name="UserDashboard"
            component={DashboardScreen}
            options={{
              title: "Dashboard",
              tabBarLabel: "Dashboard",
              tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-dashboard" color={color} size={size} />
            }}
          />
          <Tab.Screen
            name="Customers"
            component={CustomersScreen}
            options={{
              title: "Customers",
              tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-multiple" color={color} size={size} />
            }}
          />
        </>
      )}
      <Tab.Screen
        name="Data"
        component={DataScreen}
        options={{
          title: "Data",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="table" color={color} size={size} />
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="history" color={color} size={size} />
        }}
      />
      <Tab.Screen
        name="Settings"
        component={ProfileScreen}
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="cog" color={color} size={size} />
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(null);

  useEffect(() => {
    return subscribeFirebaseAuth((user) => {
      setActiveUser(getActiveUserFromFirebase(user));
      setAuthReady(true);
    });
  }, []);

  if (!authReady) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaProvider>
    );
  }

  const isOwner = activeUser?.role === "owner";

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {activeUser ? (
            <Stack.Screen name="Main">
              {() => <DashboardTabs isOwner={isOwner} />}
            </Stack.Screen>
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} />
          )}
        </Stack.Navigator>
        <StatusBar />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
