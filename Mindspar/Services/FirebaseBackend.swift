import Foundation
import FirebaseAuth
import FirebaseFirestore

/// The real backend: Firebase Auth (email/password) + Firestore for profiles,
/// matchmaking lobby, invites, and live match sync.
///
/// Firestore layout:
///   users/{uid}                       — UserProfile (Codable)
///   usernames/{usernameLower}         — { uid } for uniqueness + lookup
///   lobby/{uid}                       — { username, createdAt, matchID? }
///   invites/{id}                      — { fromID, fromUsername, toKey, status, matchID?, seed? }
///   matches/{id}                      — { seed, playerIDs, names, answers_<uid>: [...] }
final class FirebaseBackend: Backend {
    var isLive: Bool { true }

    private let db = Firestore.firestore()
    private var listeners: [ListenerRegistration] = []

    // MARK: Auth

    func restoreSession() async -> UserProfile? {
        guard let uid = Auth.auth().currentUser?.uid else { return nil }
        return try? await db.collection("users").document(uid)
            .getDocument(as: UserProfile.self)
    }

    func signUp(email: String, password: String, username: String, dateOfBirth: Date) async throws -> UserProfile {
        guard AgeCheck.isAdult(dateOfBirth) else { throw BackendError.underage }
        let key = username.lowercased()
        let taken = try await db.collection("usernames").document(key).getDocument().exists
        guard !taken else { throw BackendError.usernameTaken }

        let result = try await Auth.auth().createUser(withEmail: email, password: password)
        let profile = UserProfile(id: result.user.uid, username: username,
                                  email: email.lowercased(), dateOfBirth: dateOfBirth)
        try db.collection("users").document(profile.id).setData(from: profile)
        try await db.collection("usernames").document(key).setData(["uid": profile.id])
        return profile
    }

    func signIn(email: String, password: String) async throws -> UserProfile {
        let result = try await Auth.auth().signIn(withEmail: email, password: password)
        return try await db.collection("users").document(result.user.uid)
            .getDocument(as: UserProfile.self)
    }

    func signOut() throws {
        try Auth.auth().signOut()
    }

    func save(_ profile: UserProfile) async throws {
        try db.collection("users").document(profile.id).setData(from: profile)
    }

    // MARK: Random matchmaking (lobby)

    func findRandomOpponent(me: UserProfile) async throws -> HumanMatch {
        // Try to claim the oldest waiting player.
        let waiting = try await db.collection("lobby")
            .order(by: "createdAt")
            .limit(to: 5)
            .getDocuments()

        // Prefer the closest rating; only stretch past the band if nobody fits.
        let candidates = waiting.documents
            .filter { $0.documentID != me.id && $0.get("matchID") == nil }
            .sorted {
                abs(($0.get("rating") as? Int ?? Elo.initial) - me.stats.rating)
                    < abs(($1.get("rating") as? Int ?? Elo.initial) - me.stats.rating)
            }
        let banded = candidates.first {
            abs(($0.get("rating") as? Int ?? Elo.initial) - me.stats.rating) <= 200
        }
        if let candidate = banded ?? candidates.first {
            let opponentID = candidate.documentID
            let opponentName = candidate.get("username") as? String ?? "Player"
            let opponentRating = candidate.get("rating") as? Int ?? Elo.initial
            let seed = UInt64.random(in: 0..<UInt64.max)
            let matchID = UUID().uuidString
            let target = DifficultyLadder.target(forRating: (me.stats.rating + opponentRating) / 2)
            try await db.collection("matches").document(matchID).setData([
                "seed": String(seed),
                "targetDifficulty": target,
                "playerIDs": [me.id, opponentID],
                "names": [me.id: me.username, opponentID: opponentName],
                "createdAt": FieldValue.serverTimestamp(),
            ])
            try await db.collection("lobby").document(opponentID).updateData([
                "matchID": matchID, "seed": String(seed), "targetDifficulty": target,
                "opponentID": me.id, "opponentName": me.username,
                "opponentRating": me.stats.rating,
            ])
            return HumanMatch(matchID: matchID, seed: seed,
                              opponentID: opponentID, opponentName: opponentName,
                              opponentRating: opponentRating, targetDifficulty: target)
        }

        // Nobody waiting: enqueue myself and wait to be claimed.
        try await db.collection("lobby").document(me.id).setData([
            "username": me.username,
            "rating": me.stats.rating,
            "createdAt": FieldValue.serverTimestamp(),
        ])
        return try await withCheckedThrowingContinuation { continuation in
            var resumed = false
            let listener = db.collection("lobby").document(me.id)
                .addSnapshotListener { snapshot, _ in
                    guard !resumed,
                          let snapshot, snapshot.exists,
                          let matchID = snapshot.get("matchID") as? String,
                          let seedString = snapshot.get("seed") as? String,
                          let seed = UInt64(seedString) else { return }
                    resumed = true
                    let opponentID = snapshot.get("opponentID") as? String ?? ""
                    let opponentName = snapshot.get("opponentName") as? String ?? "Player"
                    let opponentRating = snapshot.get("opponentRating") as? Int ?? Elo.initial
                    let target = snapshot.get("targetDifficulty") as? Double ?? 2.0
                    snapshot.reference.delete()
                    continuation.resume(returning: HumanMatch(
                        matchID: matchID, seed: seed,
                        opponentID: opponentID, opponentName: opponentName,
                        opponentRating: opponentRating, targetDifficulty: target))
                }
            listeners.append(listener)
        }
    }

