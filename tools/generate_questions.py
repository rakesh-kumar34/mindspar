#!/usr/bin/env python3
"""Mindspar question bank generator.

Produces BOTH question files from one source of truth:
  Mindspar/Resources/questions.json  (iOS)
  web/questions.js                   (web client)

Quality strategy: math / pattern / logic questions come from parameterized
templates whose answers are computed, so they are correct by construction.
Verbal / knowledge / science / history / geography come from curated, verified
fact pools with plausible same-category distractors. Deterministic (seeded) so
the bank is stable across runs; bump SEED to reshuffle parameters.

Eight domains x 170 text questions (1360) + 140 visual = 1500 total. Each domain generates a little
more than 150 and is trimmed, so a skipped duplicate never breaks the count.

Run from the repo root:  python3 tools/generate_questions.py
"""
import json
import random
from pathlib import Path

SEED = 7
rng = random.Random(SEED)

PER_DOMAIN = 170
DOMAINS = ["reasoning", "math", "verbal", "knowledge",
           "science", "patterns", "history", "geography"]

QS = []            # {domain, prompt, options[4], correctIndex, difficulty}
_seen = set()      # (prompt, frozenset(options)) — prompts may repeat if options differ


def add(domain, prompt, correct, distractors, difficulty):
    """Register a question. Skips duplicates; validates shape."""
    correct = str(correct)
    options = [correct] + [str(d) for d in distractors]
    options = list(dict.fromkeys(options))          # dedupe, keep order
    key = (prompt, frozenset(options))
    if len(options) < 4 or key in _seen:
        return False
    options = options[:4]
    rng.shuffle(options)
    _seen.add(key)
    QS.append({
        "domain": domain,
        "prompt": prompt,
        "options": options,
        "correctIndex": options.index(correct),
        "difficulty": difficulty,
    })
    return True


