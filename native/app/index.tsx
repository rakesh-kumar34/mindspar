import { View, Text, Pressable, ScrollView, StyleSheet, useColorScheme } from "react-native";
import { Link, Stack } from "expo-router";
import { themes } from "../src/core/theme";
import { tier, GAUNTLET, N } from "../src/core/game";

// Phase-1 scaffold: local demo profile. Firebase auth/profile arrives in
// phase 3 (see MIGRATION.md); everything visual is already production shape.
const P = { name: "Rakesh", rating: 1000, gauntlet: 1 };

export default function Home() {
  const t = themes[useColorScheme() === "dark" ? "dark" : "light"];
  const next = GAUNTLET[Math.min(P.gauntlet, GAUNTLET.length - 1)];
  return (
    <ScrollView style={{ backgroundColor: t.porcelain }} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title: "Synapse", headerShown: false }} />
      <Text style={[s.greet, { color: t.ink }]}>Ready, {P.name}?</Text>
      <Text style={{ color: t.ink2, fontSize: 13 }}>{N} questions · 8 domains · speed counts</Text>
      <View style={[s.pill, { backgroundColor: t.goldSoft }]}>
        <Text style={{ color: t.gold, fontWeight: "700", fontSize: 11, letterSpacing: 1.5 }}>
          {tier(P.rating).toUpperCase()}  <Text style={{ color: t.ink2 }}>{P.rating}</Text>
        </Text>
      </View>
      <View style={[s.hero, { backgroundColor: "#241C0F" }]}>
        <Text style={s.heroEyebrow}>RIVALS</Text>
        <Text style={s.heroTitle}>Face {next.name}</Text>
        <Text style={s.heroSub}>Rival {P.gauntlet + 1} of {GAUNTLET.length} · {next.tag}</Text>
        <Link href="/rivals" asChild>
          <Pressable style={[s.cta, { backgroundColor: t.iris }]}>
            <Text style={{ color: t.onIris, fontWeight: "700" }}>⚡ Duel now</Text>
          </Pressable>
        </Link>
      </View>
      <Link href="/rivals" asChild>
        <Pressable style={[s.row, { backgroundColor: t.card, borderColor: t.hair }]}>
          <Text style={{ fontSize: 22 }}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontWeight: "600", fontSize: 15 }}>Rivals</Text>
            <Text style={{ color: t.ink2, fontSize: 12.5 }}>
              {P.gauntlet} of {GAUNTLET.length} beaten · next up: {next.name}
            </Text>
          </View>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pad: { padding: 20, paddingTop: 70, gap: 12 },
  greet: { fontSize: 30, fontWeight: "400", fontFamily: "Georgia" },
  pill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6 },
  hero: { borderRadius: 22, padding: 22, gap: 8 },
  heroEyebrow: { color: "rgba(255,253,247,.55)", fontSize: 10.5, fontWeight: "700", letterSpacing: 2 },
  heroTitle: { color: "#FFFDF7", fontSize: 30, fontFamily: "Georgia" },
  heroSub: { color: "rgba(255,253,247,.6)", fontSize: 12.5 },
  cta: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10, marginTop: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 22,
         borderWidth: 1, padding: 16 },
});
