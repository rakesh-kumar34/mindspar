import SwiftUI

/// The arena: the one dark screen in the app. Question front and center,
/// timer draining across the top, both players' scores live at the bottom.
struct DuelView: View {
    @ObservedObject var engine: DuelEngine
    let onFinish: (Match) -> Void

    var body: some View {
        ZStack {
            Theme.arena.ignoresSafeArea()

            switch engine.phase {
            case .countdown(let tick):
                countdown(tick)
            case .playing, .reveal:
                arena
            case .waitingForOpponent:
                waiting
            case .finished:
                ResultsView(match: engine.match, me: engine.me) {
                    onFinish(engine.match)
                }
            }
        }
        .onAppear { engine.start() }
        .onDisappear { engine.abandon() }
    }

    private func countdown(_ tick: Int) -> some View {
        VStack(spacing: 18) {
            Text("vs \(engine.match.opponent.displayName)")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white.opacity(0.6))
            Text("\(tick)")
                .font(.system(size: 96, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .contentTransition(.numericText(countsDown: true))
                .id(tick)
        }
    }

    private var arena: some View {
        VStack(spacing: 0) {
            timerBar
                .padding(.horizontal, 20)
                .padding(.top, 12)

            HStack {
                Text("Q\(engine.currentIndex + 1)/\(engine.match.questions.count)")
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(.white.opacity(0.5))
                Spacer()
                let domain = engine.currentQuestion.domain
                Label(domain.title, systemImage: domain.symbol)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.domainColor(domain))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(Theme.domainColor(domain).opacity(0.18)))
            }
            .padding(.horizontal, 20)
            .padding(.top, 14)

            Spacer()

            Text(engine.currentQuestion.prompt)
                .font(.system(size: 22, weight: .semibold))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
                .padding(.horizontal, 24)
                .minimumScaleFactor(0.7)

            Spacer()

            VStack(spacing: 10) {
                ForEach(engine.currentQuestion.options.indices, id: \.self) { index in
                    answerButton(index)
                }
            }
            .padding(.horizontal, 20)

            scoreboard
                .padding(20)
        }
    }

    private var timerBar: some View {
        GeometryReader { geo in
            let fraction = engine.timeRemaining / engine.currentQuestion.timeLimit
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.12))
                Capsule()
                    .fill(fraction > 0.3 ? Theme.iris : Theme.wrong)
                    .frame(width: max(0, geo.size.width * fraction))
            }
        }
        .frame(height: 5)
    }

    @ViewBuilder
    private func answerButton(_ index: Int) -> some View {
        let question = engine.currentQuestion
        let revealed: Int?? = {
            if case .reveal(let selected) = engine.phase { return selected }
            return nil
        }()

        Button {
            engine.answer(index)
        } label: {
            HStack {
                Text(question.options[index])
                    .font(.body.weight(.medium))
                    .multilineTextAlignment(.leading)
                Spacer()
                if let revealed {
                    if index == question.correctIndex {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.correct)
                    } else if revealed == index {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.wrong)
                    }
                }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(background(for: index, revealed: revealed))
            )
        }
        .buttonStyle(.plain)
        .disabled(engine.phase != .playing)
    }

    private func background(for index: Int, revealed: Int??) -> Color {
        guard let revealed else { return Theme.arenaCard }
        if index == engine.currentQuestion.correctIndex { return Theme.correct.opacity(0.28) }
        if revealed == index { return Theme.wrong.opacity(0.28) }
        return Theme.arenaCard.opacity(0.5)
    }

    private var scoreboard: some View {
        HStack {
            scoreChip(name: "You", score: engine.match.myScore,
                      progress: engine.match.myAnswers.count, highlight: true)
            Spacer()
            scoreChip(name: engine.match.opponent.displayName,
                      score: engine.match.opponentScore,
                      progress: engine.match.opponentAnswers.count, highlight: false)
        }
    }

    private func scoreChip(name: String, score: Int, progress: Int, highlight: Bool) -> some View {
        VStack(spacing: 3) {
            Text(name)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.white.opacity(0.55))
                .lineLimit(1)
            Text("\(score)")
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(highlight ? Theme.iris : .white)
                .contentTransition(.numericText())
            Text("\(progress)/\(engine.match.questions.count) answered")
                .font(.system(size: 9))
                .monospacedDigit()
                .foregroundStyle(.white.opacity(0.4))
        }
        .frame(width: 130)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14).fill(.white.opacity(highlight ? 0.10 : 0.06)))
    }

    private var waiting: some View {
        VStack(spacing: 16) {
            ProgressView().controlSize(.large).tint(.white)
            Text("You're done — waiting for \(engine.match.opponent.displayName)…")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.7))
            scoreboard.padding(.top, 10)
        }
        .padding(24)
    }
}