def int_distractors(answer, spread):
    """Three plausible wrong integers near the answer."""
    picks = set()
    candidates = [answer + d for d in
                  (-spread, spread, -2 * spread, 2 * spread, -spread // 2 or 1,
                   spread // 2 or 1, spread + 1, -spread - 1, 1, -1)]
    for c in candidates:
        if c != answer and c > 0 and c not in picks:
            picks.add(c)
        if len(picks) == 3:
            break
    return sorted(picks)


NAMES = ["Maya", "Noor", "Priya", "Kavi", "Ravi", "Asha", "Rohan", "Sara",
         "Leo", "Anika", "Omar", "Ishan", "Tara", "Nikhil", "Zara", "Dev"]

# ---------------------------------------------------------------- MATH ----
def gen_math():
    # Percentages (answer integer by construction)
    for p, n in [(15, 240), (25, 320), (30, 150), (12, 400), (35, 200),
                 (45, 180), (8, 250), (65, 140), (18, 350), (55, 220),
                 (28, 450), (75, 160), (5, 480), (40, 130), (85, 300),
                 (22, 500), (36, 250), (64, 175)]:
        add("math", f"What is {p}% of {n}?", p * n // 100,
            int_distractors(p * n // 100, max(2, p * n // 1000 * 5 or 4)),
            1 if p in (25, 50, 75, 10, 5) else 2)

    # Reverse percentage (discount)
    for orig, d in [(1000, 20), (1500, 30), (800, 25), (1200, 15), (2000, 35),
                    (600, 40), (2500, 12), (900, 60), (400, 30), (1600, 45),
                    (750, 20), (3000, 15)]:
        sale = orig * (100 - d) // 100
        add("math", f"A jacket costs {sale:,} after a {d}% discount. What was the original price?",
            f"{orig:,}", [f"{orig + 100:,}", f"{orig - 100:,}", f"{sale + orig - sale // 2:,}"], 2)

    # Linear equations, integer solutions
    for a, x, b in [(3, 9, 7), (4, 8, 5), (5, 7, 12), (7, 6, 9), (6, 12, 13),
                    (8, 9, 15), (9, 8, 11), (4, 15, 18), (11, 7, 16), (12, 6, 19),
                    (5, 13, 8), (6, 9, 17), (7, 11, 5), (3, 16, 11), (9, 12, 25)]:
        c = a * x - b
        add("math", f"If {a}x − {b} = {c}, what is x?", x, int_distractors(x, 2),
            1 if a <= 4 else 2)

    # Speed = distance / time (integer answers)
    for d, t in [(180, 2.5), (240, 3), (150, 2.5), (320, 4), (90, 1.5),
                 (210, 3.5), (280, 3.5), (135, 1.5), (330, 5.5), (220, 2.75)]:
        v = int(d / t)
        if d / t != v:
            continue
        add("math", f"A train covers {d} km in {t} hours. What is its average speed?",
            f"{v} km/h", [f"{v + 4} km/h", f"{v - 4} km/h", f"{v + 8} km/h"], 2)

    # Work rates: w1 workers, d1 days -> w2 workers
    for w1, d1, w2 in [(12, 10, 8), (6, 8, 4), (9, 12, 6), (10, 6, 5),
                       (8, 9, 6), (15, 4, 10), (14, 6, 12), (16, 9, 12),
                       (20, 6, 8), (18, 10, 12)]:
        days = w1 * d1 // w2
        add("math", f"{w1} workers finish a job in {d1} days. At the same rate, how many days would {w2} workers need?",
            days, int_distractors(days, 2), 2)

    # Next prime
    primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59,
              61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113]
    for n in [31, 43, 53, 61, 71, 83, 47, 89, 97, 101]:
        nxt = next(p for p in primes if p > n)
        wrong = [n + 2 if n + 2 != nxt else n + 6, nxt + 2, nxt + 4]
        add("math", f"What is the next prime number after {n}?", nxt, wrong, 2)

    # Exponent rules
    for a, b in [(5, 3), (4, 6), (7, 2), (3, 9), (6, 5), (8, 4), (9, 3), (7, 5)]:
        add("math", f"(2^{a} × 2^{b}) equals 2 raised to which power?", a + b,
            [a * b, a + b + 1, abs(a - b)], 2)
    for a, b in [(2, 3), (3, 2), (4, 2), (2, 5), (3, 4), (5, 2)]:
        add("math", f"(3^{a})^{b} equals 3 raised to which power?", a * b,
            [a + b, a ** b if a ** b != a * b else a * b + 2, a * b - 1], 2)

    # Averages
    for nums in [(12, 18, 24), (7, 11, 15), (20, 30, 40), (9, 14, 25),
                 (16, 22, 34), (5, 25, 45), (13, 21, 32, 46), (10, 20, 30, 40),
                 (8, 16, 27), (11, 23, 35), (6, 18, 33, 43), (15, 25, 44)]:
        avg = sum(nums) // len(nums)
        if sum(nums) % len(nums):
            continue
        add("math", f"What is the average of {', '.join(map(str, nums))}?",
            avg, int_distractors(avg, 3), 2)

    # Fractions of numbers
    for num, den, n in [(3, 4, 96), (2, 3, 84), (5, 8, 64), (3, 5, 75),
                        (4, 7, 91), (5, 6, 72), (7, 8, 56), (2, 9, 81),
                        (3, 7, 84), (5, 9, 108), (4, 5, 115), (7, 12, 96)]:
        ans = n * num // den
        add("math", f"What is {num}/{den} of {n}?", ans, int_distractors(ans, den), 2)

    # Ratios
    for n, a, b in [(60, 2, 3), (90, 4, 5), (120, 3, 5), (84, 3, 4),
                    (150, 7, 8), (72, 5, 7), (110, 5, 6), (96, 5, 11),
                    (130, 6, 7), (140, 3, 7)]:
        larger = n * b // (a + b)
        add("math", f"{n} sweets are split in the ratio {a}:{b}. How many are in the larger share?",
            larger, int_distractors(larger, a + b), 2)

    # Simple interest
    for p, r, t in [(1000, 5, 2), (2000, 4, 3), (1500, 6, 2), (800, 5, 4),
                    (2500, 8, 2), (1200, 10, 3), (3000, 6, 3), (1800, 5, 2)]:
        interest = p * r * t // 100
        add("math", f"Simple interest on {p:,} at {r}% per year for {t} years is:",
            interest, int_distractors(interest, r * t), 2)

    # Rectangle area / perimeter
    for l, w in [(12, 8), (15, 6), (9, 7), (14, 11), (18, 5), (13, 12), (16, 7), (19, 6)]:
        add("math", f"A rectangle is {l} by {w}. What is its area?", l * w,
            [2 * (l + w), l * w + l, l * w - w], 1)
    for l, w in [(16, 9), (11, 7), (21, 13), (17, 8), (14, 9), (23, 11)]:
        add("math", f"A rectangle is {l} by {w}. What is its perimeter?", 2 * (l + w),
            [l * w, 2 * (l + w) + 2, l + w], 1)

    # Squares & roots
    for n in [13, 14, 16, 17, 18, 19, 21, 23, 24, 26]:
        add("math", f"What is {n}²?", n * n, [n * n + n, n * n - n, (n + 1) * (n + 1)], 2)
    for n in [144, 196, 225, 289, 324, 400, 361, 441]:
        r = int(round(n ** 0.5))
        add("math", f"What is the square root of {n}?", r, int_distractors(r, 2), 2)

    # LCM / GCD (small, verified by computation)
    import math as _m
    for a, b in [(6, 8), (4, 10), (9, 12), (8, 12), (6, 15), (10, 14), (12, 18), (8, 14)]:
        lcm = a * b // _m.gcd(a, b)
        add("math", f"What is the least common multiple of {a} and {b}?", lcm,
            [a * b if a * b != lcm else lcm + a, lcm + a, _m.gcd(a, b)], 3)
    for a, b in [(24, 36), (18, 30), (28, 42), (32, 48), (45, 60), (36, 54)]:
        g = _m.gcd(a, b)
        add("math", f"What is the greatest common divisor of {a} and {b}?", g,
            int_distractors(g, 3), 3)

    # Probability (single die / two coins / cards) — exact fractions
    dice = [("rolling an even number on one fair die", "1/2", ["1/3", "1/6", "2/3"], 1),
            ("rolling a number greater than 4 on one fair die", "1/3", ["1/2", "1/6", "2/3"], 2),
            ("rolling a 3 on one fair die", "1/6", ["1/3", "1/2", "1/4"], 1),
            ("getting two heads when tossing two fair coins", "1/4", ["1/2", "1/3", "3/4"], 2),
            ("getting at least one head when tossing two fair coins", "3/4", ["1/2", "1/4", "2/3"], 2),
            ("drawing a heart from a standard 52-card deck", "1/4", ["1/13", "1/2", "1/26"], 2),
            ("drawing an ace from a standard 52-card deck", "1/13", ["1/4", "1/52", "1/26"], 2),
            ("rolling a total of 12 with two fair dice", "1/36", ["1/12", "1/6", "1/18"], 3)]
    for event, ans, wrong, diff in dice:
        add("math", f"What is the probability of {event}?", ans, wrong, diff)

    # Sum of 1..n  (n(n+1)/2)
    for n in [10, 20, 15, 12, 25, 30]:
        s = n * (n + 1) // 2
        add("math", f"What is the sum of all whole numbers from 1 to {n}?", s,
            int_distractors(s, n), 3)

    # Profit / loss
    for cost, sell in [(80, 100), (120, 150), (200, 260), (150, 180), (250, 300), (60, 81)]:
        pct = (sell - cost) * 100 // cost
        add("math", f"Bought at {cost}, sold at {sell}. What is the profit as a percentage of cost?",
            f"{pct}%", [f"{pct + 5}%", [f"{pct - 5}%", f"{pct + 10}%"][0], f"{pct + 10}%"], 3)

    # Angle facts (computed)
    for a, b in [(35, 65), (48, 72), (54, 36), (25, 115), (62, 58), (44, 76)]:
        c = 180 - a - b
        add("math", f"Two angles of a triangle are {a}° and {b}°. What is the third angle?",
            f"{c}°", [f"{c + 10}°", f"{c - 10}°", f"{180 - a}°"], 1)


# ------------------------------------------------------------- PATTERNS ----
def seq_prompt(terms):
    return ", ".join(map(str, terms)) + ", … what comes next?"


def gen_patterns():
    # Triangular numbers with offsets
    for off in [0, 1, 2, 4, 3, 6]:
        terms = [i * (i + 1) // 2 + off for i in range(1, 6)]
        nxt = 21 + off
        add("patterns", seq_prompt(terms), nxt, [nxt + 1, nxt - 2, nxt + 7], 2)

    # Second differences
    for start, d0, inc in [(2, 4, 2), (3, 1, 1), (1, 2, 3), (5, 3, 2),
                           (4, 5, 3), (2, 7, 4), (10, 2, 2), (1, 5, 5),
                           (6, 2, 4), (3, 8, 2), (7, 1, 3), (2, 10, 5),
                           (12, 3, 3), (1, 9, 6), (8, 4, 4), (5, 6, 3),
                           (9, 2, 5), (4, 11, 2), (7, 5, 4), (2, 6, 6),
                           (11, 4, 2), (6, 7, 3)]:
        terms, t, d = [start], start, d0
        for _ in range(4):
            t += d
            terms.append(t)
            d += inc
        nxt = t + d
        add("patterns", seq_prompt(terms), nxt, int_distractors(nxt, inc + 1), 2)

    # Geometric (increasing when start small, decreasing when start large)
    for start, r, n in [(81, 3, 4), (64, 2, 5), (2, 3, 4), (5, 2, 5),
                        (3, 4, 4), (256, 4, 4), (7, 2, 4), (1000, 10, 3),
                        (6, 3, 4), (12, 2, 5), (2, 5, 4), (4096, 4, 5),
                        (486, 3, 5), (11, 2, 4), (4, 3, 4), (729, 3, 4)]:
        terms = [start * r ** i for i in range(n)] if start < 60 else \
                [start // r ** i for i in range(n)]
        nxt = terms[-1] * r if start < 60 else terms[-1] // r
        add("patterns", seq_prompt(terms), nxt,
            [nxt * r if nxt * r != nxt else nxt + 1, max(1, nxt // r), nxt + r],
            1 if r == 2 else 2)

    # Fibonacci-like
    for a, b in [(1, 1), (2, 3), (1, 4), (3, 4), (2, 5), (5, 6),
                 (4, 7), (1, 6), (6, 7), (2, 9), (3, 7), (5, 9)]:
        terms = [a, b]
        for _ in range(4):
            terms.append(terms[-1] + terms[-2])
        nxt = terms[-1] + terms[-2]
        add("patterns", seq_prompt(terms), nxt,
            [nxt + 1, nxt - 2, terms[-1] * 2], 2)

    # x -> k*x + c recurrences
    for start, k, c, n in [(2, 2, -1, 5), (1, 2, 1, 5), (3, 2, -2, 5),
                           (1, 3, -1, 4), (2, 3, 1, 4), (4, 2, 3, 4),
                           (5, 2, -3, 5), (1, 4, -2, 4), (2, 4, -3, 4),
                           (3, 3, 2, 4), (6, 2, -5, 5), (2, 3, -4, 4)]:
        terms = [start]
        for _ in range(n - 1):
            terms.append(terms[-1] * k + c)
        nxt = terms[-1] * k + c
        add("patterns", seq_prompt(terms), nxt, int_distractors(nxt, max(3, abs(c) + k)), 3)

    # Alternating add
    for start, a, b in [(1, 4, 2), (2, 5, 3), (10, 3, 6), (4, 7, 1),
                        (6, 2, 8), (3, 9, 4), (5, 6, 2), (1, 8, 3),
                        (7, 4, 9), (2, 10, 5), (9, 3, 7), (4, 6, 11),
                        (8, 5, 2), (3, 11, 6), (12, 2, 7)]:
        terms, t = [start], start
        for i in range(5):
            t += a if i % 2 == 0 else b
            terms.append(t)
        nxt = t + (a if 5 % 2 == 0 else b)
        add("patterns", seq_prompt(terms), nxt, int_distractors(nxt, a + b), 2)

    # Alternating ×k then +c
    for start, k, c in [(2, 2, 3), (3, 2, 4), (1, 3, 2), (4, 2, 1),
                        (5, 2, 2), (2, 3, 1), (3, 3, 3), (6, 2, 5)]:
        terms, t = [start], start
        for i in range(5):
            t = t * k if i % 2 == 0 else t + c
            terms.append(t)
        nxt = t * k if 5 % 2 == 0 else t + c
        add("patterns", seq_prompt(terms), nxt, int_distractors(nxt, k + c + 2), 3)

    # Letter sequences, growing skips (forward)
    def letters_forward(start, skips):
        out, i = [start], ord(start) - 65
        for s in skips:
            i += s
            out.append(chr(65 + i % 26))
        return out
    for start, base in [("A", 2), ("B", 1), ("C", 2), ("D", 3), ("F", 1), ("H", 2),
                        ("J", 3), ("K", 1), ("M", 2), ("E", 3), ("G", 1), ("L", 2)]:
        skips = [base + i for i in range(4)]
        seq = letters_forward(start, skips)
        nxt_i = (ord(seq[-1]) - 65 + base + 4) % 26
        nxt = chr(65 + nxt_i)
        wrong = [chr(65 + (nxt_i + d) % 26) for d in (1, 2, 24)]
        add("patterns", ", ".join(seq) + ", … which letter comes next?", nxt, wrong, 2)

    # Constant-skip letters (easier)
    for start, skip in [("A", 3), ("B", 4), ("C", 3), ("D", 2), ("E", 4), ("F", 5)]:
        idx = [(ord(start) - 65 + skip * i) % 26 for i in range(5)]
        seq = [chr(65 + i) for i in idx]
        nxt_i = (idx[-1] + skip) % 26
        nxt = chr(65 + nxt_i)
        wrong = [chr(65 + (nxt_i + d) % 26) for d in (1, 25, 2)]
        add("patterns", ", ".join(seq) + ", … which letter comes next?", nxt, wrong, 1)

    # Decreasing with growing negative diffs
    for start, d0, inc in [(100, 4, 4), (90, 2, 3), (120, 5, 5), (80, 1, 2),
                           (200, 10, 10), (150, 3, 6), (60, 1, 3), (110, 6, 2),
                           (140, 8, 4), (75, 5, 1), (95, 3, 4), (170, 7, 6)]:
        terms, t, d = [start], start, d0
        for _ in range(4):
            t -= d
            terms.append(t)
            d += inc
        nxt = t - d
        if nxt <= 0:
            continue
        add("patterns", seq_prompt(terms), nxt, int_distractors(nxt, inc), 2)

    # Squares / cubes with offsets
    for off in [0, 1, 2, -1, 3, 5, 4, -2]:
        terms = [i * i + off for i in range(1, 6)]
        nxt = 36 + off
        add("patterns", seq_prompt(terms), nxt, [nxt + 2, nxt - 2, nxt + 6], 2)
    for off in [0, 1, -1, 2, 3]:
        terms = [i ** 3 + off for i in range(1, 5)]
        nxt = 125 + off
        add("patterns", seq_prompt(terms), nxt, [nxt + 5, nxt - 10, 216 + off], 3)

    # Position products: t(n) = t(n-1) + k*n
    for start, k in [(1, 2), (2, 2), (1, 3), (3, 2), (5, 3), (4, 4), (2, 4),
                     (6, 2), (7, 3), (3, 5), (8, 2), (4, 5), (9, 4)]:
        terms = [start]
        for i in range(2, 6):
            terms.append(terms[-1] + k * i)
        nxt = terms[-1] + k * 6
        add("patterns", seq_prompt(terms), nxt, int_distractors(nxt, k * 2), 2)

    # Interleaved sequences (two independent arithmetic threads)
    for a0, da, b0, db in [(2, 3, 10, -1), (1, 4, 20, 5), (5, 5, 3, 3),
                           (10, 10, 7, 2), (4, 6, 30, -3), (3, 7, 12, 4),
                           (6, 4, 50, -5), (8, 8, 5, 5)]:
        terms = []
        for i in range(3):
            terms.append(a0 + da * i)
            terms.append(b0 + db * i)
        nxt = a0 + da * 3       # 7th term belongs to thread A
        if any(t <= 0 for t in terms):
            continue
        add("patterns", seq_prompt(terms), nxt, int_distractors(nxt, abs(da) + 1), 3)

    # Powers of 2 with offsets
    for off in [0, 1, -1, 3, 5, 2, -2, 4, 6, -3]:
        terms = [2 ** i + off for i in range(1, 6)]
        nxt = 64 + off
        add("patterns", seq_prompt(terms), nxt, [nxt - 16, nxt + 8, nxt + 2], 2)

    # Doubling minus position: t(n) = 2*t(n-1) - n
    for start in [3, 4, 5, 6, 7, 8, 9, 10, 11]:
        terms, t = [start], start
        for i in range(2, 6):
            t = 2 * t - i
            terms.append(t)
        nxt = 2 * t - 6
        add("patterns", seq_prompt(terms), nxt, int_distractors(nxt, 5), 3)


# ------------------------------------------------------------ REASONING ----
def gen_reasoning():
    # Syllogism: All A are B; X is not B => X is not A
    groups = [("florists in Bloomsdale", "early risers"),
              ("violinists in the orchestra", "sight-readers"),
              ("guides on the mountain", "certified climbers"),
              ("chefs at the bistro", "trained bakers"),
              ("pilots at the airfield", "licensed navigators"),
              ("librarians in Westport", "avid readers"),
              ("lifeguards at the bay", "strong swimmers"),
              ("bakers on Mill Street", "early risers"),
              ("referees in the league", "certified officials"),
              ("archivists at the museum", "trained historians"),
              ("rangers in the reserve", "licensed trackers"),
              ("editors at the journal", "careful proofreaders"),
              ("divers on the crew", "certified medics"),
              ("tailors in the guild", "master cutters"),
              ("printers on Fleet Row", "night workers"),
              ("beekeepers in the valley", "registered farmers"),
              ("surveyors on the project", "licensed engineers"),
              ("brewers at the cooperative", "trained chemists"),
              ("coopers at the yard", "licensed joiners"),
              ("scribes at the court", "trained linguists"),
              ("wardens of the park", "certified naturalists"),
              ("masons on the site", "bonded craftsmen"),
              ("clerks of the exchange", "sworn auditors"),
              ("glaziers in the workshop", "insured tradesmen")]
    for i, (a, b) in enumerate(groups):
        name = NAMES[i % len(NAMES)]
        add("reasoning",
            f"All {a} are {b}. {name} is not one of the {b}. What must be true?",
            f"{name} is not one of the {a}",
            [f"{name} is one of the {a}", f"{name} dislikes being one of the {b}",
             "Nothing can be concluded"], 2)

    # Modus tollens
    conds = [("it rains", "the match is postponed", "The match was not postponed", "It did not rain", "It rained lightly"),
             ("the bridge is open", "the ferry is cancelled", "The ferry was not cancelled", "The bridge was not open", "The bridge was open all day"),
             ("the alarm rings", "the doors lock", "The doors did not lock", "The alarm did not ring", "The alarm rang twice"),
             ("the oven is hot", "the light is on", "The light was not on", "The oven was not hot", "The oven was warming up"),
             ("she catches the 8 am train", "she arrives before noon", "She did not arrive before noon", "She did not catch the 8 am train", "She caught a later train home"),
             ("the tide is high", "the cave floods", "The cave did not flood", "The tide was not high", "The tide was rising"),
             ("the kiln is fired", "the workshop smells of smoke", "The workshop did not smell of smoke", "The kiln was not fired", "The kiln was cleaned"),
             ("the road is icy", "the bus takes the tunnel", "The bus did not take the tunnel", "The road was not icy", "The bus was early"),
             ("the review passes", "the update ships on Friday", "The update did not ship on Friday", "The review did not pass", "The review passed twice"),
             ("the harvest is early", "the market opens in August", "The market did not open in August", "The harvest was not early", "The harvest was plentiful"),
             ("the fog lifts", "the lighthouse lamp is dimmed", "The lamp was not dimmed", "The fog did not lift", "The fog thickened at noon"),
             ("the choir rehearses", "the hall stays open late", "The hall did not stay open late", "The choir did not rehearse", "The choir sang twice"),
             ("the generator runs", "the cellar lights work", "The cellar lights did not work", "The generator was not running", "The generator was serviced"),
             ("the pass is clear", "the mail cart goes over the ridge", "The mail cart did not go over the ridge", "The pass was not clear", "The mail was heavy")]
    for p, q, notq, ans, decoy in conds:
        add("reasoning", f"If {p}, {q}. {notq}. What follows?", ans,
            [decoy, f"{q.capitalize()} anyway", "Nothing can be concluded"], 2)

    # Affirming the consequent — the correct answer is "nothing follows"
    aff = [("it snows", "the school closes", "The school closed"),
           ("the dam opens", "the river rises", "The river rose"),
           ("he trains daily", "he qualifies", "He qualified"),
           ("the cafe is busy", "the kitchen is loud", "The kitchen was loud"),
           ("the wind is strong", "the kites fly", "The kites flew"),
           ("the play succeeds", "the run is extended", "The run was extended"),
           ("the seed is watered", "the vine grows", "The vine grew"),
           ("the coach agrees", "the match is rescheduled", "The match was rescheduled")]
    for p, q, qhap in aff:
        add("reasoning",
            f"If {p}, {q}. {qhap}. What can you conclude about whether {p.split(' ', 1)[0]} {p.split(' ', 1)[1]}?",
            "Nothing — the rule doesn't work in reverse",
            [f"Definitely {p}", f"Definitely not {p}", "The rule is false"], 3)

    # Some A are B; all B are C => some A are C
    triples = [("doctors", "pilots", "trained in navigation"),
               ("painters", "sailors", "licensed to sail"),
               ("teachers", "beekeepers", "registered with the guild"),
               ("farmers", "weavers", "members of the craft union"),
               ("dancers", "drummers", "graduates of the academy"),
               ("skaters", "coders", "members of the club"),
               ("poets", "gardeners", "prize winners"),
               ("clerks", "climbers", "trained in first aid"),
               ("singers", "surfers", "certified instructors"),
               ("jugglers", "welders", "union members")]
    for a, b, c in triples:
        add("reasoning", f"Some {a} are {b}. All {b} are {c}. Which must be true?",
            f"Some {a} are {c}",
            [f"All {a} are {c}", f"No {a} are {c}", f"All {c} are {a}"], 2)

    # No Q are R; all P are R => no P are Q
    for p, q, r in [("P", "Q", "R"), ("swans", "runners", "flyers"),
                    ("cubes", "discs", "solids with corners"),
                    ("ferns", "cacti", "shade plants"),
                    ("kayaks", "sleds", "watercraft"),
                    ("owls", "larks", "night hunters")]:
        add("reasoning", f"If no {q} are {r}, and all {p} are {r}, then:",
            f"No {p} are {q}",
            [f"Some {p} are {q}", f"All {q} are {p}", "Nothing can be concluded"], 3)

    # Directions
    dirs = ["North", "East", "South", "West"]
    turn_sets = [["90° right", "180°", "90° left"], ["90° left", "90° left"],
                 ["180°", "90° right"], ["90° right", "90° right", "90° right"],
                 ["90° left", "180°", "90° left"], ["270° right"],
                 ["90° right", "90° left", "180°"], ["180°", "180°", "90° left"],
                 ["90° left", "90° right", "90° left"], ["270° left"],
                 ["90° right", "180°", "180°"], ["90° left", "90° left", "90° left"]]
    for i, turns in enumerate(turn_sets):
        start = i % 4
        heading = start
        for t in turns:
            deg = int(t.split("°")[0])
            steps = deg // 90
            heading = (heading + steps) % 4 if "left" not in t else (heading - steps) % 4
        name = NAMES[(i + 5) % len(NAMES)]
        wrong = [d for d in dirs if d != dirs[heading]][:3]
        add("reasoning",
            f"{name} faces {dirs[start].lower()}. They turn {', then '.join(turns)}. Which way do they face now?",
            dirs[heading], wrong, 2)

    # Ordering puzzles: derive from a random true order
    for i in range(30):
        people = rng.sample(NAMES, 4)
        order = people[:]          # order[0] tallest
        rng.shuffle(order)
        stmts = [f"{order[0]} is taller than {order[1]}",
                 f"{order[1]} is taller than {order[2]}",
                 f"{order[3]} is shorter than {order[2]}"]
        answer = order[1]
        wrong = [p for p in order if p != answer][:3]
        add("reasoning",
            f"{stmts[0]}. {stmts[1]}. {stmts[2]}. Who is second tallest?",
            answer, wrong, 2)

    # "All but n"
    for total, keep, thing in [(17, 9, "goats"), (23, 8, "lamps"), (31, 12, "hens"),
                               (14, 6, "kites"), (26, 11, "boats"), (19, 7, "ducks"),
                               (28, 13, "mugs"), (33, 15, "crates")]:
        add("reasoning", f"A keeper has {total} {thing}. All but {keep} wander off. How many {thing} remain?",
            keep, [total - keep, total, total + keep], 1)

    # Row positions: left k-th, right m-th -> k+m-1 people
    for k, m in [(7, 5), (4, 9), (6, 6), (3, 11), (8, 7), (5, 8), (9, 4),
                 (2, 13), (10, 10), (6, 9), (12, 3), (7, 8)]:
        n = k + m - 1
        name = rng.choice(NAMES)
        add("reasoning",
            f"In a single row, {name} is {k}th from the left and {m}th from the right. How many people are in the row?",
            n, [n + 1, n - 1, k + m], 2)

    # Weekday arithmetic
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    for start, delta in [(0, 10), (2, 16), (4, 9), (1, 23), (5, 12), (3, 30),
                         (6, 15), (0, 45), (2, 100), (4, 26), (1, 61), (5, 39)]:
        ans = days[(start + delta) % 7]
        wrong = [days[(start + delta + d) % 7] for d in (1, 2, 5)]
        add("reasoning",
            f"If today is {days[start]}, what day of the week will it be in {delta} days?",
            ans, wrong, 2)

    # Card-flip rule check (Wason variants)
    for vowel, cons, even, odd in [("A", "K", 4, 7), ("E", "T", 8, 3),
                                   ("I", "M", 6, 9), ("U", "R", 2, 5),
                                   ("O", "B", 10, 11), ("A", "S", 12, 15)]:
        add("reasoning",
            f"Rule: every card with a vowel has an even number on its back. Cards show {vowel}, {cons}, {even}, {odd}. Which cards must you flip to test the rule?",
            f"{vowel} and {odd}",
            [f"{vowel} and {even}", f"{cons} and {even}", "All four"], 3)

    # Family relations (single unambiguous step chains)
    fam = [("the brother of your mother", "Your uncle", ["Your cousin", "Your nephew", "Your grandfather"], 1),
           ("the sister of your father", "Your aunt", ["Your cousin", "Your niece", "Your grandmother"], 1),
           ("the daughter of your uncle", "Your cousin", ["Your niece", "Your aunt", "Your sister"], 1),
           ("the son of your sister", "Your nephew", ["Your cousin", "Your uncle", "Your grandson"], 1),
           ("the mother of your father", "Your grandmother", ["Your aunt", "Your mother-in-law", "Your great-aunt"], 1),
           ("the husband of your daughter", "Your son-in-law", ["Your nephew", "Your brother-in-law", "Your stepson"], 2),
           ("the wife of your brother", "Your sister-in-law", ["Your cousin", "Your aunt", "Your stepsister"], 2),
           ("the father of your mother's mother", "Your great-grandfather", ["Your grandfather", "Your great-uncle", "Your uncle"], 2),
           ("the son of your father's brother", "Your cousin", ["Your nephew", "Your half-brother", "Your uncle"], 1),
           ("the brother of your spouse", "Your brother-in-law", ["Your stepbrother", "Your cousin", "Your son-in-law"], 2)]
    for rel, ans, wrong, diff in fam:
        add("reasoning", f"What relation to you is {rel}?", ans, wrong, diff)

    # Handshake counting: n people, everyone shakes hands once
    for n in [4, 5, 6, 7, 8, 9, 10, 12, 11, 13, 14, 15]:
        total = n * (n - 1) // 2
        add("reasoning",
            f"{n} people meet and each pair shakes hands exactly once. How many handshakes happen?",
            total, [n * (n - 1), total + n, total - n + 1 if total - n + 1 not in (total, n * (n - 1)) else total + 1], 2)

    # Chained comparisons — who is the youngest?
    for i in range(16):
        trio = rng.sample(NAMES, 3)
        # trio[0] oldest, trio[2] youngest
        add("reasoning",
            f"{trio[0]} is older than {trio[1]}. {trio[1]} is older than {trio[2]}. Who is the youngest?",
            trio[2], [trio[0], trio[1], "It cannot be determined"], 1)

    # Simple truth-teller/liar
    for i, (thing, place_a, place_b) in enumerate([
            ("key", "red box", "blue box"), ("coin", "left drawer", "right drawer"),
            ("map", "green chest", "black chest"), ("ticket", "top shelf", "bottom shelf"),
            ("letter", "oak desk", "pine desk"), ("ring", "north room", "south room")]):
        liar = NAMES[i]
        honest = NAMES[i + 6]
        add("reasoning",
            f"{honest} always tells the truth; {liar} always lies. {honest} says the {thing} is in the {place_a}. {liar} says the {thing} is in the {place_b}. Where is the {thing}?",
            f"In the {place_a}",
            [f"In the {place_b}", "In neither place", "It cannot be determined"], 2)


# --------------------------------------------------------------- VERBAL ----
def gen_verbal():
    analogies = [
        ("GLOVE", "HAND", "SOCK", "Foot", ["Shoe", "Wool", "Ankle"]),
        ("AUTHOR", "NOVEL", "SCULPTOR", "Statue", ["Chisel", "Marble", "Gallery"]),
        ("BIRD", "NEST", "BEE", "Hive", ["Honey", "Flower", "Swarm"]),
        ("PAINTER", "CANVAS", "WRITER", "Page", ["Pen", "Story", "Desk"]),
        ("KEY", "LOCK", "PASSWORD", "Account", ["Keyboard", "Letter", "Screen"]),
        ("SEED", "TREE", "EGG", "Bird", ["Shell", "Nest", "Feather"]),
        ("LIBRARY", "BOOKS", "ORCHARD", "Trees", ["Fruit", "Farmers", "Fences"]),
        ("CAPTAIN", "SHIP", "PILOT", "Aircraft", ["Runway", "Anchor", "Harbor"]),
        ("THERMOMETER", "TEMPERATURE", "SCALE", "Weight", ["Height", "Balance", "Metal"]),
        ("SHEEP", "FLOCK", "WOLF", "Pack", ["Den", "Herd", "Litter"]),
        ("EYE", "SEE", "EAR", "Hear", ["Sound", "Listen loudly", "Speak"]),
        ("HAMMER", "NAIL", "SCREWDRIVER", "Screw", ["Bolt", "Drill", "Wrench"]),
        ("CHAPTER", "BOOK", "SCENE", "Play", ["Actor", "Stage", "Ticket"]),
        ("WATER", "THIRST", "FOOD", "Hunger", ["Taste", "Kitchen", "Meal"]),
        ("SPIDER", "WEB", "BEAVER", "Dam", ["River", "Wood", "Lodgepole"]),
        ("DOCTOR", "HOSPITAL", "JUDGE", "Court", ["Jury", "Lawyer", "Verdict"]),
        ("CATERPILLAR", "BUTTERFLY", "TADPOLE", "Frog", ["Fish", "Pond", "Newt"]),
        ("SUGAR", "SWEET", "LEMON", "Sour", ["Yellow", "Juice", "Bitter melon"]),
        ("SHIP", "FLEET", "STAR", "Constellation", ["Galaxy cluster", "Planet", "Comet"]),
        ("COBBLER", "SHOES", "TAILOR", "Clothes", ["Scissors", "Fabric", "Fashion"]),
        ("BAKER", "BREAD", "POTTER", "Pottery", ["Clay", "Kiln", "Wheel"]),
        ("PEN", "WRITE", "KNIFE", "Cut", ["Sharpen", "Blade", "Cook"]),
        ("FISH", "SCHOOL", "LION", "Pride", ["Den", "Jungle", "Roar"]),
        ("MOON", "EARTH", "EARTH", "Sun", ["Mars", "Sky", "Stars"]),
        ("SMILE", "JOY", "FROWN", "Displeasure", ["Face", "Anger management", "Tears"]),
        ("ARCHITECT", "BUILDING", "COMPOSER", "Symphony", ["Piano", "Concert", "Orchestra"]),
        ("GRAPE", "VINEYARD", "APPLE", "Orchard", ["Cider", "Basket", "Farm field"]),
        ("ACTOR", "STAGE", "GLADIATOR", "Arena", ["Sword", "Rome", "Crowd"]),
        ("INCH", "FOOT", "CENTIMETER", "Meter", ["Kilogram", "Litre", "Yard"]),
        ("WHISPER", "QUIET", "SHOUT", "Loud", ["Angry", "Voice", "Echo"]),
        ("BEE", "STING", "SNAKE", "Bite", ["Venom", "Hiss", "Slither"]),
        ("PAGE", "BOOK", "BRICK", "Wall", ["Cement", "House key", "Builder"]),
        ("SAILOR", "NAVY", "SOLDIER", "Army", ["Battle", "Rifle", "Uniform"]),
        ("CHEF", "KITCHEN", "SMITH", "Forge", ["Hammer", "Iron", "Fire pit"]),
        ("WOOL", "SHEEP", "SILK", "Silkworm", ["Cotton plant", "Spider", "Loom"]),
        ("TELESCOPE", "FAR", "MICROSCOPE", "Small", ["Near", "Cells", "Glass"]),
        ("HOUR", "CLOCK", "DATE", "Calendar", ["Month", "Diary", "Year"]),
        ("ORCHESTRA", "CONDUCTOR", "TEAM", "Coach", ["Captain's log", "Referee", "Stadium"]),
    ]
    for a, b, c, ans, wrong in analogies:
        add("verbal", f"{a} is to {b} as {c} is to:", ans, wrong, 1)

    synonyms = [
        ("CANDID", "Frank", ["Guarded", "Clever", "Sweet"], 2),
        ("EPHEMERAL", "Short-lived", ["Delicate", "Glowing", "Rare"], 3),
        ("ABUNDANT", "Plentiful", ["Scarce", "Heavy", "Loud"], 1),
        ("DILIGENT", "Hard-working", ["Careless", "Talented", "Quick"], 2),
        ("LUCID", "Clear", ["Bright", "Confusing", "Loose"], 2),
        ("FRUGAL", "Thrifty", ["Wasteful", "Fragile", "Generous"], 2),
        ("OBSTINATE", "Stubborn", ["Flexible", "Rude", "Lazy"], 2),
        ("BENEVOLENT", "Kind", ["Wealthy", "Strict", "Proud"], 2),
        ("TRANQUIL", "Calm", ["Noisy", "Distant", "Cold"], 2),
        ("METICULOUS", "Precise", ["Messy", "Slow", "Nervous"], 2),
        ("AUGMENT", "Increase", ["Argue", "Reduce", "Predict"], 3),
        ("CONCISE", "Brief", ["Wordy", "Exact", "Polite"], 2),
        ("NOVICE", "Beginner", ["Expert", "Author", "Priest"], 2),
        ("PROHIBIT", "Forbid", ["Allow", "Punish", "Delay"], 1),
        ("VIVID", "Striking", ["Faint", "Alive", "Fast"], 2),
        ("RESILIENT", "Quick to recover", ["Easily broken", "Very strong", "Stubborn"], 2),
        ("AMBIGUOUS", "Unclear", ["Ambitious", "Certain", "Twofold"], 3),
        ("PRUDENT", "Cautious", ["Reckless", "Proud", "Wise-looking"], 2),
        ("SCRUTINIZE", "Examine closely", ["Glance at", "Criticize", "Copy"], 3),
        ("ELATED", "Overjoyed", ["Exhausted", "Late", "Depressed"], 2),
        ("GREGARIOUS", "Sociable", ["Solitary", "Greedy", "Talent-filled"], 3),
        ("TENACIOUS", "Persistent", ["Tender", "Timid", "Tense"], 2),
        ("OPULENT", "Luxurious", ["Modest", "Heavy", "Overcast"], 3),
        ("BREVITY", "Shortness", ["Bravery", "Depth", "Speed"], 3),
        ("ARDUOUS", "Difficult", ["Passionate", "Easy", "Long-winded"], 2),
        ("PLACID", "Peaceful", ["Flat", "Pale", "Sluggish"], 2),
        ("ASTUTE", "Shrewd", ["Rigid", "Rude", "Distant"], 3),
        ("VERBOSE", "Wordy", ["Spoken", "Brief", "Loud"], 3),
        ("ZENITH", "Highest point", ["Lowest point", "Middle", "Horizon"], 2),
        ("RETICENT", "Reserved", ["Talkative", "Repetitive", "Resentful"], 3),
        ("CORDIAL", "Warm and friendly", ["Formal and cold", "Brave", "Careful"], 2),
        ("IMMACULATE", "Spotless", ["Enormous", "Ancient", "Flawed"], 2),
        ("INDIFFERENT", "Unconcerned", ["Unique", "Angry", "Undecided but anxious"], 2),
        ("ROBUST", "Sturdy", ["Loud", "Rough", "Rapid"], 2),
        ("SPORADIC", "Occasional", ["Constant", "Athletic", "Scattered seeds"], 3),
        ("WARY", "Cautious", ["Tired", "Hostile", "Lost"], 2),
        ("JUBILANT", "Rejoicing", ["Nervous", "Youthful", "Proud"], 2),
        ("OBSOLETE", "Out of date", ["Forgotten", "Broken", "Rare"], 2),
        ("PRAGMATIC", "Practical", ["Proud", "Talkative", "Idealistic"], 3),
        ("SERENE", "Calm", ["Severe", "Bright", "Solemn"], 2),
        ("ADEPT", "Skilled", ["Clumsy", "Eager", "Adopted"], 2),
        ("MUNDANE", "Ordinary", ["Worldly wise", "Boring speech", "Sacred"], 3),
        ("VILIFY", "Speak ill of", ["Praise", "Verify", "Simplify"], 3),
    ]
    for word, ans, wrong, diff in synonyms:
        add("verbal", f"Which word is closest in meaning to {word}?", ans, wrong, diff)

    antonyms = [
        ("SCARCE", "Abundant", ["Rare", "Costly", "Hidden"], 1),
        ("EXPAND", "Contract", ["Explode", "Extend", "Enlarge"], 1),
        ("ANCIENT", "Modern", ["Old", "Historic", "Ruined"], 1),
        ("TRANSPARENT", "Opaque", ["Clear", "Thin", "Fragile"], 2),
        ("HUMBLE", "Arrogant", ["Shy", "Quiet", "Honest"], 2),
        ("ACCELERATE", "Decelerate", ["Drive", "Advance", "Rotate"], 1),
        ("SURPLUS", "Shortage", ["Extra", "Profit", "Storage"], 2),
        ("HOSTILE", "Friendly", ["Angry", "Foreign", "Armed"], 1),
        ("RIGID", "Flexible", ["Hard", "Upright", "Rough"], 1),
        ("VICTORY", "Defeat", ["Battle", "Trophy", "Draw"], 1),
        ("OPTIMIST", "Pessimist", ["Realist", "Dreamer", "Critic"], 1),
        ("PERMANENT", "Temporary", ["Solid", "Eternal", "Frequent"], 1),
        ("GENEROUS", "Stingy", ["Wealthy", "Kindly", "Careful"], 2),
        ("CHAOS", "Order", ["Noise", "Storm", "Crowd"], 2),
        ("CONCEAL", "Reveal", ["Cover", "Protect", "Contain"], 2),
        ("PROSPERITY", "Poverty", ["Wealth", "Property", "Progress"], 2),
        ("TIMID", "Bold", ["Shy", "Gentle", "Small"], 1),
        ("DENSE", "Sparse", ["Thick", "Heavy", "Dark"], 2),
        ("FLOURISH", "Wither", ["Bloom", "Wave", "Trumpet"], 2),
        ("CANDOR", "Deceitfulness", ["Honesty", "Warmth", "Rudeness"], 3),
        ("STATIC", "Dynamic", ["Quiet", "Electric", "Steady"], 2),
        ("AMATEUR", "Professional", ["Beginner", "Volunteer", "Enthusiast"], 1),
        ("LETHARGIC", "Energetic", ["Sleepy", "Sluggish", "Calm"], 2),
        ("ADVERSITY", "Good fortune", ["Hardship", "Bravery", "Rivalry"], 2),
        ("FRIVOLOUS", "Serious", ["Playful", "Cheap", "Casual"], 2),
        ("UNIFORM", "Varied", ["Identical", "Dressed", "Plain"], 2),
        ("HARMONY", "Discord", ["Melody", "Peace", "Rhythm"], 2),
        ("VAGUE", "Precise", ["Blurry", "Empty", "Distant"], 1),
        ("ARTIFICIAL", "Natural", ["Plastic", "Clever", "Decorative"], 1),
        ("ZENITH", "Nadir", ["Peak", "Horizon", "Summit"], 3),
        ("BENIGN", "Harmful", ["Gentle", "Blind", "Mild"], 2),
    ]
    for word, ans, wrong, diff in antonyms:
        add("verbal", f"Which word is the opposite of {word}?", ans, wrong, diff)

    odd_ones = [
        (["Whisper", "Murmur", "Mutter"], "Shout", 1),
        (["Oak", "Maple", "Cedar"], "Tulip", 1),
        (["Violin", "Cello", "Guitar"], "Trumpet", 2),
        (["Copper", "Iron", "Zinc"], "Granite", 2),
        (["Sprint", "Jog", "Dash"], "Crawl", 2),
        (["Novel", "Biography", "Memoir"], "Sonnet", 2),
        (["Mercury", "Venus", "Mars"], "Titan", 2),
        (["Delighted", "Cheerful", "Jubilant"], "Gloomy", 1),
        (["Hammer", "Saw", "Chisel"], "Nail", 3),
        (["Salmon", "Trout", "Cod"], "Dolphin", 2),
        (["Square", "Rectangle", "Rhombus"], "Circle", 1),
        (["Ballet", "Tango", "Waltz"], "Opera", 2),
        (["Drizzle", "Downpour", "Shower"], "Drought", 2),
        (["Amble", "Stroll", "Saunter"], "Sprint", 2),
        (["Eagle", "Hawk", "Falcon"], "Penguin", 1),
        (["Cotton", "Linen", "Wool"], "Nylon", 3),
        (["Breeze", "Gust", "Gale"], "Ripple", 2),
        (["Flute", "Clarinet", "Oboe"], "Drum", 2),
        (["Lisbon", "Madrid", "Rome"], "Cairo", 2),
        (["Triangle", "Pentagon", "Hexagon"], "Sphere", 2),
        (["Joyful", "Content", "Pleased"], "Furious", 1),
        (["Kayak", "Canoe", "Raft"], "Sledge", 1),
        (["Basil", "Thyme", "Oregano"], "Cinnamon", 3),
        (["Sketch", "Doodle", "Drawing"], "Sculpture", 2),
        (["Glance", "Peek", "Glimpse"], "Stare", 2),
        (["Mango", "Papaya", "Guava"], "Cabbage", 1),
        (["Cello", "Harp", "Lute"], "Bugle", 3),
    ]
    for group, odd, diff in odd_ones:
        add("verbal", "Pick the odd one out:", odd, group, diff)

    meanings = [
        ("to make less severe", "Mitigate", ["Aggravate", "Replicate", "Insinuate"], 2),
        ("to give up a throne or position", "Abdicate", ["Advocate", "Abduct", "Dedicate"], 3),
        ("lasting for a very short time", "Fleeting", ["Enduring", "Frequent", "Sudden"], 2),
        ("a person who loves books", "Bibliophile", ["Bibliographer", "Philosopher", "Curator"], 3),
        ("impossible to deny or disprove", "Irrefutable", ["Irrelevant", "Irregular", "Impartial"], 3),
        ("to officially cancel a law", "Repeal", ["Repel", "Appeal", "Reprove"], 3),
        ("a solution for all problems", "Panacea", ["Paradox", "Placebo", "Pinnacle"], 3),
        ("to walk in a leisurely way", "Saunter", ["Scurry", "Trudge", "March"], 2),
        ("deliberately avoiding work", "Shirking", ["Sharing", "Shivering", "Shepherding"], 2),
        ("expressed clearly and in few words", "Succinct", ["Distinct", "Extinct", "Sustained"], 3),
        ("a name written by a person for themselves", "Autograph", ["Autonomy", "Epigraph", "Monogram"], 2),
        ("fear of enclosed spaces", "Claustrophobia", ["Acrophobia", "Agoraphobia", "Arachnophobia"], 2),
        ("someone who studies the stars scientifically", "Astronomer", ["Astrologer", "Navigator", "Meteorologist"], 1),
        ("a word with the same meaning as another", "Synonym", ["Antonym", "Homonym", "Pseudonym"], 1),
        ("a story handed down that may not be true", "Legend", ["Ledger", "Lesson", "Lecture"], 1),
        ("to express strong disapproval", "Condemn", ["Commend", "Confide", "Concede"], 2),
        ("existing or happening at the same time", "Simultaneous", ["Spontaneous", "Sequential", "Instantaneous"], 2),
        ("having many skills or uses", "Versatile", ["Volatile", "Veracious", "Vicarious"], 2),
        ("a person new to a profession", "Rookie", ["Veteran", "Referee", "Patron"], 1),
        ("to state without proof", "Allege", ["Confirm", "Attest", "Verify"], 3),
        ("careful management of money", "Thrift", ["Theft", "Tariff", "Trust"], 2),
        ("a gentle wind", "Breeze", ["Gale", "Torrent", "Draught horse"], 1),
    ]
    for definition, ans, wrong, diff in meanings:
        add("verbal", f'Which word means "{definition}"?', ans, wrong, diff)

    sentences = [
        ('"The committee\'s decision was unanimous" means:', "Everyone agreed",
         ["Most members agreed", "The vote was secret", "The decision was final"], 1),
        ('"She gave a tacit approval" means her approval was:', "Implied without being spoken",
         ["Loudly declared", "Written and signed", "Reluctantly withdrawn"], 3),
        ('"His argument was cogent" means it was:', "Clear and convincing",
         ["Long and rambling", "Angry and loud", "Secretive"], 3),
        ('"They reached an impasse" means:', "No progress was possible",
         ["They found a shortcut", "They signed a deal", "They changed leaders"], 2),
        ('"A prolific writer" is one who:', "Produces many works",
         ["Writes professionally", "Is widely translated", "Writes about the past"], 2),
        ('"The evidence was circumstantial" means it:', "Suggested guilt indirectly",
         ["Proved guilt directly", "Was fabricated", "Was ruled inadmissible"], 3),
        ('"He spoke with brutal candor" means he was:', "Bluntly honest",
         ["Cruelly sarcastic", "Carefully diplomatic", "Loudly aggressive"], 2),
        ('"The rumor was baseless" means it:', "Had no foundation in fact",
         ["Spread very quickly", "Was partly true", "Came from a known source"], 1),
        ('"She remained impartial" means she:', "Favored neither side",
         ["Refused to attend", "Kept her opinion loud", "Supported the winner"], 1),
        ('"The plan was shelved" means it was:', "Set aside for later",
         ["Approved at once", "Executed secretly", "Rejected forever"], 2),
        ('"His account corroborated hers" means it:', "Supported her version",
         ["Contradicted her version", "Replaced her version", "Simplified her version"], 3),
        ('"A meteoric rise" describes success that is:', "Rapid and dramatic",
         ["Slow and steady", "Short and unnoticed", "Borrowed from others"], 2),
    ]
    for prompt, ans, wrong, diff in sentences:
        add("verbal", prompt, ans, wrong, diff)

    # Collective nouns — classic, stable
    collectives = [
        ("lions", "Pride", ["Pack", "Herd", "Troop"], 1),
        ("wolves", "Pack", ["Pride", "Flock", "Gaggle"], 1),
        ("crows", "Murder", ["Parliament", "Gaggle", "Colony"], 3),
        ("owls", "Parliament", ["Murder", "Wake", "Court"], 3),
        ("geese on the ground", "Gaggle", ["Flight", "Pod", "Swarm"], 2),
        ("whales", "Pod", ["School", "Herd", "Fleet"], 2),
        ("bees", "Swarm", ["Cloud", "Flock", "Litter"], 1),
        ("puppies born together", "Litter", ["Brood", "Clutch", "Kennel"], 1),
        ("ants", "Colony", ["Swarm city", "Nest herd", "Legion"], 1),
        ("fish swimming together", "School", ["Class", "Pod", "Fleet"], 1),
    ]
    for animal, ans, wrong, diff in collectives:
        add("verbal", f"A group of {animal} is called a:", ans, wrong, diff)


# ------------------------------------------------------------ KNOWLEDGE ----
# Arts, literature, music, sport, inventions, mythology, everyday culture.
# (Capitals, landmarks and physical geography live in the geography domain.)
def gen_knowledge():
    currencies = [
        ("Japan", "Yen", ["Won", "Yuan", "Ringgit"], 1),
        ("India", "Rupee", ["Taka", "Rupiah", "Dinar"], 1),
        ("United Kingdom", "Pound sterling", ["Euro", "Dollar", "Franc"], 1),
        ("Mexico", "Peso", ["Real", "Bolívar", "Colón"], 1),
        ("Russia", "Ruble", ["Hryvnia", "Złoty", "Lev"], 2),
        ("South Korea", "Won", ["Yen", "Yuan", "Baht"], 2),
        ("China", "Yuan", ["Yen", "Won", "Dong"], 1),
        ("Sweden", "Krona", ["Euro", "Franc", "Mark"], 2),
        ("Switzerland", "Franc", ["Euro", "Krone", "Mark"], 2),
        ("Brazil", "Real", ["Peso", "Escudo", "Cruzado"], 2),
        ("South Africa", "Rand", ["Shilling", "Naira", "Cedi"], 2),
        ("Turkey", "Lira", ["Dinar", "Dirham", "Drachma"], 2),
        ("Thailand", "Baht", ["Dong", "Ringgit", "Kip"], 2),
        ("Vietnam", "Dong", ["Baht", "Kyat", "Riel"], 3),
        ("Poland", "Złoty", ["Koruna", "Forint", "Lev"], 3),
        ("Bangladesh", "Taka", ["Rupee", "Kyat", "Afghani"], 3),
        ("Indonesia", "Rupiah", ["Rupee", "Ringgit", "Peso"], 2),
        ("Malaysia", "Ringgit", ["Rupiah", "Baht", "Peso"], 2),
        ("Israel", "Shekel", ["Dinar", "Lira", "Dirham"], 2),
        ("Denmark", "Krone", ["Euro", "Krona", "Guilder"], 3),
        ("Egypt", "Egyptian pound", ["Dinar", "Dirham", "Riyal"], 2),
        ("Saudi Arabia", "Riyal", ["Dinar", "Dirham", "Lira"], 2),
    ]
    for country, cur, wrong, diff in currencies:
        add("knowledge", f"What is the currency of {country}?", cur, wrong, diff)

    authors = [
        ("Pride and Prejudice", "Jane Austen", ["Charlotte Brontë", "Emily Brontë", "George Eliot"], 2),
        ("1984", "George Orwell", ["Aldous Huxley", "Ray Bradbury", "H. G. Wells"], 1),
        ("Romeo and Juliet", "William Shakespeare", ["Christopher Marlowe", "Ben Jonson", "John Milton"], 1),
        ("War and Peace", "Leo Tolstoy", ["Fyodor Dostoevsky", "Anton Chekhov", "Ivan Turgenev"], 2),
        ("The Odyssey", "Homer", ["Virgil", "Sophocles", "Ovid"], 1),
        ("Don Quixote", "Miguel de Cervantes", ["Gabriel García Márquez", "Federico García Lorca", "Jorge Luis Borges"], 2),
        ("Crime and Punishment", "Fyodor Dostoevsky", ["Leo Tolstoy", "Nikolai Gogol", "Maxim Gorky"], 2),
        ("The Adventures of Sherlock Holmes", "Arthur Conan Doyle", ["Agatha Christie", "Edgar Allan Poe", "Wilkie Collins"], 1),
        ("Frankenstein", "Mary Shelley", ["Bram Stoker", "Percy Shelley", "Lord Byron"], 2),
        ("Dracula", "Bram Stoker", ["Mary Shelley", "Oscar Wilde", "Robert Louis Stevenson"], 2),
        ("The Old Man and the Sea", "Ernest Hemingway", ["John Steinbeck", "William Faulkner", "F. Scott Fitzgerald"], 2),
        ("One Hundred Years of Solitude", "Gabriel García Márquez", ["Pablo Neruda", "Mario Vargas Llosa", "Isabel Allende"], 3),
        ("Hamlet", "William Shakespeare", ["Sophocles", "Oscar Wilde", "Anton Chekhov"], 1),
        ("The Great Gatsby", "F. Scott Fitzgerald", ["Ernest Hemingway", "John Steinbeck", "T. S. Eliot"], 2),
        ("Moby-Dick", "Herman Melville", ["Nathaniel Hawthorne", "Mark Twain", "Jack London"], 2),
        ("Great Expectations", "Charles Dickens", ["Thomas Hardy", "Anthony Trollope", "William Thackeray"], 2),
        ("The Divine Comedy", "Dante Alighieri", ["Petrarch", "Boccaccio", "Machiavelli"], 2),
        ("Anna Karenina", "Leo Tolstoy", ["Fyodor Dostoevsky", "Ivan Turgenev", "Boris Pasternak"], 2),
        ("The Count of Monte Cristo", "Alexandre Dumas", ["Victor Hugo", "Jules Verne", "Gustave Flaubert"], 2),
        ("Les Misérables", "Victor Hugo", ["Alexandre Dumas", "Émile Zola", "Honoré de Balzac"], 2),
        ("Jane Eyre", "Charlotte Brontë", ["Jane Austen", "Emily Brontë", "Elizabeth Gaskell"], 2),
        ("Wuthering Heights", "Emily Brontë", ["Charlotte Brontë", "Anne Brontë", "Mary Shelley"], 3),
        ("The Picture of Dorian Gray", "Oscar Wilde", ["Bram Stoker", "Henry James", "George Bernard Shaw"], 2),
        ("Twenty Thousand Leagues Under the Seas", "Jules Verne", ["H. G. Wells", "Alexandre Dumas", "Robert Louis Stevenson"], 2),
        ("The Iliad", "Homer", ["Virgil", "Herodotus", "Aeschylus"], 1),
    ]
    for work, ans, wrong, diff in authors:
        add("knowledge", f"Who wrote “{work}”?", ans, wrong, diff)

    art = [
        ("Who painted the Mona Lisa?", "Leonardo da Vinci", ["Michelangelo", "Raphael", "Botticelli"], 1),
        ("Who painted The Starry Night?", "Vincent van Gogh", ["Claude Monet", "Paul Cézanne", "Paul Gauguin"], 1),
        ("Who painted the ceiling of the Sistine Chapel?", "Michelangelo", ["Leonardo da Vinci", "Raphael", "Titian"], 2),
        ("Who painted The Persistence of Memory (the melting clocks)?", "Salvador Dalí", ["Pablo Picasso", "René Magritte", "Joan Miró"], 2),
        ("Who painted Guernica?", "Pablo Picasso", ["Salvador Dalí", "Diego Rivera", "Henri Matisse"], 2),
        ("Who sculpted David in Florence?", "Michelangelo", ["Donatello", "Bernini", "Rodin"], 2),
        ("Who painted The Scream?", "Edvard Munch", ["Gustav Klimt", "Egon Schiele", "Wassily Kandinsky"], 2),
        ("Who painted Girl with a Pearl Earring?", "Johannes Vermeer", ["Rembrandt", "Jan van Eyck", "Frans Hals"], 3),
        ("Water Lilies is a famous series by which painter?", "Claude Monet", ["Édouard Manet", "Pierre-Auguste Renoir", "Edgar Degas"], 2),
        ("The Thinker is a sculpture by:", "Auguste Rodin", ["Michelangelo", "Alberto Giacometti", "Constantin Brâncuși"], 2),
        ("The Birth of Venus was painted by:", "Sandro Botticelli", ["Titian", "Caravaggio", "Raphael"], 3),
        ("Which artist is famous for Campbell's Soup Cans?", "Andy Warhol", ["Roy Lichtenstein", "Jackson Pollock", "Keith Haring"], 2),
    ]
    for prompt, ans, wrong, diff in art:
        add("knowledge", prompt, ans, wrong, diff)

    music = [
        ("Which composer wrote the Ninth Symphony with the “Ode to Joy”?", "Beethoven", ["Mozart", "Bach", "Brahms"], 2),
        ("Who composed The Four Seasons?", "Vivaldi", ["Bach", "Handel", "Haydn"], 2),
        ("Who composed the opera The Magic Flute?", "Mozart", ["Verdi", "Wagner", "Rossini"], 2),
        ("Which composer became deaf yet kept composing?", "Beethoven", ["Chopin", "Liszt", "Schubert"], 1),
        ("The Nutcracker ballet was composed by:", "Tchaikovsky", ["Stravinsky", "Prokofiev", "Rimsky-Korsakov"], 2),
        ("How many strings does a standard violin have?", "Four", ["Five", "Six", "Seven"], 1),
        ("How many keys does a standard full-size piano have?", "88", ["76", "92", "100"], 2),
        ("Which instrument family does the trombone belong to?", "Brass", ["Woodwind", "Strings", "Percussion"], 1),
        ("Which instrument family does the clarinet belong to?", "Woodwind", ["Brass", "Strings", "Percussion"], 1),
        ("A musical piece for two performers is called a:", "Duet", ["Solo", "Quartet", "Chorus"], 1),
        ("The lowest standard male singing voice is called:", "Bass", ["Tenor", "Baritone", "Alto"], 2),
        ("How many lines are in a standard musical staff?", "Five", ["Four", "Six", "Seven"], 2),
    ]
    for prompt, ans, wrong, diff in music:
        add("knowledge", prompt, ans, wrong, diff)

    sport = [
        ("How many players does a soccer team field at once?", "11", ["9", "10", "12"], 1),
        ("How many players does a basketball team field at once?", "5", ["6", "7", "4"], 1),
        ("How many players does a volleyball team field at once?", "6", ["5", "7", "8"], 2),
        ("How many rings are on the Olympic flag?", "Five", ["Four", "Six", "Seven"], 1),
        ("In chess, which piece can only move diagonally?", "Bishop", ["Rook", "Knight", "Queen"], 1),
        ("In chess, which piece moves in an L-shape?", "Knight", ["Bishop", "Rook", "King"], 1),
        ("A hat-trick in soccer means one player scores how many goals?", "Three", ["Two", "Four", "Five"], 1),
        ("How many points is the bullseye (inner circle) worth in darts?", "50", ["25", "60", "100"], 3),
        ("Wimbledon is a championship in which sport?", "Tennis", ["Golf", "Cricket", "Rowing"], 1),
        ("The Tour de France is a race in which sport?", "Cycling", ["Running", "Sailing", "Motor racing"], 1),
        ("How many holes are played in a standard round of golf?", "18", ["9", "16", "20"], 1),
        ("In which sport would you perform a slam dunk?", "Basketball", ["Volleyball", "Tennis", "Handball"], 1),
        ("How long is a marathon, to the nearest kilometre?", "42 km", ["36 km", "48 km", "50 km"], 2),
        ("How many pins are set up in ten-pin bowling?", "10", ["9", "12", "15"], 1),
        ("In tennis, a score of zero is called:", "Love", ["Nil", "Duck", "Blank"], 1),
        ("The Ashes is a famous rivalry in which sport?", "Cricket", ["Rugby", "Golf", "Rowing"], 2),
        ("Which sport is played at Augusta National?", "Golf", ["Tennis", "Polo", "Baseball"], 2),
        ("How many squares are on a chessboard?", "64", ["49", "81", "100"], 2),
        ("Judo originated in which country?", "Japan", ["China", "Korea", "Thailand"], 1),
        ("In rowing, the person who steers and calls the rhythm is the:", "Coxswain", ["Stroke", "Bowman", "Skipper"], 3),
    ]
    for prompt, ans, wrong, diff in sport:
        add("knowledge", prompt, ans, wrong, diff)

    inventions = [
        ("Who invented the telephone (first patent, 1876)?", "Alexander Graham Bell", ["Thomas Edison", "Guglielmo Marconi", "Nikola Tesla"], 2),
        ("Who invented the printing press with movable type in Europe?", "Johannes Gutenberg", ["Leonardo da Vinci", "William Caxton", "Aldus Manutius"], 2),
        ("The Wright brothers are credited with the first successful:", "Powered airplane flight", ["Hot-air balloon", "Steam engine", "Automobile"], 1),
        ("Who invented the lightning rod and bifocal glasses?", "Benjamin Franklin", ["Isaac Newton", "Michael Faraday", "Alessandro Volta"], 2),
        ("Alfred Nobel, founder of the Nobel Prizes, invented:", "Dynamite", ["The telegraph", "The revolver", "Gunpowder"], 2),
        ("Who is credited with inventing the World Wide Web?", "Tim Berners-Lee", ["Bill Gates", "Steve Jobs", "Alan Turing"], 2),
        ("The first mass-produced automobile, the Model T, was made by:", "Ford", ["General Motors", "Benz", "Chrysler"], 2),
        ("Louis Pasteur is famous for:", "Pasteurization and germ theory", ["The X-ray", "Vaccination against smallpox", "The periodic table"], 2),
        ("Who invented the phonograph and a practical light bulb?", "Thomas Edison", ["Nikola Tesla", "Alexander Graham Bell", "George Westinghouse"], 1),
        ("Guglielmo Marconi is associated with the development of:", "Radio", ["Television", "The telephone", "The computer"], 2),
        ("The moving assembly line for cars was pioneered by:", "Henry Ford", ["Karl Benz", "Rudolf Diesel", "Ransom Olds"], 2),
        ("Braille, the reading system for the blind, was invented in which country?", "France", ["England", "Germany", "USA"], 3),
    ]
    for prompt, ans, wrong, diff in inventions:
        add("knowledge", prompt, ans, wrong, diff)

    mythology = [
        ("In Greek mythology, who is the king of the gods?", "Zeus", ["Poseidon", "Hades", "Apollo"], 1),
        ("The Greek god of the sea is:", "Poseidon", ["Zeus", "Hermes", "Ares"], 1),
        ("The Greek goddess of wisdom is:", "Athena", ["Hera", "Aphrodite", "Artemis"], 1),
        ("The Roman name for the Greek god Zeus is:", "Jupiter", ["Neptune", "Mars", "Saturn"], 2),
        ("The Greek god of war is:", "Ares", ["Apollo", "Hephaestus", "Hermes"], 2),
        ("In Greek myth, who flew too close to the sun on wax wings?", "Icarus", ["Daedalus", "Perseus", "Theseus"], 1),
        ("The Greek hero who completed twelve labours is:", "Heracles", ["Achilles", "Odysseus", "Jason"], 2),
        ("The messenger of the Greek gods, with winged sandals, is:", "Hermes", ["Apollo", "Eros", "Dionysus"], 2),
        ("In Norse mythology, the god of thunder is:", "Thor", ["Odin", "Loki", "Baldur"], 1),
        ("In Norse mythology, the all-father who gave an eye for wisdom is:", "Odin", ["Thor", "Tyr", "Heimdall"], 2),
        ("The half-man, half-bull creature of the Cretan labyrinth is the:", "Minotaur", ["Centaur", "Cyclops", "Satyr"], 1),
        ("Who opened the box (jar) that released the world's evils?", "Pandora", ["Persephone", "Cassandra", "Medea"], 1),
        ("The Egyptian sky god usually shown with a falcon's head is:", "Horus", ["Anubis", "Osiris", "Thoth"], 3),
        ("The Egyptian god of mummification, with a jackal's head, is:", "Anubis", ["Horus", "Set", "Thoth"], 2),
        ("Gazing at Medusa directly would turn a person to:", "Stone", ["Gold", "Ice", "Ash"], 1),
    ]
    for prompt, ans, wrong, diff in mythology:
        add("knowledge", prompt, ans, wrong, diff)

    culture = [
        ("Which language has the most native speakers worldwide?", "Mandarin Chinese", ["English", "Hindi", "Spanish"], 2),
        ("Sushi is a traditional dish of which country?", "Japan", ["China", "Thailand", "Korea"], 1),
        ("Paella is a traditional dish of which country?", "Spain", ["Italy", "Portugal", "Mexico"], 1),
        ("The baguette is a signature bread of which country?", "France", ["Italy", "Spain", "Belgium"], 1),
        ("Which country is famous for the tango?", "Argentina", ["Brazil", "Spain", "Cuba"], 1),
        ("The flamenco dance tradition comes from which country?", "Spain", ["Mexico", "Portugal", "Italy"], 1),
        ("Which country produces the most coffee in the world?", "Brazil", ["Colombia", "Ethiopia", "Vietnam"], 2),
        ("Kimchi is a staple food of which country?", "South Korea", ["Japan", "China", "Vietnam"], 1),
        ("The haiku poetry form comes from which country?", "Japan", ["China", "Korea", "Thailand"], 1),
        ("Which fictional detective lives at 221B Baker Street?", "Sherlock Holmes", ["Hercule Poirot", "Inspector Morse", "Philip Marlowe"], 1),
        ("Which chess term means the king is under attack with no escape?", "Checkmate", ["Stalemate", "Gambit", "Castle"], 1),
        ("How many cards are in a standard deck (without jokers)?", "52", ["48", "54", "60"], 1),
        ("On a standard dice, opposite faces add up to:", "Seven", ["Six", "Eight", "Nine"], 2),
        ("The Michelin star is an award in which field?", "Restaurants and dining", ["Motor racing", "Hotels only", "Architecture"], 2),
        ("A person who makes maps is called a:", "Cartographer", ["Choreographer", "Calligrapher", "Geologist"], 2),
        ("A sommelier is an expert in:", "Wine", ["Cheese", "Coffee", "Perfume"], 2),
        ("The Nobel Peace Prize is awarded in which city?", "Oslo", ["Stockholm", "Geneva", "Copenhagen"], 3),
        ("All the other Nobel Prizes are awarded in which city?", "Stockholm", ["Oslo", "Zurich", "Helsinki"], 3),
        ("How many minutes are in a full day?", "1,440", ["1,240", "1,540", "1,640"], 2),
        ("A score, as in “four score years”, equals how many?", "20", ["10", "12", "25"], 2),
        ("Paper was invented in which country?", "China", ["Egypt", "Greece", "India"], 2),
        ("Origami is the Japanese art of:", "Paper folding", ["Flower arranging", "Calligraphy", "Miniature trees"], 1),
        ("Ikebana is the Japanese art of:", "Flower arranging", ["Paper folding", "Tea brewing", "Sword making"], 3),
        ("A mountain reflected in still water is a classic example of:", "Symmetry", ["Contrast", "Silhouette", "Perspective"], 1),
        ("Esperanto is:", "A constructed international language", ["An Italian dialect", "A programming language", "A dance style"], 2),
        ("The “Big Ben” nickname strictly refers to:", "The great bell", ["The clock tower", "The clock face", "The parliament building"], 3),
        ("Denim jeans were popularized by which company founder?", "Levi Strauss", ["Henry Ford", "Coco Chanel", "Ralph Lauren"], 2),
        ("Which utensil set is standard in Japanese dining?", "Chopsticks", ["Fork and knife", "Spork", "Skewers only"], 1),
        ("A vegetarian diet excludes:", "Meat and fish", ["All animal products", "Only red meat", "Dairy only"], 1),
        ("A vegan diet excludes:", "All animal products", ["Only meat", "Only dairy", "Gluten"], 1),
        ("How many years is a golden wedding anniversary?", "50", ["25", "40", "60"], 2),
        ("How many years is a silver wedding anniversary?", "25", ["10", "30", "50"], 1),
    ]
    for prompt, ans, wrong, diff in culture:
        add("knowledge", prompt, ans, wrong, diff)

    extra = [
        ("Who wrote “The Hobbit”?", "J. R. R. Tolkien", ["C. S. Lewis", "Roald Dahl", "Lewis Carroll"], 1),
        ("Who wrote “Alice's Adventures in Wonderland”?", "Lewis Carroll", ["J. M. Barrie", "Roald Dahl", "Oscar Wilde"], 2),
        ("Who wrote “The Trial” and “The Metamorphosis”?", "Franz Kafka", ["Hermann Hesse", "Thomas Mann", "Albert Camus"], 3),
        ("Who wrote “Faust”?", "Goethe", ["Schiller", "Nietzsche", "Heine"], 3),
        ("Who wrote the play “A Doll's House”?", "Henrik Ibsen", ["Anton Chekhov", "August Strindberg", "George Bernard Shaw"], 3),
        ("Who wrote “The Grapes of Wrath”?", "John Steinbeck", ["Ernest Hemingway", "William Faulkner", "Harper Lee"], 2),
        ("Who wrote “To Kill a Mockingbird”?", "Harper Lee", ["Truman Capote", "John Steinbeck", "Toni Morrison"], 2),
        ("Sherlock Holmes's loyal companion is Doctor:", "Watson", ["Holmes", "Moriarty", "Lestrade"], 1),
        ("“Für Elise” is a famous piano piece by:", "Beethoven", ["Mozart", "Chopin", "Schubert"], 2),
        ("“The Blue Danube” waltz was composed by:", "Johann Strauss II", ["Franz Liszt", "Joseph Haydn", "Franz Schubert"], 3),
        ("The national anthem of France is:", "La Marseillaise", ["La Traviata", "Frère Jacques", "La Vie en Rose"], 2),
        ("The saxophone belongs to which instrument family?", "Woodwind", ["Brass", "Percussion", "Strings"], 3),
        ("Which section of the orchestra is the largest?", "Strings", ["Brass", "Woodwind", "Percussion"], 2),
        ("The Summer Olympic Games are normally held every:", "Four years", ["Two years", "Three years", "Five years"], 1),
        ("The FIFA World Cup is held every:", "Four years", ["Two years", "Three years", "Five years"], 1),
        ("How many players are on a cricket team?", "11", ["9", "10", "12"], 2),
        ("How many players are on a rugby union team?", "15", ["11", "13", "14"], 3),
        ("Polo is played while riding:", "Horses", ["Camels", "Bicycles", "Elephants"], 1),
        ("Sumo wrestling originated in which country?", "Japan", ["China", "Mongolia", "Korea"], 1),
        ("What does “www” stand for?", "World Wide Web", ["World Web Window", "Wide World Web", "Web World Wide"], 1),
        ("Braille is read using which sense?", "Touch", ["Sight", "Hearing", "Smell"], 1),
        ("In Morse code, SOS is:", "Three dots, three dashes, three dots", ["Three dashes, three dots, three dashes", "Six dots", "Six dashes"], 3),
        ("A dozen is 12; a gross is:", "144", ["100", "120", "72"], 3),
        ("Which meal is traditionally eaten in the morning?", "Breakfast", ["Supper", "Dinner", "Tea"], 1),
        ("The word “alphabet” comes from alpha and:", "Beta", ["Omega", "Gamma", "Delta"], 2),
    ]
    for prompt, ans, wrong, diff in extra:
        add("knowledge", prompt, ans, wrong, diff)


# -------------------------------------------------------------- SCIENCE ----
def gen_science():
    symbols = [
        ("gold", "Au", ["Ag", "Gd", "Go"], 2), ("silver", "Ag", ["Si", "Au", "Sr"], 2),
        ("iron", "Fe", ["Ir", "In", "I"], 2), ("lead", "Pb", ["Ld", "Le", "Pd"], 2),
        ("sodium", "Na", ["So", "Sd", "Sn"], 2), ("potassium", "K", ["P", "Po", "Pt"], 2),
        ("tin", "Sn", ["Ti", "Tn", "St"], 3), ("mercury", "Hg", ["Me", "Mc", "My"], 2),
        ("copper", "Cu", ["Co", "Cp", "Cr"], 2), ("tungsten", "W", ["Tu", "Tg", "Ts"], 3),
        ("zinc", "Zn", ["Zi", "Z", "Zc"], 1), ("calcium", "Ca", ["Cl", "C", "Cm"], 1),
        ("helium", "He", ["H", "Hl", "Hm"], 1), ("nitrogen", "N", ["Ni", "Ne", "Na"], 1),
        ("silicon", "Si", ["S", "Sl", "Sc"], 2), ("chlorine", "Cl", ["Ch", "C", "Cr"], 2),
        ("aluminium", "Al", ["Am", "Au", "An"], 1), ("magnesium", "Mg", ["Mn", "Ma", "Ms"], 2),
        ("oxygen", "O", ["Ox", "Og", "Om"], 1), ("carbon", "C", ["Ca", "Cb", "Cn"], 1),
        ("hydrogen", "H", ["Hy", "Hn", "Ho"], 1), ("phosphorus", "P", ["Ph", "Ps", "Po"], 2),
        ("sulfur", "S", ["Su", "Sf", "Sl"], 2), ("nickel", "Ni", ["Nk", "N", "Ne"], 2),
        ("titanium", "Ti", ["Tt", "Tm", "Ta"], 2), ("platinum", "Pt", ["Pl", "Pm", "Pa"], 2),
    ]
    for name, sym, wrong, diff in symbols:
        add("science", f"The chemical symbol for {name} is:", sym, wrong, diff)

    space = [
        ("Which is the largest planet in the Solar System?", "Jupiter", ["Saturn", "Neptune", "Earth"], 1),
        ("Which is the smallest planet in the Solar System?", "Mercury", ["Mars", "Pluto", "Venus"], 2),
        ("Which planet is the hottest in the Solar System?", "Venus", ["Mercury", "Mars", "Jupiter"], 3),
        ("Which planet is known as the Red Planet?", "Mars", ["Jupiter", "Venus", "Mercury"], 1),
        ("Which planet is famous for its prominent rings?", "Saturn", ["Jupiter", "Uranus", "Neptune"], 1),
        ("What is the closest star to Earth?", "The Sun", ["Proxima Centauri", "Sirius", "Polaris"], 2),
        ("The Great Red Spot is a storm on which planet?", "Jupiter", ["Mars", "Saturn", "Neptune"], 2),
        ("Roughly how long does sunlight take to reach Earth?", "8 minutes", ["8 seconds", "8 hours", "1 second"], 2),
        ("What force keeps planets in orbit around the Sun?", "Gravity", ["Magnetism", "Friction", "Inertia"], 1),
        ("What is a light-year a measure of?", "Distance", ["Time", "Brightness", "Speed"], 2),
        ("How many planets are in the Solar System?", "Eight", ["Nine", "Seven", "Ten"], 1),
        ("Which planet is closest to the Sun?", "Mercury", ["Venus", "Mars", "Earth"], 1),
        ("Which planet is third from the Sun?", "Earth", ["Venus", "Mars", "Mercury"], 1),
        ("The Moon shines because it:", "Reflects sunlight", ["Burns gas", "Generates its own light", "Glows from inner heat"], 1),
        ("What galaxy is Earth part of?", "The Milky Way", ["Andromeda", "The Sombrero galaxy", "Triangulum"], 1),
        ("A solar eclipse happens when what passes between the Sun and Earth?", "The Moon", ["Venus", "Earth's shadow", "A comet"], 1),
        ("Which planet spins on its side compared with the others?", "Uranus", ["Neptune", "Saturn", "Mercury"], 3),
        ("The asteroid belt lies mainly between Mars and which planet?", "Jupiter", ["Earth", "Saturn", "Venus"], 2),
        ("What are Saturn's rings mostly made of?", "Ice and rock", ["Gas", "Dust only", "Liquid metal"], 2),
        ("The first human to walk on the Moon was:", "Neil Armstrong", ["Buzz Aldrin", "Yuri Gagarin", "John Glenn"], 1),
        ("The first human in space was:", "Yuri Gagarin", ["Neil Armstrong", "Alan Shepard", "Valentina Tereshkova"], 2),
    ]
    for prompt, ans, wrong, diff in space:
        add("science", prompt, ans, wrong, diff)

    units = [
        ("force", "Newton", ["Watt", "Joule", "Pascal"], 2),
        ("power", "Watt", ["Newton", "Volt", "Ampere"], 2),
        ("electrical resistance", "Ohm", ["Volt", "Ampere", "Farad"], 2),
        ("frequency", "Hertz", ["Decibel", "Watt", "Kelvin"], 2),
        ("energy", "Joule", ["Newton", "Pascal", "Tesla"], 2),
        ("electric current", "Ampere", ["Volt", "Ohm", "Coulomb"], 2),
        ("pressure", "Pascal", ["Newton", "Barometer", "Joule"], 2),
        ("temperature", "Kelvin", ["Celsius", "Joule", "Fahrenheit"], 2),
        ("electric charge", "Coulomb", ["Ampere", "Volt", "Watt"], 3),
        ("electric potential (voltage)", "Volt", ["Ampere", "Ohm", "Watt"], 2),
        ("luminous intensity", "Candela", ["Lumen hour", "Watt", "Lux second"], 3),
        ("amount of substance", "Mole", ["Gram", "Litre", "Dalton"], 3),
    ]
    for qty, ans, wrong, diff in units:
        add("science", f"What is the SI unit of {qty}?", ans, wrong, diff)

    biology = [
        ("Which gas do plants primarily absorb for photosynthesis?", "Carbon dioxide", ["Oxygen", "Nitrogen", "Hydrogen"], 1),
        ("Which organelle produces most of a cell's energy?", "Mitochondrion", ["Nucleus", "Ribosome", "Golgi body"], 1),
        ("Which blood type is the universal donor?", "O negative", ["AB positive", "A positive", "B negative"], 2),
        ("In which part of the cell is DNA primarily stored?", "Nucleus", ["Cytoplasm", "Cell wall", "Membrane"], 1),
        ("What is the largest organ of the human body?", "Skin", ["Liver", "Brain", "Lungs"], 2),
        ("Red blood cells carry which gas around the body?", "Oxygen", ["Carbon dioxide only", "Nitrogen", "Helium"], 1),
        ("Insulin is produced by which organ?", "Pancreas", ["Liver", "Kidney", "Spleen"], 2),
        ("What is the longest bone in the human body?", "Femur", ["Tibia", "Humerus", "Spine"], 2),
        ("Which pigment makes plants green?", "Chlorophyll", ["Carotene", "Melanin", "Keratin"], 1),
        ("How many chromosomes does a typical human cell have?", "46", ["23", "44", "48"], 2),
        ("How many chambers does the human heart have?", "Four", ["Two", "Three", "Six"], 1),
        ("Which vitamin does human skin produce in sunlight?", "Vitamin D", ["Vitamin C", "Vitamin A", "Vitamin B12"], 2),
        ("The process by which plants lose water through leaves is:", "Transpiration", ["Condensation", "Respiration", "Fermentation"], 3),
        ("Which organ filters waste from the blood into urine?", "Kidney", ["Liver", "Bladder", "Stomach"], 1),
        ("Which organ pumps blood around the body?", "Heart", ["Lungs", "Brain", "Liver"], 1),
        ("The smallest unit of life is the:", "Cell", ["Atom", "Molecule", "Organ"], 1),
        ("Which part of the body controls balance?", "Inner ear", ["Nose", "Spine", "Knees"], 2),
        ("Frogs are classified as:", "Amphibians", ["Reptiles", "Fish", "Mammals"], 1),
        ("Which animal group has feathers?", "Birds", ["Mammals", "Reptiles", "Amphibians"], 1),
        ("Whales are classified as:", "Mammals", ["Fish", "Amphibians", "Reptiles"], 1),
        ("A creature that eats only plants is called a:", "Herbivore", ["Carnivore", "Omnivore", "Insectivore"], 1),
        ("Photosynthesis releases which gas into the air?", "Oxygen", ["Carbon dioxide", "Nitrogen", "Methane"], 1),
        ("The largest animal ever known to have lived is the:", "Blue whale", ["African elephant", "Woolly mammoth", "Giant squid"], 2),
        ("Which land animal is the fastest sprinter?", "Cheetah", ["Lion", "Gazelle", "Horse"], 1),
        ("Spiders have how many legs?", "Eight", ["Six", "Ten", "Twelve"], 1),
        ("Insects have how many legs?", "Six", ["Eight", "Four", "Ten"], 1),
        ("The body's smallest bones are found in the:", "Ear", ["Fingers", "Toes", "Nose"], 2),
        ("Which nutrient is the body's main quick-energy source?", "Carbohydrates", ["Proteins", "Vitamins", "Minerals"], 2),
        ("Antibiotics are effective against:", "Bacteria", ["Viruses", "All infections", "Allergies"], 2),
        ("The natural home of an organism is called its:", "Habitat", ["Territory zone", "Biome cell", "Colony"], 1),
    ]
    for prompt, ans, wrong, diff in biology:
        add("science", prompt, ans, wrong, diff)

    physics_chem = [
        ("At high altitude, water boils at:", "A lower temperature", ["A higher temperature", "Exactly 100°C", "It cannot boil"], 3),
        ("The speed of light in a vacuum is approximately:", "300,000 km/s", ["300 km/s", "3,000 km/s", "30,000 km/s"], 2),
        ("Why can't sound travel through space?", "There is no medium to carry it", ["It moves too slowly", "It is absorbed by light", "Space is too cold"], 2),
        ("What is the chemical formula of water?", "H₂O", ["HO₂", "H₂O₂", "OH"], 1),
        ("Table salt is chemically known as:", "Sodium chloride", ["Potassium chloride", "Sodium carbonate", "Calcium chloride"], 2),
        ("A pH of 7 indicates a solution is:", "Neutral", ["Acidic", "Alkaline", "Saturated"], 2),
        ("You see lightning before hearing thunder because:", "Light travels faster than sound", ["Thunder happens later", "Sound is blocked by clouds", "Eyes react faster than ears"], 2),
        ("The speed of sound in air is roughly:", "343 m/s", ["34 m/s", "3,430 m/s", "1,000 m/s"], 3),
        ("Ice floats on water because ice is:", "Less dense than water", ["Colder than water", "Heavier than water", "Purer than water"], 2),
        ("What type of energy is stored in a stretched spring?", "Elastic potential energy", ["Kinetic energy", "Thermal energy", "Chemical energy"], 2),
        ("Which state of matter has a fixed volume but no fixed shape?", "Liquid", ["Solid", "Gas", "Plasma"], 1),
        ("Evaporation happens faster when the temperature is:", "Higher", ["Lower", "Constant", "Below freezing"], 1),
        ("At sea level, pure water freezes at:", "0°C", ["-10°C", "4°C", "32°C"], 1),
        ("At sea level, pure water boils at:", "100°C", ["90°C", "110°C", "212°C"], 1),
        ("Which gas makes up most of Earth's atmosphere?", "Nitrogen", ["Oxygen", "Carbon dioxide", "Argon"], 2),
        ("The three states of matter commonly taught are solid, liquid and:", "Gas", ["Plasma", "Vapor crystal", "Foam"], 1),
        ("Which metal is liquid at room temperature?", "Mercury", ["Lead", "Aluminium", "Sodium"], 2),
        ("A magnet's force is strongest at its:", "Poles", ["Centre", "Edges evenly", "Surface everywhere"], 1),
        ("Which color of visible light has the longest wavelength?", "Red", ["Blue", "Violet", "Green"], 2),
        ("Sound travels fastest through:", "Solids", ["Liquids", "Gases", "A vacuum"], 2),
        ("An object floats in water when its density is:", "Less than water's", ["Greater than water's", "Equal to steel's", "Zero"], 2),
        ("What kind of lens is used to correct short-sightedness?", "Concave (diverging)", ["Convex (converging)", "Cylindrical only", "Flat"], 3),
        ("Rusting of iron requires water and:", "Oxygen", ["Nitrogen", "Carbon dioxide", "Salt"], 2),
        ("Which simple machine is a ramp an example of?", "Inclined plane", ["Lever", "Pulley", "Wheel and axle"], 2),
        ("Electric current is the flow of:", "Electric charge", ["Air molecules", "Magnetic fields", "Photons only"], 2),
        ("The centre of an atom is called the:", "Nucleus", ["Electron shell", "Proton belt", "Core ring"], 1),
        ("Which particle carries a negative charge?", "Electron", ["Proton", "Neutron", "Photon"], 1),
        ("Which particle in the nucleus carries no charge?", "Neutron", ["Proton", "Electron", "Ion"], 1),
        ("Diamond and graphite are both forms of which element?", "Carbon", ["Silicon", "Boron", "Quartz"], 2),
        ("The greenhouse effect is mainly driven by gases trapping:", "Heat", ["Light", "Sound", "Wind"], 1),
        ("What does a seismograph measure?", "Earthquakes", ["Rainfall", "Wind speed", "Air pressure"], 1),
        ("What does a barometer measure?", "Air pressure", ["Humidity", "Temperature", "Altitude only"], 2),
        ("The Richter-style magnitude scales measure an earthquake's:", "Energy released", ["Duration", "Depth", "Damage cost"], 2),
        ("Fossils are most commonly found in which rock type?", "Sedimentary", ["Igneous", "Metamorphic", "Volcanic glass"], 2),
        ("Earth's innermost layer is the:", "Inner core", ["Mantle", "Crust", "Outer shell"], 1),
        ("Most of Earth's fresh water is stored in:", "Ice caps and glaciers", ["Rivers", "Lakes", "Clouds"], 2),
        ("The water cycle step where vapor becomes liquid droplets is:", "Condensation", ["Evaporation", "Precipitation", "Collection"], 1),
        ("A material that does not conduct electricity well is called:", "An insulator", ["A conductor", "A resistor coil", "A capacitor"], 1),
    ]
    for prompt, ans, wrong, diff in physics_chem:
        add("science", prompt, ans, wrong, diff)

    more = [
        ("Which organ is primarily responsible for detoxifying blood?", "Liver", ["Kidney", "Spleen", "Pancreas"], 2),
        ("The windpipe is also called the:", "Trachea", ["Esophagus", "Larynx", "Bronchus"], 2),
        ("Which part of the eye controls how much light enters?", "Iris", ["Retina", "Cornea", "Lens"], 2),
        ("The retina's job in the eye is to:", "Detect light", ["Focus light", "Produce tears", "Filter dust"], 2),
        ("Which system of the body fights infection?", "Immune system", ["Digestive system", "Endocrine system", "Skeletal system"], 1),
        ("Which gas do humans exhale more of than they inhale?", "Carbon dioxide", ["Oxygen", "Nitrogen", "Argon"], 1),
        ("Adult humans typically have how many teeth (with wisdom teeth)?", "32", ["28", "30", "36"], 2),
        ("How many bones does an adult human skeleton typically have?", "206", ["186", "226", "256"], 3),
        ("Bats navigate in the dark mainly using:", "Echolocation", ["Night vision", "Smell", "Magnetic fields"], 1),
        ("Which animal can regrow a lost tail?", "Lizard", ["Rabbit", "Pigeon", "Goat"], 1),
        ("An octopus has how many arms?", "Eight", ["Six", "Ten", "Twelve"], 1),
        ("Camels store what in their humps?", "Fat", ["Water", "Muscle", "Blood"], 2),
        ("Which bird is famous for mimicking human speech?", "Parrot", ["Owl", "Swan", "Falcon"], 1),
        ("Emperor penguins breed on which continent?", "Antarctica", ["The Arctic", "South America", "Australia"], 1),
        ("The chemical process plants use to make food from sunlight is:", "Photosynthesis", ["Respiration", "Fermentation", "Digestion"], 1),
        ("What is the boiling point of water in Fahrenheit at sea level?", "212°F", ["100°F", "180°F", "232°F"], 3),
        ("Which instrument measures temperature?", "Thermometer", ["Barometer", "Hygrometer", "Anemometer"], 1),
        ("Which instrument measures wind speed?", "Anemometer", ["Barometer", "Altimeter", "Hygrometer"], 3),
        ("Which vitamin is abundant in citrus fruits?", "Vitamin C", ["Vitamin D", "Vitamin B12", "Vitamin K"], 1),
        ("A lunar eclipse happens when what falls on the Moon?", "Earth's shadow", ["The Sun's shadow", "Mars's shadow", "A dust cloud"], 2),
        ("Sound is a type of:", "Wave", ["Particle", "Field", "Ray"], 1),
        ("Which force slows a ball rolling on grass?", "Friction", ["Gravity only", "Magnetism", "Tension"], 1),
        ("Mixing red and green light gives which color?", "Yellow", ["Purple", "Brown", "White"], 3),
        ("What natural fiber do silkworms produce?", "Silk", ["Cotton", "Wool", "Linen"], 1),
        ("The hardest natural material is:", "Diamond", ["Steel", "Quartz", "Titanium"], 1),
        ("Which planet has the most moons discovered so far, Jupiter or Mars?", "Jupiter", ["Mars", "They are equal", "Neither has moons"], 2),
        ("DNA stands for:", "Deoxyribonucleic acid", ["Dinucleic acid", "Deoxyribose nitrate", "Dual nucleic assembly"], 2),
        ("Which blood cells help clot wounds?", "Platelets", ["Red blood cells", "White blood cells", "Plasma cells"], 2),
    ]
    for prompt, ans, wrong, diff in more:
        add("science", prompt, ans, wrong, diff)

    extra = [
        ("The gas that makes fizzy drinks fizzy is:", "Carbon dioxide", ["Oxygen", "Nitrogen", "Helium"], 1),
        ("Which common metal is strongly attracted to magnets?", "Iron", ["Copper", "Aluminium", "Gold"], 1),
        ("The scientific study of weather is called:", "Meteorology", ["Astrology", "Geology", "Ecology"], 2),
        ("The scientific study of living things is called:", "Biology", ["Botany only", "Chemistry", "Physiology only"], 1),
        ("The scientific study of earthquakes is called:", "Seismology", ["Volcanology", "Meteorology", "Topology"], 3),
        ("Plants absorb most of their water through their:", "Roots", ["Leaves", "Flowers", "Bark"], 1),
        ("The femur is a bone found in the:", "Thigh", ["Forearm", "Chest", "Foot"], 2),
        ("Bile, which helps digest fats, is produced by the:", "Liver", ["Stomach", "Pancreas", "Kidney"], 2),
        ("Normal human body temperature is close to:", "37°C", ["35°C", "39°C", "40°C"], 1),
        ("Which planet has the shortest year?", "Mercury", ["Venus", "Mars", "Jupiter"], 2),
        ("The Sun is composed mostly of:", "Hydrogen", ["Oxygen", "Carbon", "Iron"], 2),
        ("A comet's tail always points:", "Away from the Sun", ["Toward the Sun", "Along its orbit", "Toward Earth"], 3),
        ("Water is unusual because it expands when it:", "Freezes", ["Boils", "Evaporates", "Condenses"], 2),
        ("One hertz equals one cycle per:", "Second", ["Minute", "Hour", "Metre"], 2),
        ("Which can travel through the vacuum of space?", "Light", ["Sound", "Both equally", "Neither"], 2),
        ("Earth's only natural satellite is:", "The Moon", ["Phobos", "Titan", "Europa"], 1),
        ("An animal that is active mainly at night is called:", "Nocturnal", ["Diurnal", "Dormant", "Migratory"], 1),
        ("On the Kelvin scale, water boils at about:", "373 K", ["100 K", "273 K", "473 K"], 3),
    ]
    for prompt, ans, wrong, diff in extra:
        add("science", prompt, ans, wrong, diff)


# -------------------------------------------------------------- HISTORY ----
# Settled, date-stable facts only — nothing that drifts with current events.
def gen_history():
    ancient = [
        ("The Great Pyramid of Giza was built as a tomb for a:", "Pharaoh", ["General", "High priest", "Merchant king"], 1),
        ("Which ancient civilization built the Parthenon?", "The Greeks", ["The Romans", "The Egyptians", "The Persians"], 1),
        ("Rome was, according to legend, founded by:", "Romulus", ["Remus", "Julius Caesar", "Aeneas"], 2),
        ("Julius Caesar was assassinated on the:", "Ides of March", ["Kalends of May", "Nones of April", "Ides of June"], 2),
        ("The first Roman emperor was:", "Augustus", ["Julius Caesar", "Nero", "Constantine"], 2),
        ("Which empire built an extensive road network across Europe around two thousand years ago?", "The Roman Empire", ["The Ottoman Empire", "The Persian Empire", "The Mongol Empire"], 1),
        ("Cleopatra was the ruler of which ancient kingdom?", "Egypt", ["Persia", "Babylon", "Nubia"], 1),
        ("Alexander the Great was king of:", "Macedonia", ["Athens", "Sparta", "Persia"], 2),
        ("The Trojan War, in Greek accounts, ended thanks to:", "A wooden horse", ["A naval blockade", "A plague", "A royal marriage"], 1),
        ("Which civilization developed cuneiform, one of the earliest writing systems?", "The Sumerians", ["The Egyptians", "The Minoans", "The Phoenicians"], 3),
        ("The Hanging Gardens, one of the ancient wonders, are associated with:", "Babylon", ["Athens", "Alexandria", "Persepolis"], 2),
        ("Which ancient people are famous for their alphabet spread by sea trade?", "The Phoenicians", ["The Hittites", "The Assyrians", "The Etruscans"], 3),
        ("The Colosseum in Rome was mainly used for:", "Gladiatorial games", ["Chariot races", "Senate meetings", "Religious festivals only"], 1),
        ("Sparta and Athens fought each other in the:", "Peloponnesian War", ["Punic Wars", "Trojan War", "Persian Wars"], 3),
        ("Rome fought Carthage in the:", "Punic Wars", ["Gallic Wars", "Peloponnesian War", "Macedonian Wars"], 3),
        ("Hieroglyphics were the writing system of ancient:", "Egypt", ["Greece", "Rome", "China"], 1),
        ("The Rosetta Stone was the key to deciphering:", "Egyptian hieroglyphs", ["Cuneiform", "Linear B", "Mayan glyphs"], 2),
        ("Democracy as a political system was pioneered in ancient:", "Athens", ["Rome", "Sparta", "Thebes"], 1),
        ("The Silk Road primarily connected China with:", "Europe and the Middle East", ["Australia", "The Americas", "Sub-Saharan Africa only"], 2),
        ("The Terracotta Army guards the tomb of an emperor in which country?", "China", ["Japan", "Korea", "Mongolia"], 1),
    ]
    for prompt, ans, wrong, diff in ancient:
        add("history", prompt, ans, wrong, diff)

    medieval = [
        ("The Magna Carta was sealed in England in which century?", "13th century", ["11th century", "15th century", "17th century"], 3),
        ("The Magna Carta limited the power of the:", "King", ["Church", "Merchants", "Army"], 2),
        ("The Black Death swept Europe in which century?", "14th century", ["12th century", "16th century", "10th century"], 2),
        ("The Battle of Hastings, 1066, led to the conquest of England by the:", "Normans", ["Vikings", "Saxons", "Romans"], 2),
        ("William the Conqueror came to England from which region?", "Normandy", ["Brittany", "Flanders", "Denmark"], 2),
        ("The Crusades were expeditions aimed chiefly at controlling:", "The Holy Land", ["The Silk Road", "North Africa", "Constantinople only"], 2),
        ("Genghis Khan founded which empire?", "The Mongol Empire", ["The Ottoman Empire", "The Persian Empire", "The Mughal Empire"], 1),
        ("The samurai were the warrior class of:", "Japan", ["China", "Korea", "Mongolia"], 1),
        ("Constantinople fell to the Ottomans in:", "1453", ["1353", "1553", "1253"], 3),
        ("The Vikings originally came from:", "Scandinavia", ["Germany", "Scotland", "Russia"], 1),
        ("Machu Picchu was built by which civilization?", "The Inca", ["The Maya", "The Aztec", "The Olmec"], 2),
        ("Tenochtitlán, on the site of modern Mexico City, was the capital of the:", "Aztec Empire", ["Inca Empire", "Maya city-states", "Toltec Empire"], 2),
        ("The Hundred Years' War was fought mainly between England and:", "France", ["Spain", "Scotland", "The Netherlands"], 2),
        ("Joan of Arc rallied the armies of which country?", "France", ["England", "Italy", "Spain"], 1),
        ("Marco Polo's famous travels took him to the court of:", "Kublai Khan", ["Genghis Khan", "The Shogun", "The Ottoman Sultan"], 2),
    ]
    for prompt, ans, wrong, diff in medieval:
        add("history", prompt, ans, wrong, diff)

    exploration = [
        ("Christopher Columbus first crossed the Atlantic in:", "1492", ["1482", "1502", "1512"], 1),
        ("The first expedition to circumnavigate the globe was led initially by:", "Ferdinand Magellan", ["Christopher Columbus", "Vasco da Gama", "James Cook"], 2),
        ("Vasco da Gama pioneered the sea route from Europe to:", "India", ["China", "Brazil", "Australia"], 2),
        ("Which country's explorers first rounded the Cape of Good Hope?", "Portugal", ["Spain", "England", "The Netherlands"], 3),
        ("Captain James Cook charted much of which region?", "The Pacific", ["The Arctic", "The Caribbean", "West Africa"], 2),
        ("The Mayflower carried settlers to which continent in 1620?", "North America", ["Australia", "Africa", "South America"], 1),
        ("Roald Amundsen was the first person to reach the:", "South Pole", ["North Pole first ever", "Summit of Everest", "Mariana Trench"], 2),
        ("Who was the first to summit Mount Everest, with Tenzing Norgay, in 1953?", "Edmund Hillary", ["George Mallory", "Reinhold Messner", "Robert Scott"], 2),
        ("The Lewis and Clark expedition explored which country's west?", "The United States", ["Canada", "Mexico", "Australia"], 2),
        ("Hernán Cortés led the Spanish conquest of which empire?", "The Aztec Empire", ["The Inca Empire", "The Maya", "The Pueblo"], 2),
        ("Francisco Pizarro led the Spanish conquest of which empire?", "The Inca Empire", ["The Aztec Empire", "The Olmec", "The Iroquois"], 3),
        ("The Dutch East India Company traded chiefly in:", "Spices", ["Gold only", "Furs", "Silk only"], 3),
    ]
    for prompt, ans, wrong, diff in exploration:
        add("history", prompt, ans, wrong, diff)

    modern = [
        ("The French Revolution began in:", "1789", ["1769", "1799", "1809"], 2),
        ("The storming of which prison marks the start of the French Revolution?", "The Bastille", ["The Tower of London", "The Conciergerie", "Versailles"], 2),
        ("Napoleon was finally defeated in 1815 at the Battle of:", "Waterloo", ["Trafalgar", "Austerlitz", "Leipzig"], 2),
        ("Napoleon was exiled after Waterloo to which island?", "Saint Helena", ["Elba", "Corsica", "Sicily"], 3),
        ("The American Declaration of Independence was signed in:", "1776", ["1766", "1786", "1796"], 1),
        ("The first President of the United States was:", "George Washington", ["Thomas Jefferson", "John Adams", "Benjamin Franklin"], 1),
        ("The American Civil War ended in:", "1865", ["1855", "1875", "1845"], 2),
        ("Abraham Lincoln is best remembered for:", "Abolishing slavery in the US", ["Purchasing Alaska", "Founding the US Navy", "Writing the Constitution"], 1),
        ("The Industrial Revolution began in which country?", "Britain", ["France", "Germany", "The United States"], 2),
        ("The steam engine was greatly improved in the 18th century by:", "James Watt", ["George Stephenson", "Isambard Brunel", "Richard Arkwright"], 2),
        ("World War I began in which year?", "1914", ["1912", "1916", "1918"], 1),
        ("World War I was triggered by an assassination in:", "Sarajevo", ["Vienna", "Belgrade", "Berlin"], 2),
        ("World War II began in Europe with the invasion of:", "Poland", ["France", "Belgium", "Czechoslovakia"], 1),
        ("World War II ended in which year?", "1945", ["1943", "1944", "1946"], 1),
        ("The D-Day landings of 1944 took place on the beaches of:", "Normandy", ["Brittany", "Dunkirk", "Calais"], 1),
        ("The Berlin Wall fell in:", "1989", ["1979", "1991", "1985"], 1),
        ("The Cold War was a standoff between the USA and:", "The Soviet Union", ["China", "Germany", "Japan"], 1),
        ("The Cuban Missile Crisis happened in:", "1962", ["1952", "1972", "1958"], 3),
        ("Mahatma Gandhi led an independence movement in:", "India", ["Egypt", "South Africa", "Burma"], 1),
        ("India gained independence from Britain in:", "1947", ["1937", "1957", "1950"], 2),
        ("Nelson Mandela became president of which country in 1994?", "South Africa", ["Zimbabwe", "Kenya", "Ghana"], 1),
        ("Apartheid was a system of segregation in:", "South Africa", ["Rhodesia only", "Namibia only", "Angola"], 1),
        ("The Russian Revolution that brought the Bolsheviks to power was in:", "1917", ["1905", "1927", "1937"], 2),
        ("Lenin led which political movement to power in Russia?", "The Bolsheviks", ["The Mensheviks", "The Tsarists", "The Decembrists"], 2),
        ("The Titanic sank in which year?", "1912", ["1902", "1922", "1915"], 1),
        ("The first controlled powered airplane flight was in:", "1903", ["1893", "1913", "1923"], 2),
        ("Which empire was ruled from Constantinople until 1922?", "The Ottoman Empire", ["The Byzantine Empire", "The Persian Empire", "The Austro-Hungarian Empire"], 3),
        ("The United Nations was founded in:", "1945", ["1939", "1950", "1955"], 2),
        ("The League of Nations was created after which war?", "World War I", ["World War II", "The Crimean War", "The Franco-Prussian War"], 2),
        ("Apollo 11 landed the first humans on the Moon in:", "1969", ["1959", "1971", "1965"], 1),
        ("The Suez Canal opened in which century?", "19th century", ["17th century", "18th century", "20th century"], 3),
        ("The Wall Street Crash that started the Great Depression was in:", "1929", ["1919", "1939", "1935"], 2),
        ("Queen Victoria reigned during which era of British history?", "The Victorian era", ["The Georgian era", "The Tudor era", "The Regency only"], 1),
        ("Which two cities were hit by atomic bombs in 1945?", "Hiroshima and Nagasaki", ["Tokyo and Osaka", "Kyoto and Kobe", "Yokohama and Sapporo"], 1),
        ("The Treaty of Versailles formally ended:", "World War I", ["World War II", "The Napoleonic Wars", "The Crimean War"], 2),
        ("The Renaissance began in which country?", "Italy", ["France", "England", "Greece"], 1),
        ("Leonardo da Vinci and Michelangelo were artists of the:", "Renaissance", ["Baroque era", "Enlightenment", "Romantic era"], 1),
        ("The printing press transformed Europe starting in which century?", "15th century", ["13th century", "17th century", "12th century"], 3),
        ("Martin Luther's Ninety-five Theses launched the:", "Reformation", ["Renaissance", "Enlightenment", "Counter-Revolution"], 2),
        ("Which country was ruled by Tsars until 1917?", "Russia", ["Poland", "Austria", "Bulgaria"], 1),
        ("The Statue of Liberty was inaugurated in which decade?", "1880s", ["1860s", "1900s", "1920s"], 3),
        ("The Eiffel Tower was completed in which year?", "1889", ["1869", "1899", "1909"], 3),
        ("Slavery was abolished in the British Empire in which century?", "19th century", ["17th century", "18th century", "20th century"], 2),
        ("The first modern Olympic Games were held in 1896 in:", "Athens", ["Paris", "London", "Rome"], 2),
        ("Women first gained the national vote in which country (1893)?", "New Zealand", ["The United States", "Britain", "France"], 3),
        ("The Great Fire of London happened in:", "1666", ["1566", "1766", "1616"], 2),
        ("The Spanish Armada was defeated by England in:", "1588", ["1488", "1688", "1538"], 3),
        ("Which queen ruled England when the Spanish Armada was defeated?", "Elizabeth I", ["Victoria", "Mary I", "Anne"], 2),
        ("The Boston Tea Party was a protest against:", "British taxation", ["Slavery", "Conscription", "Land seizures"], 1),
        ("The Louisiana Purchase of 1803 was bought from:", "France", ["Spain", "Britain", "Mexico"], 3),
        ("The Trans-Siberian Railway crosses which country?", "Russia", ["China", "Kazakhstan", "Mongolia"], 1),
        ("The Berlin Airlift supplied which blockaded city?", "West Berlin", ["Vienna", "Hamburg", "Munich"], 3),
        ("The Marshall Plan was designed to rebuild:", "Post-war Europe", ["Post-war Japan", "The Soviet Union", "Latin America"], 3),
        ("Winston Churchill led which country during World War II?", "Britain", ["Canada", "Australia", "The United States"], 1),
        ("Franklin D. Roosevelt led which country during most of World War II?", "The United States", ["Britain", "Canada", "France"], 1),
        ("The ancient library said to be the greatest of its age stood at:", "Alexandria", ["Athens", "Rome", "Carthage"], 2),
        ("Pompeii was buried by the eruption of:", "Mount Vesuvius", ["Mount Etna", "Mount Olympus", "Stromboli"], 1),
        ("Hadrian's Wall was built across which land?", "Northern England", ["Southern France", "The Rhineland", "Wales"], 2),
        ("The Ming dynasty ruled which country?", "China", ["Japan", "Vietnam", "Korea"], 1),
        ("The Mughal Empire ruled much of which region?", "The Indian subcontinent", ["Persia", "Arabia", "Southeast Asia"], 2),
        ("The Taj Mahal was built by emperor Shah Jahan in memory of his:", "Wife", ["Mother", "Daughter", "Sister"], 2),
        ("The shogun was a military ruler in the history of:", "Japan", ["China", "Korea", "Thailand"], 1),
        ("The Meiji Restoration modernized which country?", "Japan", ["China", "Korea", "Siam"], 3),
        ("The Opium Wars were fought between China and:", "Britain", ["Japan", "Russia", "France alone"], 3),
        ("The Panama Canal opened in which decade?", "1910s", ["1890s", "1930s", "1950s"], 3),
        ("Ellis Island in New York processed millions of:", "Immigrants", ["Soldiers", "Gold miners", "Prisoners"], 1),
        ("The Great Depression of the 1930s began with a crash in:", "The stock market", ["The housing market", "Farm prices only", "The gold supply"], 1),
        ("The pyramids at Giza stand on which river's ancient floodplain?", "The Nile", ["The Tigris", "The Euphrates", "The Jordan"], 1),
        ("The Code of Hammurabi is an early set of:", "Laws", ["Poems", "Maps", "Prayers"], 2),
        ("The Byzantine Empire's capital was:", "Constantinople", ["Rome", "Athens", "Antioch"], 2),
        ("The Aztec and Inca empires fell to conquerors from:", "Spain", ["Portugal", "England", "France"], 1),
        ("The guillotine is most associated with which revolution?", "The French Revolution", ["The American Revolution", "The Russian Revolution", "The Glorious Revolution"], 1),
        ("The Emancipation Proclamation was issued by:", "Abraham Lincoln", ["George Washington", "Ulysses Grant", "Andrew Jackson"], 2),
        ("Cleopatra allied with which Roman leaders?", "Julius Caesar and Mark Antony", ["Augustus and Nero", "Pompey and Crassus", "Hadrian and Trajan"], 3),
        ("Which wall divided a European capital from 1961 to 1989?", "The Berlin Wall", ["The Warsaw Wall", "The Prague Wall", "The Vienna Wall"], 1),
        ("The 1918 influenza pandemic came at the end of:", "World War I", ["World War II", "The Boer War", "The Crimean War"], 2),
        ("The Wright brothers made their first flight at:", "Kitty Hawk", ["Cape Canaveral", "Dayton field", "Long Island"], 3),
        ("The first successful vaccine, developed by Edward Jenner, targeted:", "Smallpox", ["Polio", "Rabies", "Measles"], 2),
        ("Penicillin was discovered in 1928 by:", "Alexander Fleming", ["Louis Pasteur", "Joseph Lister", "Robert Koch"], 2),
        ("The Hubble Space Telescope launched in which decade?", "1990s", ["1970s", "1980s", "2000s"], 3),
        ("Sputnik, the first artificial satellite, was launched by:", "The Soviet Union", ["The United States", "Britain", "China"], 2),
        ("The first woman in space was:", "Valentina Tereshkova", ["Sally Ride", "Mae Jemison", "Yuri Gagarina"], 3),
    ]
    for prompt, ans, wrong, diff in modern:
        add("history", prompt, ans, wrong, diff)

    extra = [
        ("The Concorde was a famous:", "Supersonic passenger jet", ["Ocean liner", "Space station", "High-speed train"], 2),
        ("The first transatlantic solo flight was made in 1927 by:", "Charles Lindbergh", ["Amelia Earhart", "The Wright brothers", "Howard Hughes"], 2),
        ("Amelia Earhart was the first woman to fly solo across the:", "Atlantic", ["Pacific", "Equator", "Arctic"], 2),
        ("Tutankhamun's tomb was discovered in 1922 by:", "Howard Carter", ["Heinrich Schliemann", "Flinders Petrie", "Arthur Evans"], 3),
        ("The Vikings reached North America around the year:", "1000", ["800", "1200", "1400"], 3),
        ("The Ottoman Empire's capital, now Istanbul, was once called:", "Constantinople", ["Ankara", "Antioch", "Alexandria"], 1),
        ("Which document begins “We the People”?", "The US Constitution", ["The Declaration of Independence", "The Magna Carta", "The Federalist Papers"], 2),
        ("The Gettysburg Address was delivered by:", "Abraham Lincoln", ["George Washington", "Ulysses Grant", "Theodore Roosevelt"], 2),
        ("The Crimean War nurse called “the Lady with the Lamp” was:", "Florence Nightingale", ["Clara Barton", "Mary Seacole", "Edith Cavell"], 2),
        ("The transcontinental railroad across the USA was completed in which century?", "19th century", ["18th century", "20th century", "17th century"], 2),
        ("Which revolution introduced the metric system?", "The French Revolution", ["The American Revolution", "The Industrial Revolution", "The Russian Revolution"], 3),
        ("Simón Bolívar led independence movements in:", "South America", ["Mexico", "The Caribbean only", "Central Africa"], 2),
        ("The Zulu kingdom rose in which region?", "Southern Africa", ["West Africa", "East Africa", "North Africa"], 2),
        ("Timbuktu was a famous centre of learning in which region?", "West Africa", ["East Africa", "Arabia", "Persia"], 3),
        ("The Great Wall of China was built mainly to defend against:", "Northern nomadic invaders", ["Sea pirates", "Japanese armies", "Roman legions"], 2),
        ("Which dynasty built most of the Great Wall visible today?", "The Ming", ["The Han", "The Tang", "The Qin only"], 3),
        ("The Edo period was an era of which country's history?", "Japan", ["China", "Korea", "Vietnam"], 3),
        ("The Bastille Day national holiday is celebrated in:", "France", ["Italy", "Belgium", "Spain"], 1),
        ("The Berlin Conference of 1884–85 divided which continent among colonial powers?", "Africa", ["Asia", "South America", "Oceania"], 3),
        ("Which war was fought between the North and South of the USA?", "The Civil War", ["The Revolutionary War", "The War of 1812", "The Mexican-American War"], 1),
        ("The Roman numerals MCMXCIX represent which year?", "1999", ["1899", "2009", "1989"], 3),
        ("Stone tools mark which prehistoric age?", "The Stone Age", ["The Bronze Age", "The Iron Age", "The Ice Age"], 1),
        ("Bronze is an alloy of copper and:", "Tin", ["Iron", "Zinc", "Lead"], 2),
        ("Which age followed the Bronze Age?", "The Iron Age", ["The Stone Age", "The Copper Age", "The Steam Age"], 1),
        ("The first Olympic Games of antiquity were held in:", "Greece", ["Rome", "Egypt", "Persia"], 1),
    ]
    for prompt, ans, wrong, diff in extra:
        add("history", prompt, ans, wrong, diff)

    extra2 = [
        ("The Renaissance city ruled by the Medici family was:", "Florence", ["Venice", "Rome", "Milan"], 3),
        ("Napoleon was born on which island?", "Corsica", ["Elba", "Sardinia", "Sicily"], 3),
        ("The language of ancient Rome was:", "Latin", ["Greek", "Italian", "Etruscan"], 1),
        ("The Inca Empire was centred in which mountains?", "The Andes", ["The Rockies", "The Alps", "The Himalayas"], 2),
        ("The first US president to resign from office was:", "Richard Nixon", ["Andrew Johnson", "Herbert Hoover", "Gerald Ford"], 2),
        ("The Hundred Years' War actually lasted about:", "116 years", ["100 years", "84 years", "150 years"], 3),
        ("The Soviet Union was dissolved in:", "1991", ["1985", "1989", "1993"], 2),
        ("The month of July is named after:", "Julius Caesar", ["Juno", "Jupiter", "Justinian"], 2),
        ("The month of August is named after:", "Augustus", ["Aurelius", "Agrippa", "Antony"], 3),
        ("The American war of 1775–1783 is known as the:", "Revolutionary War", ["Civil War", "War of 1812", "French and Indian War"], 2),
        ("The D-Day fleet crossed which body of water?", "The English Channel", ["The North Sea", "The Bay of Biscay", "The Irish Sea"], 2),
        ("The “Iron Curtain” described the Cold War divide across:", "Europe", ["Asia", "The Atlantic", "Berlin only"], 2),
        ("Before Elizabeth II, Britain's longest-reigning monarch was:", "Queen Victoria", ["George III", "Henry VIII", "Elizabeth I"], 3),
        ("The Wars of the Roses were fought in:", "England", ["France", "Scotland", "Spain"], 3),
        ("The Colossus, an ancient wonder, stood at:", "Rhodes", ["Athens", "Alexandria", "Ephesus"], 3),
        ("Alexander the Great was tutored by which philosopher?", "Aristotle", ["Plato", "Socrates", "Epicurus"], 3),
        ("The plague-carrying fleas of the Black Death travelled mostly on:", "Rats", ["Cats", "Horses", "Pigeons"], 2),
        ("Which civilization built Chichén Itzá?", "The Maya", ["The Aztec", "The Inca", "The Olmec"], 2),
    ]
    for prompt, ans, wrong, diff in extra2:
        add("history", prompt, ans, wrong, diff)


# ------------------------------------------------------------ GEOGRAPHY ----
def gen_geography():
    capitals = [
        ("France", "Paris", ["Lyon", "Marseille", "Nice"], 1),
        ("Japan", "Tokyo", ["Osaka", "Kyoto", "Seoul"], 1),
        ("Australia", "Canberra", ["Sydney", "Melbourne", "Perth"], 2),
        ("Canada", "Ottawa", ["Toronto", "Vancouver", "Montreal"], 2),
        ("Brazil", "Brasília", ["Rio de Janeiro", "São Paulo", "Salvador"], 2),
        ("Turkey", "Ankara", ["Istanbul", "Izmir", "Antalya"], 2),
        ("Switzerland", "Bern", ["Zurich", "Geneva", "Basel"], 3),
        ("Kenya", "Nairobi", ["Mombasa", "Kampala", "Lagos"], 2),
        ("Egypt", "Cairo", ["Alexandria", "Giza", "Luxor"], 1),
        ("India", "New Delhi", ["Mumbai", "Kolkata", "Bengaluru"], 1),
        ("China", "Beijing", ["Shanghai", "Shenzhen", "Hong Kong"], 1),
        ("Russia", "Moscow", ["St. Petersburg", "Kazan", "Kyiv"], 1),
        ("Germany", "Berlin", ["Munich", "Frankfurt", "Hamburg"], 1),
        ("Spain", "Madrid", ["Barcelona", "Seville", "Valencia"], 1),
        ("Portugal", "Lisbon", ["Porto", "Madrid", "Seville"], 2),
        ("Italy", "Rome", ["Milan", "Venice", "Naples"], 1),
        ("Greece", "Athens", ["Thessaloniki", "Sparta", "Crete"], 1),
        ("Norway", "Oslo", ["Bergen", "Stockholm", "Helsinki"], 2),
        ("Sweden", "Stockholm", ["Gothenburg", "Oslo", "Copenhagen"], 2),
        ("Finland", "Helsinki", ["Oslo", "Tallinn", "Stockholm"], 2),
        ("Poland", "Warsaw", ["Kraków", "Gdańsk", "Prague"], 2),
        ("Austria", "Vienna", ["Salzburg", "Graz", "Zurich"], 2),
        ("Netherlands", "Amsterdam", ["Rotterdam", "The Hague", "Brussels"], 2),
        ("Argentina", "Buenos Aires", ["Córdoba", "Santiago", "Montevideo"], 2),
        ("Chile", "Santiago", ["Valparaíso", "Lima", "Buenos Aires"], 2),
        ("Peru", "Lima", ["Cusco", "Quito", "Bogotá"], 2),
        ("Colombia", "Bogotá", ["Medellín", "Cali", "Caracas"], 2),
        ("Mexico", "Mexico City", ["Guadalajara", "Cancún", "Monterrey"], 1),
        ("Cuba", "Havana", ["Santiago de Cuba", "San Juan", "Kingston"], 2),
        ("Morocco", "Rabat", ["Casablanca", "Marrakesh", "Fez"], 3),
        ("Nigeria", "Abuja", ["Lagos", "Kano", "Accra"], 3),
        ("Ethiopia", "Addis Ababa", ["Nairobi", "Khartoum", "Djibouti"], 2),
        ("South Korea", "Seoul", ["Busan", "Incheon", "Tokyo"], 1),
        ("Thailand", "Bangkok", ["Phuket", "Chiang Mai", "Hanoi"], 1),
        ("Vietnam", "Hanoi", ["Ho Chi Minh City", "Da Nang", "Bangkok"], 2),
        ("Indonesia", "Jakarta", ["Bali", "Surabaya", "Kuala Lumpur"], 2),
        ("Malaysia", "Kuala Lumpur", ["Penang", "Singapore", "Jakarta"], 2),
        ("Philippines", "Manila", ["Cebu", "Davao", "Quezon"], 2),
        ("Saudi Arabia", "Riyadh", ["Jeddah", "Mecca", "Dubai"], 2),
        ("New Zealand", "Wellington", ["Auckland", "Christchurch", "Sydney"], 2),
        ("Ireland", "Dublin", ["Cork", "Belfast", "Edinburgh"], 1),
        ("Hungary", "Budapest", ["Debrecen", "Vienna", "Bucharest"], 2),
        ("Czechia", "Prague", ["Brno", "Bratislava", "Budapest"], 2),
        ("Ukraine", "Kyiv", ["Lviv", "Odesa", "Kharkiv"], 1),
        ("United States", "Washington, D.C.", ["New York", "Los Angeles", "Chicago"], 1),
        ("United Kingdom", "London", ["Manchester", "Edinburgh", "Birmingham"], 1),
        ("South Africa (administrative)", "Pretoria", ["Johannesburg", "Durban", "Port Elizabeth"], 3),
        ("Denmark", "Copenhagen", ["Aarhus", "Odense", "Malmö"], 2),
        ("Belgium", "Brussels", ["Antwerp", "Bruges", "Ghent"], 1),
        ("Iceland", "Reykjavík", ["Akureyri", "Oslo", "Tórshavn"], 2),
        ("Croatia", "Zagreb", ["Split", "Dubrovnik", "Ljubljana"], 3),
        ("Romania", "Bucharest", ["Budapest", "Cluj-Napoca", "Sofia"], 2),
        ("Bulgaria", "Sofia", ["Plovdiv", "Varna", "Bucharest"], 3),
        ("Serbia", "Belgrade", ["Zagreb", "Sarajevo", "Novi Sad"], 3),
        ("Jordan", "Amman", ["Petra", "Aqaba", "Damascus"], 3),
        ("Pakistan", "Islamabad", ["Karachi", "Lahore", "Peshawar"], 2),
        ("Bangladesh", "Dhaka", ["Chittagong", "Kolkata", "Khulna"], 2),
        ("Nepal", "Kathmandu", ["Pokhara", "Lhasa", "Thimphu"], 2),
        ("Singapore", "Singapore", ["Jurong", "Kuala Lumpur", "Sentosa"], 1),
        ("United Arab Emirates", "Abu Dhabi", ["Dubai", "Sharjah", "Doha"], 2),
        ("Qatar", "Doha", ["Dubai", "Manama", "Muscat"], 2),
        ("Ghana", "Accra", ["Kumasi", "Lagos", "Abidjan"], 3),
        ("Tanzania (largest city)", "Dar es Salaam", ["Dodoma is larger", "Nairobi", "Zanzibar City"], 3),
    ]
    # (Tanzania's official capital is Dodoma — ask about the largest city instead
    # to keep exactly one defensible answer.)
    capitals = [c for c in capitals if c[0] != "Tanzania (largest city)"]
    for country, cap, wrong, diff in capitals:
        add("geography", f"What is the capital of {country}?", cap, wrong, diff)

    landmarks = [
        ("The Eiffel Tower stands in which city?", "Paris", ["London", "Brussels", "Lyon"], 1),
        ("Machu Picchu is located in which country?", "Peru", ["Mexico", "Chile", "Bolivia"], 2),
        ("The Colosseum is in which city?", "Rome", ["Athens", "Naples", "Istanbul"], 1),
        ("The Taj Mahal stands in which Indian city?", "Agra", ["Jaipur", "Delhi", "Varanasi"], 2),
        ("The Great Wall is in which country?", "China", ["Mongolia", "Japan", "Korea"], 1),
        ("Angkor Wat is in which country?", "Cambodia", ["Thailand", "Vietnam", "Laos"], 3),
        ("Petra, the rock-cut city, is in which country?", "Jordan", ["Egypt", "Morocco", "Syria"], 3),
        ("Christ the Redeemer overlooks which city?", "Rio de Janeiro", ["São Paulo", "Buenos Aires", "Lima"], 1),
        ("Stonehenge is located in which country?", "England", ["Ireland", "Scotland", "Wales"], 2),
        ("The Louvre museum is in which city?", "Paris", ["Rome", "Vienna", "Madrid"], 1),
        ("The Kremlin is in which city?", "Moscow", ["St. Petersburg", "Kyiv", "Minsk"], 1),
        ("The Statue of Liberty was a gift from which country?", "France", ["England", "Spain", "Italy"], 2),
        ("The Acropolis overlooks which city?", "Athens", ["Rome", "Sparta", "Cairo"], 1),
        ("Table Mountain overlooks which city?", "Cape Town", ["Johannesburg", "Nairobi", "Durban"], 2),
        ("The Alhambra palace is in which country?", "Spain", ["Portugal", "Morocco", "Italy"], 3),
        ("Uluru (Ayers Rock) is in which country?", "Australia", ["New Zealand", "South Africa", "Namibia"], 2),
        ("The Sydney Opera House sits beside which harbour?", "Sydney Harbour", ["Botany Bay", "Port Phillip", "Fremantle"], 2),
        ("Mount Rushmore is carved into hills in which country?", "The United States", ["Canada", "Mexico", "Brazil"], 1),
        ("The Sagrada Família basilica rises over which city?", "Barcelona", ["Madrid", "Lisbon", "Seville"], 2),
        ("The Brandenburg Gate stands in which city?", "Berlin", ["Munich", "Vienna", "Frankfurt"], 2),
        ("The Golden Gate Bridge spans the entrance to which bay?", "San Francisco Bay", ["Chesapeake Bay", "Hudson Bay", "Monterey Bay"], 1),
        ("The Blue Mosque is a landmark of which city?", "Istanbul", ["Cairo", "Ankara", "Tehran"], 2),
        ("The Leaning Tower is in which Italian city?", "Pisa", ["Florence", "Venice", "Siena"], 1),
        ("Neuschwanstein Castle is in which country?", "Germany", ["Austria", "Switzerland", "France"], 3),
    ]
    for prompt, ans, wrong, diff in landmarks:
        add("geography", prompt, ans, wrong, diff)

    physical = [
        ("Which is the largest ocean on Earth?", "Pacific", ["Atlantic", "Indian", "Arctic"], 1),
        ("Which is the longest river in South America?", "The Amazon", ["The Paraná", "The Orinoco", "The Magdalena"], 2),
        ("The Nile flows into which sea?", "The Mediterranean", ["The Red Sea", "The Arabian Sea", "The Black Sea"], 2),
        ("Mount Everest lies in which mountain range?", "The Himalayas", ["The Andes", "The Alps", "The Rockies"], 1),
        ("The Andes run along which continent?", "South America", ["North America", "Africa", "Asia"], 1),
        ("The Sahara Desert is on which continent?", "Africa", ["Asia", "Australia", "South America"], 1),
        ("Which desert is the largest hot desert in the world?", "Sahara", ["Gobi", "Kalahari", "Mojave"], 2),
        ("The Gobi Desert lies mainly in Mongolia and:", "China", ["Kazakhstan", "Russia", "India"], 3),
        ("Which is the largest continent by area?", "Asia", ["Africa", "North America", "Europe"], 1),
        ("Which is the smallest continent by area?", "Australia", ["Europe", "Antarctica", "South America"], 2),
        ("Which continent has the most countries?", "Africa", ["Asia", "Europe", "South America"], 2),
        ("Which country has the longest coastline in the world?", "Canada", ["Australia", "Russia", "Indonesia"], 2),
        ("Which country has the largest land area?", "Russia", ["Canada", "China", "The United States"], 1),
        ("Which two countries share the longest international border?", "Canada and the USA", ["Russia and China", "Argentina and Chile", "India and China"], 2),
        ("The Great Barrier Reef lies off the coast of which country?", "Australia", ["Brazil", "Philippines", "Mexico"], 1),
        ("Mount Kilimanjaro is on which continent?", "Africa", ["Asia", "South America", "Europe"], 1),
        ("Which is the deepest known point in the ocean?", "The Mariana Trench", ["The Puerto Rico Trench", "The Java Trench", "The Tonga Trench"], 2),
        ("The Dead Sea lies between Israel and:", "Jordan", ["Egypt", "Lebanon", "Syria"], 2),
        ("The Dead Sea is famous for being:", "So salty that people float easily", ["The world's largest lake", "Completely frozen", "The deepest lake"], 1),
        ("Which is the world's largest island (excluding Australia)?", "Greenland", ["Borneo", "Madagascar", "New Guinea"], 2),
        ("Which is the world's largest lake by area?", "The Caspian Sea", ["Lake Superior", "Lake Victoria", "Lake Baikal"], 3),
        ("Which lake is the deepest in the world?", "Lake Baikal", ["Lake Superior", "Lake Tanganyika", "The Caspian Sea"], 3),
        ("Angel Falls, the world's tallest waterfall, is in:", "Venezuela", ["Brazil", "Zambia", "Canada"], 3),
        ("Victoria Falls lies on the border of Zambia and:", "Zimbabwe", ["Zambia only", "Botswana", "Mozambique"], 3),
        ("The Suez Canal connects the Mediterranean Sea with which sea?", "Red Sea", ["Black Sea", "Arabian Sea", "Caspian Sea"], 2),
        ("The Panama Canal connects the Atlantic Ocean with which ocean?", "Pacific", ["Indian", "Arctic", "Southern"], 1),
        ("The Strait of Gibraltar separates Spain from:", "Morocco", ["Algeria", "Tunisia", "Portugal"], 2),
        ("The Bosphorus strait runs through which city?", "Istanbul", ["Athens", "Izmir", "Alexandria"], 2),
        ("Which river flows through London?", "The Thames", ["The Severn", "The Mersey", "The Tyne"], 1),
        ("Which river flows through Paris?", "The Seine", ["The Loire", "The Rhône", "The Garonne"], 1),
        ("Which river flows through Cairo?", "The Nile", ["The Jordan", "The Tigris", "The Euphrates"], 1),
        ("The Danube empties into which sea?", "The Black Sea", ["The Mediterranean", "The Baltic", "The Adriatic"], 3),
        ("The Ganges river is sacred in which religion?", "Hinduism", ["Buddhism", "Jainism only", "Sikhism only"], 1),
        ("The Mississippi river empties into the:", "Gulf of Mexico", ["Atlantic seaboard", "Pacific Ocean", "Hudson Bay"], 2),
        ("Which mountain range separates Europe from Asia?", "The Urals", ["The Alps", "The Caucasus only", "The Carpathians"], 2),
        ("Mont Blanc is the highest peak of which range?", "The Alps", ["The Pyrenees", "The Apennines", "The Carpathians"], 2),
        ("The highest mountain in Africa is:", "Kilimanjaro", ["Mount Kenya", "Atlas Peak", "Mount Meru"], 2),
        ("The highest mountain in North America is:", "Denali", ["Mount Whitney", "Mount Logan", "Mount Rainier"], 3),
        ("Which continent is a desert of ice with no permanent population?", "Antarctica", ["The Arctic", "Greenland", "Patagonia"], 1),
        ("The equator crosses which of these countries?", "Ecuador", ["Mexico", "Egypt", "India"], 2),
        ("The Tropic of Cancer lies in which hemisphere?", "Northern", ["Southern", "Eastern only", "Western only"], 2),
        ("Which line divides Earth into Northern and Southern Hemispheres?", "The Equator", ["The Prime Meridian", "The Tropic of Capricorn", "The International Date Line"], 1),
        ("The Prime Meridian passes through which observatory?", "Greenwich", ["Paris", "Cape Town", "Cairo"], 2),
        ("The Ring of Fire, known for volcanoes, surrounds which ocean?", "The Pacific", ["The Atlantic", "The Indian", "The Arctic"], 2),
        ("Iceland is known as the land of ice and:", "Fire (volcanoes)", ["Forests", "Lakes only", "Fjords only"], 1),
    ]
    for prompt, ans, wrong, diff in physical:
        add("geography", prompt, ans, wrong, diff)

    misc = [
        ("Which country is known as the Land of the Rising Sun?", "Japan", ["China", "Thailand", "South Korea"], 1),
        ("Venice is famous for its:", "Canals", ["Castles", "Cliffs", "Vineyards"], 1),
        ("Which country hosts the city of Marrakesh?", "Morocco", ["Tunisia", "Algeria", "Egypt"], 2),
        ("How many time zones does mainland China officially use?", "One", ["Three", "Five", "Seven"], 3),
        ("Which ancient wonder of the world is still standing today?", "Great Pyramid of Giza",
         ["Colossus of Rhodes", "Hanging Gardens", "Lighthouse of Alexandria"], 2),
        ("Which country is both in Europe and Asia?", "Turkey", ["Greece", "Poland", "Ukraine"], 2),
        ("Which country completely surrounds Lesotho?", "South Africa", ["Botswana", "Namibia", "Zimbabwe"], 3),
        ("Which country surrounds Vatican City?", "Italy", ["France", "Spain", "Switzerland"], 1),
        ("What is the smallest country in the world?", "Vatican City", ["Monaco", "San Marino", "Liechtenstein"], 1),
        ("Which country has the most people?", "India", ["China", "The United States", "Indonesia"], 2),
        ("Which country is an archipelago of more than 17,000 islands?", "Indonesia", ["The Philippines", "Japan", "Greece"], 3),
        ("Which country is nicknamed the Land of a Thousand Lakes?", "Finland", ["Sweden", "Norway", "Canada"], 2),
        ("The maple leaf appears on which country's flag?", "Canada", ["New Zealand", "Switzerland", "Norway"], 1),
        ("Which country's flag shows a red circle on white?", "Japan", ["South Korea", "China", "Vietnam"], 1),
        ("Scandinavia consists of Norway, Sweden and:", "Denmark", ["Finland", "Iceland", "The Netherlands"], 2),
        ("Which city is split by the Bosphorus into two continents?", "Istanbul", ["Cairo", "Moscow", "Athens"], 2),
        ("Which US state is a chain of Pacific islands?", "Hawaii", ["Alaska", "Florida", "California"], 1),
        ("Which desert covers much of Botswana and Namibia?", "The Kalahari", ["The Sahara", "The Gobi", "The Atacama"], 3),
        ("The Atacama, one of the driest places on Earth, is in:", "Chile", ["Peru", "Mexico", "Argentina"], 3),
        ("Which language is most widely spoken in Brazil?", "Portuguese", ["Spanish", "Brazilian Creole", "Italian"], 1),
        ("Which language is most widely spoken in Mexico?", "Spanish", ["Portuguese", "Nahuatl", "English"], 1),
        ("Madagascar lies off the coast of which continent?", "Africa", ["Asia", "Australia", "South America"], 1),
        ("Sicily is the largest island of which country?", "Italy", ["Greece", "Spain", "Malta"], 2),
        ("The Faroe Islands lie between Iceland, Norway and:", "Scotland", ["Ireland", "Greenland", "Denmark's mainland"], 3),
        ("Mount Fuji is the highest peak of which country?", "Japan", ["China", "South Korea", "Taiwan"], 1),
    ]
    for prompt, ans, wrong, diff in misc:
        add("geography", prompt, ans, wrong, diff)

    extra = [
        ("What is the capital of Scotland?", "Edinburgh", ["Glasgow", "Aberdeen", "Dundee"], 2),
        ("What is the capital of Wales?", "Cardiff", ["Swansea", "Newport", "Bangor"], 3),
        ("The longest river in Asia is the:", "Yangtze", ["Yellow River", "Mekong", "Ganges"], 3),
        ("The largest country in South America is:", "Brazil", ["Argentina", "Peru", "Colombia"], 1),
        ("The largest country in Africa by area is:", "Algeria", ["Sudan", "Nigeria", "Egypt"], 3),
        ("K2, the world's second-highest peak, is in which range?", "The Karakoram", ["The Himalayas proper", "The Hindu Kush", "The Pamirs"], 3),
        ("Most of the Amazon rainforest lies in:", "Brazil", ["Peru", "Colombia", "Venezuela"], 1),
        ("The Outback is a vast interior region of:", "Australia", ["South Africa", "Argentina", "Canada"], 1),
        ("Fjords are a famous feature of which country's coast?", "Norway", ["Portugal", "Ireland", "Croatia"], 1),
        ("Which sea lies between Italy and the Balkan peninsula?", "The Adriatic", ["The Aegean", "The Tyrrhenian", "The Ionian only"], 3),
        ("The semi-arid belt along the Sahara's southern edge is the:", "Sahel", ["Savanna coast", "Maghreb", "Veld"], 3),
        ("Mount Etna is a volcano on which island?", "Sicily", ["Sardinia", "Crete", "Corsica"], 2),
        ("The Grand Canyon was carved by which river?", "The Colorado", ["The Rio Grande", "The Mississippi", "The Snake"], 2),
        ("Niagara Falls sits on the border of the USA and:", "Canada", ["Mexico", "Greenland", "Cuba"], 1),
        ("The Matterhorn stands on Italy's border with:", "Switzerland", ["France", "Austria", "Slovenia"], 2),
        ("The Nile flows generally toward the:", "North", ["South", "East", "West"], 3),
    ]
    for prompt, ans, wrong, diff in extra:
        add("geography", prompt, ans, wrong, diff)


# ------------------------------------------------------ VISUAL (web only) ----
# Original SVG figure questions — rotations, counts, mirror images — correct by
# construction. Emitted ONLY into web/questions.js (extra rows with a 7th
# "figure" element; option strings may be SVG). The iOS bank stays text-only
# until the app grows an SVG renderer, so questions.json is untouched.
VISUAL = []

def _svg(content, w=100, h=100):
    return (f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" '
            f'fill="none" stroke="currentColor" stroke-width="5" '
            f'stroke-linejoin="round" stroke-linecap="round">{content}</svg>')

# Chiral / rotation-asymmetric shapes centred on (50,50): every 90° rotation
# (and the mirror) is visually distinct, so option sets can't collide.
SHAPES = {
    "arrow": '<path d="M50 18 L68 50 L56 50 L56 82 L44 82 L44 50 L32 50 Z"/>',
    "ell":   '<path d="M36 20 H52 V58 H70 V80 H36 Z"/>',
    "tee":   '<path d="M24 24 H76 V40 H58 V80 H42 V40 H24 Z"/>',
    "eff":   '<path d="M36 18 H68 V32 H50 V44 H64 V57 H50 V82 H36 Z"/>',
    "pee":   '<path d="M38 20 H58 A14 14 0 0 1 58 50 H50 V80 H38 Z"/>',
    "flag":  '<path d="M40 16 V84 M40 22 L74 34 L40 46"/>',
}

def _shape_at(name, angle, cx, cy, scale=1.0):
    return (f'<g transform="translate({cx} {cy}) scale({scale}) rotate({angle}) '
            f'translate(-50 -50)">{SHAPES[name]}</g>')

def _strip(cells):
    """A 4-cell film strip: three figures and a '?' cell."""
    parts = []
    for i, cell in enumerate(cells):
        x = i * 100
        parts.append(f'<rect x="{x + 4}" y="4" width="92" height="92" rx="12" '
                     f'stroke-width="2.5" opacity=".35"/>')
        parts.append(cell if cell is not None else
                     f'<text x="{x + 50}" y="64" text-anchor="middle" font-size="44" '
                     f'fill="currentColor" stroke="none" opacity=".8">?</text>')
    return _svg("".join(parts), w=400, h=100)

def add_visual(prompt, figure, correct_svg, wrong_svgs, difficulty):
    options = [correct_svg] + wrong_svgs
    rng.shuffle(options)
    VISUAL.append({
        "id": f"z{len(VISUAL) + 1:03d}", "domain": "patterns", "prompt": prompt,
        "options": options, "correctIndex": options.index(correct_svg),
        "difficulty": difficulty, "figure": figure,
    })

def _dotgrid(n, ox=0):
    """n dots on a 4-wide grid (fits up to 16 in a 100x100 cell)."""
    return "".join(
        f'<circle cx="{ox + 20 + (i % 4) * 20}" cy="{20 + (i // 4) * 20}" r="7" '
        f'fill="currentColor" stroke="none"/>' for i in range(n))

def _dots(n):
    return _svg(_dotgrid(n))

def gen_visual():
    # 1) Rotation sequences: the shape turns the same amount each step.
    for name in SHAPES:
        for a0, step in [(0, 90), (0, 45), (45, 90), (90, 45),
                         (0, 135), (180, 90), (45, 45), (90, 90)]:
            cells = [_shape_at(name, a0 + step * i, 50 + 100 * i, 50, 0.72) for i in range(3)]
            fig = _strip(cells + [None])
            correct = a0 + step * 3
            add_visual(
                "The shape turns the same way each step. Which figure comes next?",
                fig,
                _svg(_shape_at(name, correct, 50, 50, 0.9)),
                [_svg(_shape_at(name, w, 50, 50, 0.9)) for w in (correct + 90, correct + 180, correct - 90)],
                2 if step == 90 else 3)

    # 2) Counting: dots grow by a fixed amount each cell.
    for n0, k in [(1, 1), (2, 1), (1, 2), (3, 1), (2, 2), (4, 1), (3, 2), (1, 3),
                  (5, 1), (2, 3), (4, 2), (6, 1), (5, 2), (3, 3), (7, 1), (2, 4)]:
        counts = [n0, n0 + k, n0 + 2 * k]
        fig = _strip([_dotgrid(c, ox=i * 100) for i, c in enumerate(counts)] + [None])
        nxt = n0 + 3 * k
        wrongs = sorted({nxt + 1, max(1, nxt - 1), nxt + k + 1} - {nxt})
        add_visual("The dots increase by the same amount each step. Which comes next?",
                   fig, _dots(nxt), [_dots(w) for w in list(wrongs)[:3]], 1 if k == 1 else 2)

    # 3) Mirror images: chiral shapes, so the mirror never equals a rotation.
    for name in ["ell", "eff", "pee", "flag"]:
        for a0 in [0, 90, 180, 270]:
            base = _shape_at(name, a0, 50, 50, 0.9)
            fig = _svg(base)
            mirror = (f'<g transform="translate(100 0) scale(-1 1)">'
                      f'{_shape_at(name, a0, 50, 50, 0.9)}</g>')
            add_visual(
                "Which option is the mirror image (flipped left–right) of this figure?",
                fig, _svg(mirror),
                [_svg(_shape_at(name, a0 + r, 50, 50, 0.9)) for r in (180, 90, 0)],
                3)

    # 4) Size progression: the same figure grows (or shrinks) by a fixed step.
    for name in SHAPES:
        for scales, angle in [((0.35, 0.55, 0.75), 0), ((0.95, 0.75, 0.55), 0),
                              ((0.35, 0.55, 0.75), 90), ((0.95, 0.75, 0.55), 90),
                              ((0.35, 0.55, 0.75), 180), ((0.95, 0.75, 0.55), 180)]:
            growing = scales[1] > scales[0]
            nxt = scales[2] + (0.2 if growing else -0.2)
            cells = [_shape_at(name, angle, 50 + 100 * i, 50, sc) for i, sc in enumerate(scales)]
            fig = _strip(cells + [None])
            wrong_scales = [scales[0], scales[1], scales[2]]
            add_visual(
                f"The figure {'grows' if growing else 'shrinks'} by the same amount each step. Which comes next?",
                fig,
                _svg(_shape_at(name, angle, 50, 50, nxt)),
                [_svg(_shape_at(name, angle, 50, 50, w)) for w in wrong_scales],
                1 if growing else 2)

    # 5) Fill alternation while rotating: solid, outline, solid → outline.
    for name in ["arrow", "ell", "tee", "eff", "pee", "flag"]:
        for a0, step in [(0, 90), (45, 90), (0, 45), (90, 90)]:
            def cell(i, filled, cx):
                fill = 'fill="currentColor"' if filled else 'fill="none"'
                body = SHAPES[name].replace("/>", f' {fill}/>').replace("<path ", "<path ")
                return (f'<g transform="translate({cx} 50) scale(0.72) rotate({a0 + step * i}) '
                        f'translate(-50 -50)"><g {fill}>{SHAPES[name]}</g></g>')
            cells = [cell(i, i % 2 == 0, 50 + 100 * i) for i in range(3)]
            fig = _strip(cells + [None])
            a3 = a0 + step * 3
            def opt(filled, ang):
                fill = 'fill="currentColor"' if filled else 'fill="none"'
                return _svg(f'<g transform="translate(50 50) scale(0.9) rotate({ang}) '
                            f'translate(-50 -50)"><g {fill}>{SHAPES[name]}</g></g>')
            add_visual(
                "The figure alternates solid and outline while turning. Which comes next?",
                fig, opt(False, a3),
                [opt(True, a3), opt(False, a3 + 90), opt(True, a3 - step)],
                2 if step == 90 else 3)


def validate_visual():
    ids = set()
    for q in VISUAL:
        assert q["id"] not in ids, q["id"]
        ids.add(q["id"])
        assert len(q["options"]) == 4 and len(set(q["options"])) == 4, f"{q['id']}: options"
        assert q["options"][q["correctIndex"]], q["id"]
        assert "<svg" in q["figure"], q["id"]


# ------------------------------------------------------------- validate ----
def finalize():
    """Trim each domain to exactly PER_DOMAIN questions and assign stable ids."""
    global QS
    by_domain = {}
    for q in QS:
        by_domain.setdefault(q["domain"], []).append(q)
    out = []
    for d in DOMAINS:
        pool = by_domain.get(d, [])
        assert len(pool) >= PER_DOMAIN, f"{d}: only {len(pool)} questions (need {PER_DOMAIN})"
        # Trim by even spacing (not the tail) so every template family survives.
        step = len(pool) / PER_DOMAIN
        kept = [pool[int(i * step)] for i in range(PER_DOMAIN)]
        for i, q in enumerate(kept, start=1):
            q["id"] = f"{d[0]}{i:03d}"
            out.append(q)
    QS = out


def validate():
    ids = set()
    for q in QS:
        assert q["id"] not in ids, f"duplicate id {q['id']}"
        ids.add(q["id"])
        assert len(q["options"]) == 4, f"{q['id']}: needs 4 options"
        assert len(set(q["options"])) == 4, f"{q['id']}: duplicate options"
        assert 0 <= q["correctIndex"] < 4, f"{q['id']}: bad index"
        assert q["options"][q["correctIndex"]], f"{q['id']}: empty answer"
        assert q["difficulty"] in (1, 2, 3), f"{q['id']}: bad difficulty"
        assert q["prompt"].strip(), f"{q['id']}: empty prompt"
    assert len(QS) == PER_DOMAIN * len(DOMAINS), f"total {len(QS)} != {PER_DOMAIN * len(DOMAINS)}"


def main():
    gen_math()
    gen_patterns()
    gen_reasoning()
    gen_verbal()
    gen_knowledge()
    gen_science()
    gen_history()
    gen_geography()
    finalize()
    validate()
    gen_visual()
    validate_visual()

    root = Path(__file__).resolve().parent.parent
    ordered = [{"id": q["id"], "domain": q["domain"], "prompt": q["prompt"],
                "options": q["options"], "correctIndex": q["correctIndex"],
                "difficulty": q["difficulty"]} for q in QS]
    (root / "Mindspar/Resources/questions.json").write_text(
        json.dumps(ordered, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    rows = ",\n".join(
        json.dumps([q["id"], q["domain"], q["difficulty"], q["prompt"],
                    q["options"], q["correctIndex"]], ensure_ascii=False)
        for q in QS)
    vrows = ",\n".join(
        json.dumps([q["id"], q["domain"], q["difficulty"], q["prompt"],
                    q["options"], q["correctIndex"], q["figure"]], ensure_ascii=False)
        for q in VISUAL)
    (root / "web/questions.js").write_text(
        "// GENERATED by tools/generate_questions.py — do not edit by hand.\n"
        "// Format: [id, domain, difficulty(1–3), prompt, options[4], correctIndex,\n"
        "//          figure?] — a 7th element is an SVG figure (visual questions,\n"
        "//          web only; option strings may also be SVG).\n"
        f"export const QUESTIONS = [\n{rows},\n{vrows}\n];\n", encoding="utf-8")

    by_domain = {}
    for q in QS:
        by_domain.setdefault(q["domain"], []).append(q["difficulty"])
    print(f"total: {len(QS)} text + {len(VISUAL)} visual (web only)")
    for d, diffs in sorted(by_domain.items()):
        print(f"  {d:10s} {len(diffs):4d}  (d1={diffs.count(1)} d2={diffs.count(2)} d3={diffs.count(3)})")


if __name__ == "__main__":
    main()
