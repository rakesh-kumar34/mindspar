import Foundation

enum BackendError: LocalizedError {
    case underage
    case usernameTaken
    case userNotFound
    case multiplayerUnavailable
    case matchmakingTimeout

    var errorDescription: String? {
        switch self {
        case .underage: return "Mindspar is for adults 18 and over."
        case .usernameTaken: return "That username is taken."
        case .userNotFound: return "No player found with that username or email."
        case .multiplayerUnavailable:
            return "Online play needs the Firebase configuration (see README). Bots are always available."
        case .matchmakingTimeout: return "No opponent found right now — try a bot!"
        }
    }
}

/// A live human match, as seen by this client.
struct HumanMatch {
    let matchID: String
    let seed: UInt64
    let opponentID: String
    let opponentName: String
    let opponentRating: Int
    /// Shared deck difficulty (average of both players' bands) — both clients
    /// must use the same value or their seeded decks diverge.
    let targetDifficulty: Double
}

struct Invite: Identifiable {
    let id: String
    let fromID: String
    let fromUsername: String
    let fromRating: Int
}

/// Everything the app needs from the outside world. `FirebaseBackend` is the
/// real thing; `LocalBackend` runs the full single-player experience with no
/// account, no network, no configuration.
protocol Backend {
    /// True when online multiplayer is actually available.
    var isLive: Bool { get }

    // Auth
    func restoreSession() async -> UserProfile?
    func signUp(email: String, password: String, username: String, dateOfBirth: Date) async throws -> UserProfile
    func signIn(email: String, password: String) async throws -> UserProfile
    func signOut() throws
    func save(_ profile: UserProfile) async throws

    // Matchmaking
    func findRandomOpponent(me: UserProfile) async throws -> HumanMatch
    func cancelMatchmaking(me: UserProfile) async
    func sendInvite(to usernameOrEmail: String, from me: UserProfile) async throws
    func listenForInvites(me: UserProfile, onChange: @escaping ([Invite]) -> Void)
    func acceptInvite(_ invite: Invite, me: UserProfile) async throws -> HumanMatch
    func waitForInviteAcceptance(me: UserProfile) async throws -> HumanMatch

    // Live match sync
    func submitAnswer(_ answer: PlayerAnswer, matchID: String, me: UserProfile)
    func listenForOpponentAnswers(matchID: String, opponentID: String,
                                  onAnswer: @escaping (PlayerAnswer) -> Void)
    func stopListening()
}

// MARK: - Local (offline) backend

/// No network, no account service: the "session" is a profile stored on
/// device. Everything except human multiplayer works identically.
final class LocalBackend: Backend {
    var isLive: Bool { false }

    private var fileURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("mindspar-profile.json")
    }

    func restoreSession() async -> UserProfile? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(UserProfile.self, from: data)
    }

    func signUp(email: String, password: String, username: String, dateOfBirth: Date) async throws -> UserProfile {
        guard AgeCheck.isAdult(dateOfBirth) else { throw BackendError.underage }
        let profile = UserProfile(id: UUID().uuidString, username: username,
                                  email: email, dateOfBirth: dateOfBirth)
        try await save(profile)
        return profile
    }

    func signIn(email: String, password: String) async throws -> UserProfile {
        if let existing = await restoreSession(), existing.email == email { return existing }
        throw BackendError.userNotFound
    }

    func signOut() throws {
        try? FileManager.default.removeItem(at: fileURL)
    }

    func save(_ profile: UserProfile) async throws {
        let data = try JSONEncoder().encode(profile)
        try data.write(to: fileURL, options: .atomic)
    }

    // Multiplayer is not available offline.
    func findRandomOpponent(me: UserProfile) async throws -> HumanMatch { throw BackendError.multiplayerUnavailable }
    func cancelMatchmaking(me: UserProfile) async {}
    func sendInvite(to usernameOrEmail: String, from me: UserProfile) async throws { throw BackendError.multiplayerUnavailable }
    func listenForInvites(me: UserProfile, onChange: @escaping ([Invite]) -> Void) {}
    func acceptInvite(_ invite: Invite, me: UserProfile) async throws -> HumanMatch { throw BackendError.multiplayerUnavailable }
    func waitForInviteAcceptance(me: UserProfile) async throws -> HumanMatch { throw BackendError.multiplayerUnavailable }
    func submitAnswer(_ answer: PlayerAnswer, matchID: String, me: UserProfile) {}
    func listenForOpponentAnswers(matchID: String, opponentID: String, onAnswer: @escaping (PlayerAnswer) -> Void) {}
    func stopListening() {}
}

enum AgeCheck {
    static func isAdult(_ dateOfBirth: Date) -> Bool {
        let years = Calendar.current.dateComponents([.year], from: dateOfBirth, to: Date()).year ?? 0
        return years >= 18
    }
}
