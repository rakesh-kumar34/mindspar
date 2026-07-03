import SwiftUI

/// The player's identity page. This screen carries the brand: generous
/// whitespace, one hero number, quiet cards, no clutter.
struct ProfileView: View {
    @EnvironmentObject private var model: AppModel

    private let cardShadow = Color.black.opacity(0.05)

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.porcelain.ignoresSafeArea()
                if let profile = model.profile {
                    ScrollView {
                        VStack(spacing: 14) {
                            hero(profile)
                            scoreCard(profile)
                            recordCard(profile.stats)
                            domainsCard(profile.stats)
                            disclaimer
                        }
                        .padding(18)
                    }
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sign Out") { model.signOut() }
                        .font(.footnote)
                        .foregroundStyle(Theme.inkSecondary)
                }
            }
        }
    }

    // MARK: Hero — avatar, name, tier

    private func hero(_ profile: UserProfile) -> some View {
        VStack(spacing: 12) {
            Text(profile.username.prefix(1).uppercased())
                .font(.system(size: 32, weight: .semibold, design: .serif))
                .foregroundStyle(.white)
                .frame(width: 84, height: 84)
                .background(
                    Circle().fill(
                        LinearGradient(colors: [Theme.iris, Color(red: 0.55, green: 0.36, blue: 0.96)],
                                       startPoint: .topLeading, endPoint: .bottomTrailing))
                )
                .overlay(Circle().strokeBorder(.white, lineWidth: 3))
                .shadow(color: Theme.iris.opacity(0.25), radius: 14, y: 6)

            Text(profile.username)
                .font(.system(size: 26, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)

            HStack(spacing: 8) {
                Text(Elo.tier(for: profile.stats.rating).uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.6)
                    .foregroundStyle(Theme.iris)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(Theme.irisSoft))
                Text("\(profile.stats.rating)")
                    .font(.footnote.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.inkSecondary)
                Text("·")
                    .foregroundStyle(Theme.inkSecondary.opacity(0.5))
                Text(profile.ageGroup.rawValue)
                    .font(.footnote)
                    .foregroundStyle(Theme.inkSecondary)
            }
        }
        .padding(.vertical, 10)
    }

    // MARK: Score

    private func scoreCard(_ profile: UserProfile) -> some View {
        VStack(spacing: 8) {
            Text("MINDSPAR SCORE")
                .font(.system(size: 11, weight: .semibold))
                .tracking(2.4)
                .foregroundStyle(Theme.inkSecondary)

            if let score = IQModel.score(for: profile.stats, ageGroup: profile.ageGroup) {
                Text("\(score)")
                    .font(.system(size: 72, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(
                        LinearGradient(colors: [Theme.iris, Color(red: 0.55, green: 0.36, blue: 0.96)],
                                       startPoint: .top, endPoint: .bottom))
                    .contentTransition(.numericText())
                Text("Normalized within \(profile.ageGroup.rawValue) · mean 100")
                    .font(.caption)
                    .foregroundStyle(Theme.inkSecondary)
            } else {
                let progress = IQModel.calibrationProgress(for: profile.stats)
                Text("Calibrating")
                    .font(.system(size: 30, weight: .semibold, design: .serif))
                    .foregroundStyle(Theme.ink)
                    .padding(.top, 6)
                ProgressView(value: progress)
                    .tint(Theme.iris)
                    .padding(.horizontal, 48)
                    .padding(.vertical, 4)
                Text("\(IQModel.minimumAnswers) answers unlock your score — \(Int(progress * 100))% there")
                    .font(.caption)
                    .foregroundStyle(Theme.inkSecondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .background(card)
    }

    // MARK: Record

    private func recordCard(_ stats: PlayerStats) -> some View {
        HStack(spacing: 0) {
            statBlock(value: "\(stats.matchesPlayed)", label: "Duels")
            divider
            statBlock(value: "\(stats.matchesWon)", label: "Wins")
            divider
            statBlock(value: stats.matchesPlayed == 0 ? "—" : "\(Int(stats.winRate * 100))%", label: "Win rate")
            divider
            statBlock(value: "\(stats.bestStreak)", label: "Best streak")
        }
        .padding(.vertical, 18)
        .background(card)
    }

    private var divider: some View {
        Rectangle().fill(Theme.porcelain).frame(width: 1, height: 34)
    }

    private func statBlock(value: String, label: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Theme.ink)
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(Theme.inkSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Strengths

    private func domainsCard(_ stats: PlayerStats) -> some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("STRENGTHS")
                .font(.system(size: 11, weight: .semibold))
                .tracking(2.4)
                .foregroundStyle(Theme.inkSecondary)
            ForEach(Domain.allCases) { domain in
                HStack(spacing: 12) {
                    Image(systemName: domain.symbol)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.domainColor(domain))
                        .frame(width: 22)
                    Text(domain.title)
                        .font(.subheadline)
                        .foregroundStyle(Theme.ink)
                        .frame(width: 86, alignment: .leading)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.porcelain)
                            if let accuracy = stats.accuracy(in: domain) {
                                Capsule()
                                    .fill(Theme.domainColor(domain))
                                    .frame(width: max(8, geo.size.width * accuracy))
                            }
                        }
                    }
                    .frame(height: 7)
                    Text(stats.accuracy(in: domain).map { "\(Int($0 * 100))%" } ?? "—")
                        .font(.caption.weight(.medium))
                        .monospacedDigit()
                        .foregroundStyle(Theme.inkSecondary)
                        .frame(width: 38, alignment: .trailing)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(card)
    }

    private var card: some View {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
            .fill(Theme.card)
            .shadow(color: cardShadow, radius: 14, y: 5)
    }

    private var disclaimer: some View {
        Text("The Mindspar Score reflects your relative performance in this game, normalized by age group. It is an entertainment estimate — not a clinical or psychometric IQ assessment.")
            .font(.caption2)
            .foregroundStyle(Theme.inkSecondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .padding(.top, 2)
    }
}
