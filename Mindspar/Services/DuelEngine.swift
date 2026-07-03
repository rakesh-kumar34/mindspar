import Foundation
import SwiftUI

/// Runs one duel: countdown, per-question timer, scoring, opponent feed.
/// Bot opponents are simulated on a local timeline; human opponents stream
/// answers through the backend. The view never knows the difference.
@MainActor
final class DuelEngine: ObservableObject {
    enum Phase: Equatable {
        case countdown(Int)
        case playing
        case reveal(selected: Int?)
        case waitingForOpponent
        case finished
    }

    @Published private(set) var match: Match
    @Published private(set) var phase: Phase = .countdown(3)
    @Published private(set) var currentIndex = 0
    @Published private(set) var timeRemaining: Double = 0

    let me: UserProfile
    private let backend: Backend?
    private let humanMatch: HumanMatch?
    private var timer: Timer?
    private var questionStart: Date?
    private var pending: [Task<Void, Never>] = []

    var currentQuestion: Question { match.questions[currentIndex] }
    var isDone: Bool { match.myAnswers.count == match.questions.count }

    // MARK: Init

    /// Bot duel, optionally focused on one subject. Deck difficulty follows
    /// the player's current rating.
    init(bot: BotProfile, me: UserProfile, domain: Domain? = nil) {
        self.me = me
        self.backend = nil
        self.humanMatch = nil
        self.match = Match(
            id: UUID().uuidString,
            questions: QuestionBank.deck(
                domain: domain,
                targetDifficulty: DifficultyLadder.target(forRating: me.stats.rating),
                avoiding: me.excludedQuestionIDs()),
            opponent: .bot(bot),
            opponentRating: bot.rating)
    }

    init(human: HumanMatch, me: UserProfile, backend: Backend) {
        self.me = me
        self.backend = backend
        self.humanMatch = human
        self.match = Match(
            id: human.matchID,
            questions: QuestionBank.deck(seed: human.seed,
                                         targetDifficulty: human.targetDifficulty),
            opponent: .human(id: human.opponentID, username: human.opponentName),
            opponentRating: human.opponentRating)
    }

    // MARK: Lifecycle

    func start() {
        runCountdown()
        startOpponentFeed()
    }

    func abandon() {
        timer?.invalidate()
        pending.forEach { $0.cancel() }
        backend?.stopListening()
    }

    private func runCountdown() {
        let task = Task { [weak self] in
            for tick in stride(from: 3, through: 1, by: -1) {
                guard let self, !Task.isCancelled else { return }
                self.phase = .countdown(tick)
                try? await Task.sleep(nanoseconds: 800_000_000)
            }
            guard let self, !Task.isCancelled else { return }
            self.beginQuestion()
        }
        pending.append(task)
    }

    private func beginQuestion() {
        phase = .playing
        timeRemaining = currentQuestion.timeLimit
        questionStart = Date()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.phase == .playing else { return }
                self.timeRemaining = max(0, self.timeRemaining - 0.05)
                if self.timeRemaining <= 0 {
                    self.answer(nil)
                }
            }
        }
    }

    // MARK: Answering

    func answer(_ selectedIndex: Int?) {
        guard phase == .playing else { return }
        timer?.invalidate()
        let elapsed = Int(Date().timeIntervalSince(questionStart ?? Date()) * 1000)
        let question = currentQuestion
        let correct = selectedIndex == question.correctIndex
        let answer = PlayerAnswer(
            questionIndex: currentIndex,
            selectedIndex: selectedIndex,
            correct: correct,
            timeMs: min(elapsed, Int(question.timeLimit * 1000)),
            score: Scoring.score(correct: correct, timeMs: elapsed, timeLimit: question.timeLimit))
        match.myAnswers.append(answer)
        if let humanMatch {
            backend?.submitAnswer(answer, matchID: humanMatch.matchID, me: me)
        }

        phase = .reveal(selected: selectedIndex)
        let task = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_100_000_000)
            guard let self, !Task.isCancelled else { return }
            self.advance()
        }
        pending.append(task)
    }

    private func advance() {
        if currentIndex + 1 < match.questions.count {
            currentIndex += 1
            beginQuestion()
        } else if match.opponentAnswers.count >= match.questions.count {
            phase = .finished
        } else {
            phase = .waitingForOpponent
            // Don't wait forever on an abandoned opponent.
            let task = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                guard let self, !Task.isCancelled, self.phase == .waitingForOpponent else { return }
                self.phase = .finished
            }
            pending.append(task)
        }
    }

    // MARK: Opponent feed

    private func startOpponentFeed() {
        switch match.opponent {
        case .bot(let bot):
            // The bot races through the same deck on its own clock.
            var cumulative: Double = 2.4 // countdown
            for (index, question) in match.questions.enumerated() {
                let botAnswer = Bots.answer(for: bot, question: question, questionIndex: index)
                cumulative += Double(botAnswer.timeMs) / 1000 + 1.1
                let fireAt = cumulative
                let task = Task { [weak self] in
                    try? await Task.sleep(nanoseconds: UInt64(fireAt * 1_000_000_000))
                    guard let self, !Task.isCancelled else { return }
                    self.receiveOpponent(botAnswer)
                }
                pending.append(task)
            }
        case .human(let id, _):
            guard let humanMatch else { return }
            backend?.listenForOpponentAnswers(matchID: humanMatch.matchID, opponentID: id) { [weak self] answer in
                Task { @MainActor [weak self] in
                    self?.receiveOpponent(answer)
                }
            }
        }
    }

    private func receiveOpponent(_ answer: PlayerAnswer) {
        match.opponentAnswers.append(answer)
        if phase == .waitingForOpponent,
           match.opponentAnswers.count >= match.questions.count {
            phase = .finished
        }
    }
}
