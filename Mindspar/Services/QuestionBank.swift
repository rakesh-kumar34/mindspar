import Foundation

enum QuestionBank {
    static let all: [Question] = {
        guard let url = Bundle.main.url(forResource: "questions", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let questions = try? JSONDecoder().decode([Question].self, from: data) else {
            assertionFailure("questions.json missing or malformed")
            return []
        }
        return questions
    }()

    /// A match deck. Balanced across domains by default; pass `domain` for a
    /// subject-focused duel. Pass `targetDifficulty` (1–3) to pull the deck
    /// toward the player's level. Deterministic when a seed is provided (so
    /// both players in a human match draw the identical deck from the same
    /// seed — which is why the target must also be shared in the match doc).
    static func deck(count: Int = Scoring.questionsPerMatch, seed: UInt64? = nil,
                     domain: Domain? = nil, targetDifficulty: Double? = nil,
                     avoiding seen: Set<String> = []) -> [Question] {
        var generator: RandomNumberGenerator = seed.map { SeededGenerator(seed: $0) } ?? SystemRandomNumberGenerator()

        // Best candidates first: unseen beats seen, then closest to the
        // difficulty target (ties keep their shuffled order). NOTE: `seen`
        // must stay empty for seeded human matches — per-user avoidance
        // would make the two players' decks diverge.
        func nearTargetFirst(_ pool: [Question]) -> [Question] {
            guard targetDifficulty != nil || !seen.isEmpty else { return pool }
            func cost(_ q: Question) -> Double {
                let distance = targetDifficulty.map { abs(Double(q.difficulty) - $0) } ?? 0
                return distance + (seen.contains(q.id) ? 10 : 0)
            }
            return pool.enumerated()
                .sorted {
                    let a = cost($0.element), b = cost($1.element)
                    return a == b ? $0.offset < $1.offset : a < b
                }
                .map(\.element)
        }

        if let domain {
            let pool = nearTargetFirst(all.filter { $0.domain == domain }.shuffled(using: &generator))
            return Array(pool.prefix(count)).shuffled(using: &generator)
        }
        var byDomain = Dictionary(grouping: all, by: \.domain)
            .mapValues { nearTargetFirst($0.shuffled(using: &generator)).reversed() as [Question] }
        var deck: [Question] = []
        let domains = Domain.allCases.shuffled(using: &generator)
        outer: while deck.count < count {
            var addedAny = false
            for domain in domains {
                guard deck.count < count else { break outer }
                if let question = byDomain[domain]?.popLast() {
                    deck.append(question)
                    addedAny = true
                }
            }
            if !addedAny { break }
        }
        return deck.shuffled(using: &generator)
    }
}

/// SplitMix64 — small, deterministic, good enough for deck shuffling.
struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed }

    mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
}
