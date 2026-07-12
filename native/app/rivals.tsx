import { View, Text, FlatList, StyleSheet, useColorScheme } from "react-native";
import { Stack } from "expo-router";
import { themes } from "../src/core/theme";
import { GAUNTLET } from "../src/core/game";

const beaten = 1;   // phase-1 scaffold; real progress lands with profiles

export default function Rivals() {
  const t = themes[useColorScheme() === "dark" ? "dark" : "light"];
  return (
    <>
      <Stack.Screen options={{ title: "Rivals" }} />
      <FlatList
        style={{ backgroundColor: t.porcelain }}
        contentContainerStyle={{ padding: 20, gap: 10 }}
        data={GAUNTLET}
        keyExtractor={r => r.name}
        renderItem={({ item, index }) => {
          const state = index < beaten ? "done" : index === beaten ? "now" : "locked";
          return (
            <View style={[s.row, { backgroundColor: t.card, borderColor: state === "now" ? t.iris : t.hair,
                                   opacity: state === "locked" ? 0.45 : 1 }]}>
              <Text style={{ fontSize: 18 }}>{state === "done" ? "✓" : state === "now" ? "⚡" : "🔒"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontWeight: "600" }}>{item.name}</Text>
                <Text style={{ color: t.ink2, fontSize: 11.5 }}>
                  {item.rating}{state !== "locked" ? ` · ${item.tag}` : ""}
                </Text>
              </View>
              {state === "now" && (
                <View style={[s.duel, { backgroundColor: t.iris }]}>
                  <Text style={{ color: t.onIris, fontSize: 12, fontWeight: "700" }}>Duel</Text>
                </View>
              )}
            </View>
          );
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1,
         borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 },
  duel: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 },
});
