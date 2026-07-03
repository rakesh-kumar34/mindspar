import Foundation

/// The bot roster. Each has a personality expressed purely through numbers:
/// where they're sharp, where they're average, and how fast they commit.
enum Bots {
    static let roster: [BotProfile] = [
        BotProfile(
            id: "vega", rating: 1150, name: "Vega", tagline: "Numbers move first",
            symbol: "function",
            accuracy: [.math: 0.90, .patterns: 0.85, .reasoning: 0.70,
                       .verbal: 0.55, .knowledge: 0.55, .science: 0.65],
            minTime: 2.5, maxTime: 7
        ),
        BotProfile(
            id: "lyra", rating: 1100, name: "Lyra", tagline: "Reads between every line",
            symbol: "text.book.closed.fill",
            accuracy: [.verbal: 0.90, .knowledge: 0.80, .reasoning: 0.70,
                       .math: 0.55, .patterns: 0.55, .science: 0.65],
            minTime: 3, maxTime: 8
        ),
        BotProfile(
            id: "atlas", rating: 1050, name: "Atlas", tagline: "Knows a little about everything",
            symbol: "globe.americas.fill",
            accuracy: [.knowledge: 0.88, .science: 0.80, .verbal: 0.70,
                       .reasoning: 0.60, .math: 0.60, .patterns: 0.60],
            minTime: 2.5, maxTime: 7.5
        ),
        BotProfile(
            id: "kepler", rating: 1250, name: "Kepler", tagline: "Methodical, rarely wrong, never fast",
            symbol: "atom",
            accuracy: [.science: 0.92, .reasoning: 0.80, .math: 0.75,
                       .patterns: 0.75, .verbal: 0.65, .knowledge: 0.70],
            minTime: 6, maxTime: 12
        ),
        BotProfile(
            id: "dash", rating: 900, name: "Dash", tagline: "Answers before you finish reading",
            symbol: "bolt.fill",
            accuracy: [.reasoning: 0.62, .math: 0.62, .verbal: 0.62,
                       .knowledge: 0.62, .science: 0.62, .patterns: 0.62],
            minTime: 1.2, maxTime: 3.5
        ),
    ]

    /// Sample one simulated answer for a question.
    static func answer(for bot: BotProfile, question: Question, questionIndex: Int) -> PlayerAnswer {
        let correct = Double.random(in: 0...1) < bot.accuracy(in: question.domain)
        let seconds = Double.random(in: bot.minTime...bot.maxTime)
        let timeMs = Int(min(seconds, question.timeLimit - 0.2) * 1000)
        let selected = correct
            ? question.correctIndex
            : (0..<question.options.count).filter { $0 != question.correctIndex }.randomElement()
        return PlayerAnswer(
            questionIndex: questionIndex,
            selectedIndex: selected,
            correct: correct,
            timeMs: timeMs,
            score: Scoring.score(correct: correct, timeMs: timeMs, timeLimit: question.timeLimit)
        )
    }
}
