// End-to-end encryption for friend chat, using the browser's native Web Crypto
// only — no libraries, no build step. ECDH (P-256) agrees a shared secret from
// the two friends' key pairs; AES-GCM encrypts each message under it. Firestore
// only ever stores { iv, ct }, so the server (and anyone with database read
// access) sees ciphertext, never message text.
//
// Each device keeps its own private key in localStorage; the matching public
// key lives in the user's profile doc. Keys are static, so this deliberately
// does NOT provide Signal's per-message forward secrecy — that would need the
// Double Ratchet. Signing in on a new device mints a new key pair, which means
// history encrypted to the old key can't be read there (v1 limitation).

const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

// Load this user's key pair from localStorage, or generate + persist one.
// Returns { pub, priv } as JWKs (pub is safe to publish; priv stays local).
export async function loadOrCreateKeys(uid) {
  const storeKey = "mindspar-e2e-" + uid;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(storeKey)); } catch { /* regenerate */ }
  if (saved && saved.pub && saved.priv) return saved;

  const kp = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const keys = {
    pub: await crypto.subtle.exportKey("jwk", kp.publicKey),
    priv: await crypto.subtle.exportKey("jwk", kp.privateKey),
  };
  localStorage.setItem(storeKey, JSON.stringify(keys));
  return keys;
}

async function deriveSharedKey(myPrivJwk, theirPubJwk) {
  const priv = await crypto.subtle.importKey(
    "jwk", myPrivJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  const pub = await crypto.subtle.importKey(
    "jwk", theirPubJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: pub }, priv,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// A sealed channel with one friend. Both sides derive the identical AES key,
// so each can seal and open. seal() returns { iv, ct } to store; open() returns
// the plaintext, or null if the ciphertext doesn't authenticate.
export async function makeChannel(myPrivJwk, theirPubJwk) {
  const key = await deriveSharedKey(myPrivJwk, theirPubJwk);
  return {
    async seal(text) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
      return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
    },
    async open({ iv, ct }) {
      try {
        const pt = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct));
        return new TextDecoder().decode(pt);
      } catch { return null; }
    },
  };
}