    func cancelMatchmaking(me: UserProfile) async {
        try? await db.collection("lobby").document(me.id).delete()
        stopListening()
    }

    // MARK: Invites

    func sendInvite(to usernameOrEmail: String, from me: UserProfile) async throws {
        let key = usernameOrEmail.lowercased().trimmingCharacters(in: .whitespaces)
        // Verify the target exists (by username or email).
        let byUsername = try await db.collection("usernames").document(key).getDocument()
        if !byUsername.exists {
            let byEmail = try await db.collection("users")
                .whereField("email", isEqualTo: key).limit(to: 1).getDocuments()
            guard !byEmail.documents.isEmpty else { throw BackendError.userNotFound }
        }
        try await db.collection("invites").addDocument(data: [
            "fromID": me.id,
            "fromUsername": me.username,
            "fromRating": me.stats.rating,
            "toKey": key,
            "status": "pending",
            "createdAt": FieldValue.serverTimestamp(),
        ]).getDocument()
    }

    func listenForInvites(me: UserProfile, onChange: @escaping ([Invite]) -> Void) {
        let keys = [me.username.lowercased(), me.email.lowercased()]
        let listener = db.collection("invites")
            .whereField("toKey", in: keys)
            .whereField("status", isEqualTo: "pending")
            .addSnapshotListener { snapshot, _ in
                let invites = snapshot?.documents.map { doc in
                    Invite(id: doc.documentID,
                           fromID: doc.get("fromID") as? String ?? "",
                           fromUsername: doc.get("fromUsername") as? String ?? "Player",
                           fromRating: doc.get("fromRating") as? Int ?? Elo.initial)
                } ?? []
                onChange(invites)
            }
        listeners.append(listener)
    }

    func acceptInvite(_ invite: Invite, me: UserProfile) async throws -> HumanMatch {
        let seed = UInt64.random(in: 0..<UInt64.max)
        let matchID = UUID().uuidString
        let target = DifficultyLadder.target(forRating: (me.stats.rating + invite.fromRating) / 2)
        try await db.collection("matches").document(matchID).setData([
            "seed": String(seed),
            "targetDifficulty": target,
            "playerIDs": [me.id, invite.fromID],
            "names": [me.id: me.username, invite.fromID: invite.fromUsername],
            "createdAt": FieldValue.serverTimestamp(),
        ])
        try await db.collection("invites").document(invite.id).updateData([
            "status": "accepted", "matchID": matchID, "seed": String(seed),
            "targetDifficulty": target,
            "accepterID": me.id, "accepterName": me.username,
            "accepterRating": me.stats.rating,
        ])
        return HumanMatch(matchID: matchID, seed: seed,
                          opponentID: invite.fromID, opponentName: invite.fromUsername,
                          opponentRating: invite.fromRating, targetDifficulty: target)
    }

    func waitForInviteAcceptance(me: UserProfile) async throws -> HumanMatch {
        try await withCheckedThrowingContinuation { continuation in
            var resumed = false
            let listener = db.collection("invites")
                .whereField("fromID", isEqualTo: me.id)
                .whereField("status", isEqualTo: "accepted")
                .addSnapshotListener { snapshot, _ in
                    guard !resumed,
                          let doc = snapshot?.documents.first,
                          let matchID = doc.get("matchID") as? String,
                          let seedString = doc.get("seed") as? String,
                          let seed = UInt64(seedString) else { return }
                    resumed = true
                    doc.reference.delete()
                    continuation.resume(returning: HumanMatch(
                        matchID: matchID, seed: seed,
                        opponentID: doc.get("accepterID") as? String ?? "",
                        opponentName: doc.get("accepterName") as? String ?? "Player",
                        opponentRating: doc.get("accepterRating") as? Int ?? Elo.initial,
                        targetDifficulty: doc.get("targetDifficulty") as? Double ?? 2.0))
                }
            listeners.append(listener)
        }
    }

    // MARK: Live match sync

    func submitAnswer(_ answer: PlayerAnswer, matchID: String, me: UserProfile) {
        let payload: [String: Any] = [
            "q": answer.questionIndex,
            "s": answer.selectedIndex ?? -1,
            "c": answer.correct,
            "t": answer.timeMs,
            "p": answer.score,
        ]
        db.collection("matches").document(matchID).setData(
            ["answers_\(me.id)": FieldValue.arrayUnion([payload])], merge: true)
    }

    func listenForOpponentAnswers(matchID: String, opponentID: String,
                                  onAnswer: @escaping (PlayerAnswer) -> Void) {
        var delivered = 0
        let listener = db.collection("matches").document(matchID)
            .addSnapshotListener { snapshot, _ in
                guard let raw = snapshot?.get("answers_\(opponentID)") as? [[String: Any]] else { return }
                let answers = raw.compactMap { dict -> PlayerAnswer? in
                    guard let q = dict["q"] as? Int, let t = dict["t"] as? Int,
                          let c = dict["c"] as? Bool, let p = dict["p"] as? Int else { return nil }
                    let s = dict["s"] as? Int
                    return PlayerAnswer(questionIndex: q, selectedIndex: s == -1 ? nil : s,
                                        correct: c, timeMs: t, score: p)
                }.sorted { $0.questionIndex < $1.questionIndex }
                while delivered < answers.count {
                    onAnswer(answers[delivered])
                    delivered += 1
                }
            }
        listeners.append(listener)
    }

    func stopListening() {
        listeners.forEach { $0.remove() }
        listeners.removeAll()
    }
}
