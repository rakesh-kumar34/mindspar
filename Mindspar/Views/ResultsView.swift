import SwiftUI

struct ResultsView: View {
    let match: Match
    let me: UserProfile
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Text(headline)
                .font(.system(size: 38, weight: .bold, design: .serif))
                .foregroundStyle(.white)

            HStack(spacing: 30) {
                finalScore(name: "You", score: match.myScore, winner: match.outcome == .win)
                Text("–")
                    .font(.title2)
                    .foregroundStyle(.white.opacity(0.4))
                finalScore(name: match.opponent.displayName, score: match.opponentScore,
                           winner: match.outcome == .loss)
            }

            domainBreakdown
                .padding(.top, 8)

            Spacer()

            Button(action: onDone) {
                Text("Continue")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Theme.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(RoundedRectangle(cornerRadius: 14).fill(.white))
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
    }

    private var headline: String {
        switch match.outcome {
        case .win: return "Victory"
        case .loss: return "Defeat"
        case .draw: return "Draw"
        }
    }

    private func finalScore(name: String, score: Int, winner: Bool) -> some View {
        VStack(spacing: 4) {
            Text(name)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.6))
                .lineLimit(1)
            Text("\(score)")
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(winner ? Theme.iris : .white)
        }
        .frame(width: 120)
    }

    /// Right or wrong per question, grouped by domain.
    private var domainBreakdown: some View {
        VStack(spacing: 8) {
            ForEach(Domain.allCases) { domain in
                let indices = match.questions.indices.filter { match.questions[$0].domain == domain }
                if !indices.isEmpty {
                    HStack(spacing: 10) {
                        Label(domain.title, systemImage: domain.symbol)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(Theme.domainColor(domain))
                            .frame(width: 120, alignment: .leading)
                        HStack(spacing: 5) {
                            ForEach(indices, id: \.self) { index in
                                let answer = match.myAnswers.first { $0.questionIndex == index }
                                Circle()
                                    .fill((answer?.correct ?? false) ? Theme.correct : Theme.wrong.opacity(0.7))
                                    .frame(width: 10, height: 10)
                            }
                        }
                        Spacer()
                    }
                }
            }
        }
        .padding(.horizontal, 40)
    }
}
