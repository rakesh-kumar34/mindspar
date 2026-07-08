import SwiftUI

/// The lobby: pick a fight. Random human, invited friend, or a bot.
struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @State private var activeDuel: DuelEngine?
    @State private var showBotPicker = false
    @State private var showInviteSheet = false
    @State private var isSearching = false
    @State private var errorMessage: String?
    @State private var selectedDomain: Domain?

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.porcelain.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        greeting
                        if !model.invites.isEmpty {
                            invitesCard
                        }
                        playCard(
                            title: "Quick Match",
                            subtitle: model.backend.isLive
                                ? "Face a random player, live"
                                : "Needs online play (see README)",
                            symbol: "bolt.fill",
                            prominent: true,
                            action: quickMatch)
                        playCard(
                            title: "Challenge a Friend",
                            subtitle: "Invite by username or email",
                            symbol: "person.2.fill",
                            action: { showInviteSheet = true })
                        playCard(
                            title: "Duel a Bot",
                            subtitle: "Five minds, each sharp somewhere else",
                            symbol: "cpu.fill",
                            action: { showBotPicker = true })

                        if let errorMessage {
                            Text(errorMessage)
                                .font(.footnote)
                                .foregroundStyle(Theme.wrong)
                                .padding(.top, 4)
                        }
                    }
                    .padding(20)
                }
                if isSearching {
                    searchingOverlay
                }
            }
            .navigationTitle("Mindspar")
            .sheet(isPresented: $showBotPicker) { botPicker }
            .sheet(isPresented: $showInviteSheet) {
                InviteSheet { duel in activeDuel = duel }
            }
            .fullScreenCover(item: $activeDuel) { duel in
                DuelView(engine: duel) { finished in
                    model.absorb(finished)
                    activeDuel = nil
                }
            }
        }
    }

    private var greeting: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Ready, \(model.profile?.username ?? "player")?")
                    .font(.system(.title2, design: .serif).weight(.semibold))
                    .foregroundStyle(Theme.ink)
                Text("\(Scoring.questionsPerMatch) questions · 8 domains · speed counts")
                    .font(.footnote)
                    .foregroundStyle(Theme.inkSecondary)
            }
            Spacer()
        }
        .padding(.top, 4)
    }

    private var invitesCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Challenges for you", systemImage: "envelope.badge.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.iris)
            ForEach(model.invites) { invite in
                HStack {
                    Text(invite.fromUsername)
                        .font(.body.weight(.medium))
                        .foregroundStyle(Theme.ink)
                    Spacer()
                    Button("Accept") { accept(invite) }
                        .buttonStyle(.borderedProminent)
                        .tint(Theme.iris)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18).fill(Theme.irisSoft))
    }

    private func playCard(title: String, subtitle: String, symbol: String,
                          prominent: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: symbol)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(prominent ? .white : Theme.iris)
                    .frame(width: 48, height: 48)
                    .background(Circle().fill(prominent ? Theme.iris : Theme.irisSoft))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Theme.ink)
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(Theme.inkSecondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.inkSecondary)
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 18).fill(Theme.card))
        }
        .buttonStyle(.plain)
    }

    private var searchingOverlay: some View {
        ZStack {
            Color.black.opacity(0.35).ignoresSafeArea()
            VStack(spacing: 14) {
                ProgressView().controlSize(.large).tint(Theme.iris)
                Text("Finding an opponent…")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.ink)
                Button("Cancel") {
                    isSearching = false
                    if let me = model.profile {
                        Task { await model.backend.cancelMatchmaking(me: me) }
                    }
                }
                .font(.footnote)
                .foregroundStyle(Theme.iris)
            }
            .padding(28)
            .background(RoundedRectangle(cornerRadius: 22).fill(Theme.card))
        }
    }

    private var botPicker: some View {
        NavigationStack {
            ZStack {
                Theme.porcelain.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 12) {
                        subjectPicker
                        ForEach(Bots.roster) { bot in
                            Button {
                                showBotPicker = false
                                startBotDuel(bot)
                            } label: {
                                HStack(spacing: 14) {
                                    Image(systemName: bot.symbol)
                                        .font(.system(size: 18, weight: .semibold))
                                        .foregroundStyle(Theme.iris)
                                        .frame(width: 44, height: 44)
                                        .background(Circle().fill(Theme.irisSoft))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(bot.name)
                                            .font(.body.weight(.semibold))
                                            .foregroundStyle(Theme.ink)
                                        Text(bot.tagline)
                                            .font(.footnote)
                                            .foregroundStyle(Theme.inkSecondary)
                                    }
                                    Spacer()
                                }
                                .padding(14)
                                .background(RoundedRectangle(cornerRadius: 16).fill(Theme.card))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Choose your opponent")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }

    /// "All subjects" for a balanced deck, or drill into one domain —
    /// the whole duel is then drawn from that subject.
    private var subjectPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                subjectChip(title: "All subjects", symbol: "square.grid.2x2.fill",
                            color: Theme.iris, domain: nil)
                ForEach(Domain.allCases) { domain in
                    subjectChip(title: domain.title, symbol: domain.symbol,
                                color: Theme.domainColor(domain), domain: domain)
                }
            }
            .padding(.horizontal, 2)
        }
        .padding(.bottom, 4)
    }

    private func subjectChip(title: String, symbol: String, color: Color, domain: Domain?) -> some View {
        let selected = selectedDomain == domain
        return Button {
            selectedDomain = domain
        } label: {
            Label(title, systemImage: symbol)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(selected ? .white : color)
                .padding(.horizontal, 13)
                .padding(.vertical, 8)
                .background(Capsule().fill(selected ? color : color.opacity(0.12)))
        }
        .buttonStyle(.plain)
    }

    // MARK: Actions

    private func startBotDuel(_ bot: BotProfile) {
        guard let me = model.profile else { return }
        let engine = DuelEngine(bot: bot, me: me, domain: selectedDomain)
        activeDuel = engine
    }

    private func quickMatch() {
        guard let me = model.profile else { return }
        guard model.backend.isLive else {
            errorMessage = BackendError.multiplayerUnavailable.errorDescription
            return
        }
        errorMessage = nil
        isSearching = true
        Task {
            do {
                let human = try await model.backend.findRandomOpponent(me: me)
                guard isSearching else { return }
                isSearching = false
                activeDuel = DuelEngine(human: human, me: me, backend: model.backend)
            } catch {
                isSearching = false
                errorMessage = error.localizedDescription
            }
        }
    }

    private func accept(_ invite: Invite) {
        guard let me = model.profile else { return }
        Task {
            do {
                let human = try await model.backend.acceptInvite(invite, me: me)
                activeDuel = DuelEngine(human: human, me: me, backend: model.backend)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

extension DuelEngine: Identifiable {}

/// Invite a friend by username or email, then wait for them to accept.
struct InviteSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var target = ""
    @State private var status: String?
    @State private var isWaiting = false
    let onMatch: (DuelEngine) -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.porcelain.ignoresSafeArea()
                VStack(spacing: 16) {
                    TextField("Username or email", text: $target)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 14).fill(Theme.card))

                    Button {
                        send()
                    } label: {
                        Group {
                            if isWaiting {
                                HStack(spacing: 8) {
                                    ProgressView().tint(.white)
                                    Text("Waiting for them to accept…")
                                }
                            } else {
                                Text("Send Challenge")
                            }
                        }
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(RoundedRectangle(cornerRadius: 14).fill(Theme.iris))
                        .opacity(target.isEmpty ? 0.4 : 1)
                    }
                    .disabled(target.isEmpty || isWaiting)

                    if let status {
                        Text(status)
                            .font(.footnote)
                            .foregroundStyle(Theme.inkSecondary)
                    }
                    Spacer()
                }
                .padding(20)
            }
            .navigationTitle("Challenge a Friend")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func send() {
        guard let me = model.profile else { return }
        guard model.backend.isLive else {
            status = BackendError.multiplayerUnavailable.errorDescription
            return
        }
        status = nil
        isWaiting = true
        Task {
            do {
                try await model.backend.sendInvite(to: target, from: me)
                let human = try await model.backend.waitForInviteAcceptance(me: me)
                isWaiting = false
                dismiss()
                onMatch(DuelEngine(human: human, me: me, backend: model.backend))
            } catch {
                isWaiting = false
                status = error.localizedDescription
            }
        }
    }
}
