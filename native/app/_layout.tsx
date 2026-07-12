import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar";
import { themes } from "../src/core/theme";

export default function Layout() {
  const t = themes[useColorScheme() === "dark" ? "dark" : "light"];
  return (
    <>
      <StatusBar style={useColorScheme() === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: t.porcelain },
        headerTintColor: t.ink,
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: t.porcelain },
        headerShadowVisible: false,
      }} />
    </>
  );
}
