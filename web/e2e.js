// End-to-end encryption for friend chat, using the browser's native Web Crypto
// only — no libraries, no build step. ECDH (P-256) agrees a shared secret from
// the two friends' key pairs; AES-GCM encrypts each message under it. Firestore
// only ever stores { iv, ct }, so the server (and anyone with database read
// access) sees ciphertext, never message text.
//
// Cross-device: your key pair is generated once. The private key is wrapped
// (encrypted) with a key derived from your password via PBKDF2, and that
// wrapped blob is stored on your profile. Any device you log into can unwrap
// the SAME private key with your password, so the published public key always
// matches — messages stay readable everywhere you sign in. The server only ever
// sees the wrapped (encrypted) blob, never the key. Static keys, so no Signal
// Double Ratchet / per-message forward secrecy by design.

const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const PBKDF2_ITERS = 210000;

async function deriveWrapKey(password, saltBytes) {
  const base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// Generate a fresh identity and wrap its private key under the password.
// Returns { pub (JWK, publishable), priv (JWK, cache locally),
//           encPriv, encPrivIv, encPrivSalt (all base64, safe to store) }.
export async function createIdentity(password) {
  const kp = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const pub = await crypto.subtle.exportKey("jwk", kp.publicKey);
  const priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await deriveWrapKey(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, wrapKey, new TextEncoder().encode(JSON.stringify(priv)));
  return { pub, priv, encPriv: b64(new Uint8Array(ct)),
           encPrivIv: b64(iv), encPrivSalt: b64(salt) };
}

// Recover the private key JWK on a new device from the password + stored blob.
// Throws if the password is wrong (AES-GCM auth fails).
export async function unwrapIdentity(password, { encPriv, encPrivIv, encPrivSalt }) {
  const wrapKey = await deriveWrapKey(password, unb64(encPrivSalt));
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(encPrivIv) }, wrapKey, unb64(encPriv));
  return JSON.parse(new TextDecoder().decode(pt));
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
