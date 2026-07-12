// Mindspar push sender. Runs on a GitHub Actions schedule (every ~5 minutes):
// finds async duels awaiting the recipient or freshly decided, and delivers a
// Web Push notification to any player who has a stored subscription. Marks
// each notification on the match doc so nothing sends twice. Dead
// subscriptions (404/410 from the push service) are pruned.
//
// Env (GitHub repo secrets): FIREBASE_SA (service-account JSON),
// VAPID_PUBLIC, VAPID_PRIVATE.
import admin from "firebase-admin";
import webpush from "web-push";

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)) });
const db = admin.firestore();
webpush.setVapidDetails("https://github.com/rakesh-kumar34/mindspar",
  process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

const snap = await db.collection("matches").where("kind", "==", "async").get();
let sent = 0, skipped = 0, pruned = 0;

async function deliver(uid, body, ref, mark) {
  const user = await db.doc(`users/${uid}`).get();
  const sub = user.get("push");
  if (sub) {
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title: "Synapse", body, tag: "async" }));
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await db.doc(`users/${uid}`).update({ push: admin.firestore.FieldValue.delete() });
        pruned++;
      } else throw e;
    }
  } else skipped++;
  // Mark regardless: a player without a subscription shouldn't be re-tried
  // forever, and will see the in-app card on next open anyway.
  await ref.update(mark);
}

for (const doc of snap.docs) {
  const d = doc.data();
  const { fromId: from, toId: to } = d;
  if (!from || !to) continue;
  const name = uid => d.players?.[uid]?.name || "A friend";

  if (d[`result_${from}`] && !d[`result_${to}`] && !d.pushedInvite) {
    await deliver(to, `${name(from)} challenged you to an async duel — your move!`,
      doc.ref, { pushedInvite: true });
  }
  if (d[`result_${from}`] && d[`result_${to}`]) {
    for (const uid of [from, to]) {
      const opp = uid === from ? to : from;
      if (!d[`applied_${uid}`] && !d[`pushedSettle_${uid}`]) {
        const mine = d[`result_${uid}`]?.score ?? 0, theirs = d[`result_${opp}`]?.score ?? 0;
        const word = mine > theirs ? "Victory" : mine < theirs ? "Defeat" : "Draw";
        await deliver(uid, `${word}! Your async duel vs ${name(opp)} ended ${mine}–${theirs}.`,
          doc.ref, { [`pushedSettle_${uid}`]: true });
      }
    }
  }
}
console.log(`push sender: sent=${sent} skipped(no-sub)=${skipped} pruned=${pruned} over ${snap.size} async duels`);
