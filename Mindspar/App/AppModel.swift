import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    @Published var profile: UserProfile?
    @Published var invites: [Invite] = []
    @Published var isRestoring = true

    let backend: Backend

    init(backend: Backend) {
        self.backend = backend
    }

    func restore() async {
        profile = await backend.restoreSession()
        isRestoring = false
        startInviteListener()
    }

    func signUp(email: String, password: String, username: String, dateOfBirth: Date) async throws {
        profile = try await backend.signUp(email: email, password: password,
                                           username: username, dateOfBirth: dateOfBirth)
        startInviteListener()
    }

    func signIn(email: String, password: String) async throws {
        profile = try await backend.signIn(email: email, password: password)
        startInviteListener()
    }

    func signOut() {
        try? backend.signOut()
        backend.stopListening()
        profile = nil
        invites = []
    }

    private func startInviteListener() {
        guard let profile, backend.isLive else { return }
        backend.listenForInvites(me: profile) { [weak self] invites in
            Task { @MainActor [weak self] in
                self?.invites = invites
            }
        }
    }

    /// Fold a finished match into the profile and persist.
    func absorb(_ match: Match) {
        guard var profile else { return }
        IQModel.absorb(match: match, into: &profile.stats)
        // Freshness: remember served questions; prune entries past the window.
        let now = Date()
        for question in match.questions {
            profile.seenQuestions[question.id] = now
            profile.serveCounts[question.id, default: 0] += 1
        }
        let cutoff = now.addingTimeInterval(-14 * 86400)
        profile.seenQuestions = profile.seenQuestions.filter { $0.value > cutoff }
        self.profile = profile
        Task { try? await backend.save(profile) }
    }
}
