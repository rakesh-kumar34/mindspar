#!/usr/bin/env python3
"""Mindspar question bank generator.

Produces BOTH question files from one source of truth:
  Mindspar/Resources/questions.json  (iOS)
  web/questions.js                   (web client)

Quality strategy: math / pattern / logic questions come from parameterized
templates whose answers are computed, so they are correct by construction.
Verbal / knowledge / science come from curated, verified fact pools with
plausible same-category distractors. Deterministic (seeded) so the bank is
stable across runs; bump SEED to reshuffle parameters.

Run from the repo root:  python3 tools/generate_questions.py
"""
import json
import random
import re
from pathlib import Path

SEED = 7
rng = random.Random(SEED)

QS = []            # {id, domain, prompt, options[4], correctIndex, difficulty}
_seen_prompts = set()
_counter = {}


def add(domain, prompt, correct, distractors, difficulty):
    """Register a question. Skips duplicates; validates shape."""
    correct = str(correct)
    options = [correct] + [str(d) for d in distractors]
    options = list(dict.fromkeys(options))          # dedupe, keep order
    if len(options) < 4 or prompt in _seen_prompts:
        return False
    options = options[:4]
    rng.shuffle(options)
    _seen_prompts.add(prompt)
    _counter[domain] = _counter.get(domain, 0) + 1
    QS.append({
        "id": f"{domain[0]}{_counter[domain]:03d}",
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
                 (28, 450), (75, 160)]:
        add("math", f"What is {p}% of {n}?", p * n // 100,
            int_distractors(p * n // 100, max(2, p * n // 1000 * 5 or 4)), 1 if p in (25, 50, 75, 10) else 2)

    # Reverse percentage (discount)
    for orig, d in [(1000, 20), (1500, 30), (800, 25), (1200, 15), (2000, 35),
                    (600, 40), (2500, 12), (900, 60)]:
        sale = orig * (100 - d) // 100
        add("math", f"A jacket costs {sale:,} after a {d}% discount. What was the original price?",
            f"{orig:,}", [f"{orig + 100:,}", f"{orig - 100:,}", f"{sale + orig - sale // 2:,}"], 2)

    # Linear equations, integer solutions
    for a, x, b in [(3, 9, 7), (4, 8, 5), (5, 7, 12), (7, 6, 9), (6, 12, 13),
                    (8, 9, 15), (9, 8, 11), (4, 15, 18), (11, 7, 16), (12, 6, 19)]:
        c = a * x - b
        add("math", f"If {a}x − {b} = {c}, what is x?", x, int_distractors(x, 2), 1 if a <= 4 else 2)

    # Speed = distance / time (integer answers)
    for d, t in [(180, 2.5), (240, 3), (150, 2.5), (320, 4), (90, 1.5),
                 (210, 3.5), (280, 3.5), (135, 1.5)]:
        v = int(d / t)
        add("math", f"A train covers {d} km in {t} hours. What is its average speed?",
            f"{v} km/h", [f"{v + 4} km/h", f"{v - 4} km/h", f"{v + 8} km/h"], 2)

    # Work rates: w1 workers, d1 days -> w2 workers
    for w1, d1, w2 in [(12, 10, 8), (6, 8, 4), (9, 12, 6), (10, 6, 5),
                       (8, 9, 6), (15, 4, 10), (14, 6, 12), (16, 9, 12)]:
        days = w1 * d1 // w2
        add("math", f"{w1} workers finish a job in {d1} days. At the same rate, how many days would {w2} workers need?",
            days, int_distractors(days, 2), 2)

    # Next prime
    primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59,
              61, 67, 71, 73, 79, 83, 89, 97, 101]
    for n in [31, 43, 53, 61, 71, 83, 47, 89]:
        nxt = next(p for p in primes if p > n)
        wrong = [n + 2 if n + 2 != nxt else n + 6, nxt + 2, nxt + 4]
        add("math", f"What is the next prime number after {n}?", nxt, wrong, 2)

    # Exponent rules
    for a, b in [(5, 3), (4, 6), (7, 2), (3, 9), (6, 5), (8, 4)]:
        add("math", f"(2^{a} × 2^{b}) equals 2 raised to which power?", a + b,
            [a * b, a + b + 1, abs(a - b)], 2)
    for a, b in [(2, 3), (3, 2), (4, 2), (2, 5)]:
        add("math", f"(3^{a})^{b} equals 3 raised to which power?", a * b,
            [a + b, a ** b if a ** b != a * b else a * b + 2, a * b - 1], 2)

    # Averages
    for nums in [(12, 18, 24), (7, 11, 15), (20, 30, 40), (9, 14, 25),
                 (16, 22, 34), (5, 25, 45), (13, 21, 32, 46), (10, 20, 30, 40)]:
        avg = sum(nums) // len(nums)
        add("math", f"What is the average of {', '.join(map(str, nums))}?",
            avg, int_distractors(avg, 3), 2)

    # Fractions of numbers
    for num, den, n in [(3, 4, 96), (2, 3, 84), (5, 8, 64), (3, 5, 75),
                        (4, 7, 91), (5, 6, 72), (7, 8, 56), (2, 9, 81)]:
        ans = n * num // den
        add("math", f"What is {num}/{den} of {n}?", ans, int_distractors(ans, den), 2)

    # Ratios
    for n, a, b in [(60, 2, 3), (90, 4, 5), (120, 3, 5), (84, 3, 4),
                    (150, 7, 8), (72, 5, 7), (110, 5, 6), (96, 5, 11)]:
        larger = n * b // (a + b)
        add("math", f"{n} sweets are split in the ratio {a}:{b}. How many are in the larger share?",
            larger, int_distractors(larger, a + b), 2)

    # Simple interest
    for p, r, t in [(1000, 5, 2), (2000, 4, 3), (1500, 6, 2), (800, 5, 4),
                    (2500, 8, 2), (1200, 10, 3)]:
        interest = p * r * t // 100
        add("math", f"Simple interest on {p:,} at {r}% per year for {t} years is:",
            interest, int_distractors(interest, r * t), 2)

    # Rectangle area / perimeter
    for l, w in [(12, 8), (15, 6), (9, 7), (14, 11), (18, 5), (13, 12)]:
        add("math", f"A rectangle is {l} by {w}. What is its area?", l * w,
            [2 * (l + w), l * w + l, l * w - w], 1)
    for l, w in [(16, 9), (11, 7), (21, 13), (17, 8)]:
        add("math", f"A rectangle is {l} by {w}. What is its perimeter?", 2 * (l + w),
            [l * w, 2 * (l + w) + 2, l + w], 1)

    # Squares & roots
    for n in [13, 14, 16, 17, 18, 19, 21, 23]:
        add("math", f"What is {n}²?", n * n, [n * n + n, n * n - n, (n + 1) * (n + 1)], 2)
    for n in [144, 196, 225, 289, 324, 400]:
        r = int(n ** 0.5)
        add("math", f"What is the square root of {n}?", r, int_distractors(r, 2), 2)

    # LCM (small, verified by computation)
    import math as _m
    for a, b in [(6, 8), (4, 10), (9, 12), (8, 12), (6, 15), (10, 14)]:
        lcm = a * b // _m.gcd(a, b)
        add("math", f"What is the least common multiple of {a} and {b}?", lcm,
            [a * b if a * b != lcm else lcm + a, lcm + a, _m.gcd(a, b)], 3)


# ------------------------------------------------------------- PATTERNS ----
def seq_prompt(terms):
    return ", ".join(map(str, terms)) + ", … what comes next?"


def gen_patterns():
    # Triangular numbers with offsets
    for off in [0, 1, 2, 4]:
        terms = [i * (i + 1) // 2 + off for i in range(1, 6)]
        nxt = 21 + off
        add("patterns", seq_prompt(terms), nxt, [nxt + 1, nxt - 2, nxt + 7], 2)

    # Second differences (n(n+1)-style and friends)
    for start, d0, inc in [(2, 4, 2), (3, 1, 1), (1, 2, 3), (5, 3, 2),
                           (4, 5, 3), (2, 7, 4), (10, 2, 2), (1, 5, 5),
                           (6, 2, 4), (3, 8, 2), (7, 1, 3), (2, 10, 5),
                           (12, 3, 3), (1, 9, 6)]:
        terms, t, d = [start], start, d0
        for _ in range(4):
            t += d
            terms.append(t)
            d += inc
        nxt = t + d
        add("patterns", seq_prompt(terms), nxt, int_distractors(nxt, inc + 1), 2)

    # Geometric
    for start, r, n in [(81, 3, 4), (64, 2, 5), (2, 3, 4), (5, 2, 5),
                        (3, 4, 4), (256, 4, 4), (7, 2, 4), (1000, 10, 3),
                        (6, 3, 4), (12, 2, 5), (2, 5, 4), (4096, 4, 5)]:
        if start >= r:  # decreasing (division) when start big
            terms = [start]
            for _ in range(n - 1):
                terms.append(terms[-1] // r if terms[-1] > start ** 0.5 else terms[-1] * r)
        terms = [start * r ** i for i in range(n)] if start < 60 else \
                [start // r ** i for i in range(n)]
        nxt = terms[-1] * r if start < 60 else terms[-1] // r
        add("patterns", seq_prompt(terms), nxt,
            [nxt * r if nxt * r != nxt else nxt + 1, max(1, nxt // r), nxt + r], 1 if r == 2 else 2)

    # Fibonacci-like
    for a, b in [(1, 1), (2, 3), (1, 4), (3, 4), (2, 5), (5, 6),
                 (4, 7), (1, 6), (6, 7), (2, 9)]:
        terms = [a, b]
        for _ in range(4):
            terms.append(terms[-1] + terms[-2])
        nxt = terms[-1] + terms[-2]
        add("patterns", seq_prompt(terms), nxt,
            [nxt + 1, nxt - 2, terms[-1] * 2], 2)

    # x -> k*x + c recurrences
    for start, k, c, n in [(2, 2, -1, 5), (1, 2, 1, 5), (3, 2, -2, 5),
                           (1, 3, -1, 4), (2, 3, 1, 4), (4, 2, 3, 4),
                           (5, 2, -3, 5), (1, 4, -2, 4), (2, 4, -3, 4), (3, 3, 2, 4)]:
        terms = [start]
        for _ in range(n - 1):
            terms.append(terms[-1] * k + c)
        nxt = terms[-1] * k + c
        add("patterns", seq_prompt(terms), nxt, int_distractors(nxt, max(3, abs(c) + k)), 3)

    # Alternating add
    for start, a, b in [(1, 4, 2), (2, 5, 3), (10, 3, 6), (4, 7, 1),
                        (6, 2, 8), (3, 9, 4), (5, 6, 2), (1, 8, 3),
                        (7, 4, 9), (2, 10, 5)]:
        terms, t = [start], start
        for i in range(5):
            t += a if i % 2 == 0 else b
            terms.append(t)
        nxt = t + (a if 5 % 2 == 0 else b)
        add("patterns", seq_prompt(terms), nxt, int_distractors(nxt, a + b), 2)

    # Letter sequences, growing skips (forward)
    def letters_forward(start, skips):
        out, i = [start], ord(start) - 65
        for s in skips:
            i += s
            out.append(chr(65 + i % 26))
        return out
    for start, base in [("A", 2), ("B", 1), ("C", 2), ("D", 3), ("F", 1), ("H", 2),
                        ("J", 3), ("K", 1), ("M", 2), ("E", 3)]:
        skips = [base + i for i in range(4)]
        seq = letters_forward(start, skips)
        nxt_i = (ord(seq[-1]) - 65 + base + 4) % 26
        nxt = chr(65 + nxt_i)
        wrong = [chr(65 + (nxt_i + d) % 26) for d in (1, 2, 24)]
        add("patterns", ", ".join(seq) + ", … which letter comes next?", nxt, wrong, 2)

    # Decreasing with growing negative diffs
    for start, d0, inc in [(100, 4, 4), (90, 2, 3), (120, 5, 5), (80, 1, 2),
                           (200, 10, 10), (150, 3, 6), (60, 1, 3), (110, 6, 2),
                           (140, 8, 4), (75, 5, 1)]:
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
    for off in [0, 1, 2, -1, 3, 5]:
        terms = [i * i + off for i in range(1, 6)]
        nxt = 36 + off
        add("patterns", seq_prompt(terms), nxt, [nxt + 2, nxt - 2, nxt + 6], 2)
    for off in [0, 1, -1, 2]:
        terms = [i ** 3 + off for i in range(1, 5)]
        nxt = 125 + off
        add("patterns", seq_prompt(terms), nxt, [nxt + 5, nxt - 10, 216 + off], 3)

    # Digit / position products
    for start, k in [(1, 2), (2, 2), (1, 3), (3, 2), (5, 3), (4, 4), (2, 4), (6, 2)]:
        terms = [start]
        for i in range(2, 6):
            terms.append(terms[-1] + k * i)
        nxt = terms[-1] + k * 6
        add("patterns", seq_prompt(terms), nxt, int_distractors(nxt, k * 2), 2)


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
              ("editors at the journal", "careful proofreaders")]
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
             ("the review passes", "the update ships on Friday", "The update did not ship on Friday", "The review did not pass", "The review passed twice")]
    for p, q, notq, ans, decoy in conds:
        add("reasoning", f"If {p}, {q}. {notq}. What follows?", ans,
            [decoy, f"{q.capitalize()} anyway", "Nothing can be concluded"], 2)

    # Some A are B; all B are C => some A are C
    triples = [("doctors", "pilots", "trained in navigation"),
               ("painters", "sailors", "licensed to sail"),
               ("teachers", "beekeepers", "registered with the guild"),
               ("farmers", "weavers", "members of the craft union"),
               ("dancers", "drummers", "graduates of the academy")]
    for a, b, c in triples:
        add("reasoning", f"Some {a} are {b}. All {b} are {c}. Which must be true?",
            f"Some {a} are {c}",
            [f"All {a} are {c}", f"No {a} are {c}", f"All {c} are {a}"], 2)

    # No Q are R; all P are R => no P are Q
    for p, q, r in [("P", "Q", "R"), ("swans", "runners", "flyers"),
                    ("cubes", "discs", "solids with corners")]:
        add("reasoning", f"If no {q} are {r}, and all {p} are {r}, then:",
            f"No {p} are {q}",
            [f"Some {p} are {q}", f"All {q} are {p}", "Nothing can be concluded"], 3)

    # Directions
    dirs = ["North", "East", "South", "West"]
    turn_sets = [["90° right", "180°", "90° left"], ["90° left", "90° left"],
                 ["180°", "90° right"], ["90° right", "90° right", "90° right"],
                 ["90° left", "180°", "90° left"], ["270° right"],
                 ["90° right", "90° left", "180°"], ["180°", "180°", "90° left"]]
    for i, turns in enumerate(turn_sets):
        start = i % 4
        heading = start
        for t in turns:
            deg = int(re.match(r"(\d+)", t).group(1))
            steps = deg // 90
            heading = (heading + steps) % 4 if "right" in t or t == "180°" or t == "270° right" else heading
            if "left" in t:
                heading = (heading - 2 * steps) % 4  # undo the add, then subtract
        # recompute cleanly
        heading = start
        for t in turns:
            deg = int(re.match(r"(\d+)", t).group(1))
            steps = deg // 90
            heading = (heading + steps) % 4 if "left" not in t else (heading - steps) % 4
        name = NAMES[(i + 5) % len(NAMES)]
        wrong = [d for d in dirs if d != dirs[heading]][:3]
        add("reasoning",
            f"{name} faces {dirs[start].lower()}. They turn {', then '.join(turns)}. Which way do they face now?",
            dirs[heading], wrong, 2)

    # Ordering puzzles: derive from a random true order
    for i in range(14):
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
                               (14, 6, "kites"), (26, 11, "boats")]:
        add("reasoning", f"A keeper has {total} {thing}. All but {keep} wander off. How many {thing} remain?",
            keep, [total - keep, total, total + keep], 1)

    # Row positions: left k-th, right m-th -> k+m-1 people
    for k, m in [(7, 5), (4, 9), (6, 6), (3, 11), (8, 7), (5, 8), (9, 4), (2, 13), (10, 10)]:
        n = k + m - 1
        name = rng.choice(NAMES)
        add("reasoning",
            f"In a single row, {name} is {k}th from the left and {m}th from the right. How many people are in the row?",
            n, [n + 1, n - 1, k + m], 2)

    # Weekday arithmetic
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    for start, delta in [(0, 10), (2, 16), (4, 9), (1, 23), (5, 12), (3, 30),
                         (6, 15), (0, 45), (2, 100)]:
        ans = days[(start + delta) % 7]
        wrong = [days[(start + delta + d) % 7] for d in (1, 2, 5)]
        add("reasoning",
            f"If today is {days[start]}, what day of the week will it be in {delta} days?",
            ans, wrong, 2)

    # Card-flip rule check (Wason variants)
    for vowel, cons, even, odd in [("A", "K", 4, 7), ("E", "T", 8, 3), ("I", "M", 6, 9), ("U", "R", 2, 5)]:
        add("reasoning",
            f"Rule: every card with a vowel has an even number on its back. Cards show {vowel}, {cons}, {even}, {odd}. Which cards must you flip to test the rule?",
            f"{vowel} and {odd}",
            [f"{vowel} and {even}", f"{cons} and {even}", "All four"], 3)


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
    ]
    for group, odd, diff in odd_ones:
        opts = group + [odd]
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
    ]
    for prompt, ans, wrong, diff in sentences:
        add("verbal", prompt, ans, wrong, diff)


# ------------------------------------------------------------ KNOWLEDGE ----
def gen_knowledge():
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
    ]
    for country, cap, wrong, diff in capitals:
        add("knowledge", f"What is the capital of {country}?", cap, wrong, diff)

    currencies = [
        ("Japan", "Yen", ["Won", "Yuan", "Ringgit"], 1),
        ("India", "Rupee", ["Taka", "Rupiah", "Dinar"], 1),
        ("United Kingdom", "Pound sterling", ["Euro", "Dollar", "Franc"], 1),
        ("Mexico", "Peso", ["Real", "Bolívar", "Colón"], 1),
        ("Russia", "Ruble", ["Hryvnia", "Złoty", "Lev"], 2),
        ("South Korea", "Won", ["Yen", "Yuan", "Baht"], 2),
        ("China", "Yuan", ["Yen", "Won", "Dong"], 1),
        ("Sweden", "Krona", ["Euro", "Franc", "Crown pound"], 2),
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
    ]
    for country, cur, wrong, diff in currencies:
        add("knowledge", f"What is the currency of {country}?", cur, wrong, diff)

    landmarks = [
        ("The Eiffel Tower stands in which city?", "Paris", ["London", "Brussels", "Lyon"], 1),
        ("Machu Picchu is located in which country?", "Peru", ["Mexico", "Chile", "Bolivia"], 2),
        ("The Colosseum is in which city?", "Rome", ["Athens", "Naples", "Istanbul"], 1),
        ("The Taj Mahal stands in which Indian city?", "Agra", ["Jaipur", "Delhi", "Varanasi"], 2),
        ("The Sahara Desert is on which continent?", "Africa", ["Asia", "Australia", "South America"], 1),
        ("Mount Everest lies in which mountain range?", "The Himalayas", ["The Andes", "The Alps", "The Rockies"], 1),
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
    ]
    for prompt, ans, wrong, diff in landmarks:
        add("knowledge", prompt, ans, wrong, diff)

    misc = [
        ("Which country has the longest coastline in the world?", "Canada", ["Australia", "Russia", "Indonesia"], 2),
        ("The Great Barrier Reef lies off the coast of which country?", "Australia", ["Brazil", "Philippines", "Mexico"], 1),
        ("Which language has the most native speakers worldwide?", "Mandarin Chinese", ["English", "Hindi", "Spanish"], 2),
        ("Mount Kilimanjaro is on which continent?", "Africa", ["Asia", "South America", "Europe"], 1),
        ("Which ancient wonder of the world is still standing today?", "Great Pyramid of Giza",
         ["Colossus of Rhodes", "Hanging Gardens", "Lighthouse of Alexandria"], 2),
        ("How many time zones does mainland China officially use?", "One", ["Three", "Five", "Seven"], 3),
        ("The Suez Canal connects the Mediterranean Sea with which sea?", "Red Sea",
         ["Black Sea", "Arabian Sea", "Caspian Sea"], 2),
        ("Which is the largest ocean on Earth?", "Pacific", ["Atlantic", "Indian", "Arctic"], 1),
        ("Which continent has the most countries?", "Africa", ["Asia", "Europe", "South America"], 2),
        ("The Panama Canal connects the Atlantic Ocean with which ocean?", "Pacific",
         ["Indian", "Arctic", "Southern"], 1),
        ("Which country is known as the Land of the Rising Sun?", "Japan", ["China", "Thailand", "South Korea"], 1),
        ("Which desert is the largest hot desert in the world?", "Sahara", ["Gobi", "Kalahari", "Mojave"], 2),
        ("Which two countries share the longest international border?", "Canada and the USA",
         ["Russia and China", "Argentina and Chile", "India and China"], 2),
        ("Venice is famous for its:", "Canals", ["Castles", "Cliffs", "Cobblestone hills"], 1),
        ("Which country hosts the city of Marrakesh?", "Morocco", ["Tunisia", "Algeria", "Egypt"], 2),
    ]
    for prompt, ans, wrong, diff in misc:
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
        ("temperature", "Kelvin", ["Celsius degree-hour", "Joule", "Calorie"], 2),
        ("electric charge", "Coulomb", ["Ampere", "Volt", "Watt"], 3),
    ]
    for qty, ans, wrong, diff in units:
        add("science", f"What is the SI unit of {qty}?", ans, wrong, diff)

    facts = [
        ("Which gas do plants primarily absorb for photosynthesis?", "Carbon dioxide", ["Oxygen", "Nitrogen", "Hydrogen"], 1),
        ("Which organelle produces most of a cell's energy?", "Mitochondrion", ["Nucleus", "Ribosome", "Golgi body"], 1),
        ("At high altitude, water boils at:", "A lower temperature", ["A higher temperature", "Exactly 100°C", "It cannot boil"], 3),
        ("Which blood type is the universal donor?", "O negative", ["AB positive", "A positive", "B negative"], 2),
        ("In which part of the cell is DNA primarily stored?", "Nucleus", ["Cytoplasm", "Cell wall", "Membrane"], 1),
        ("The speed of light in a vacuum is approximately:", "300,000 km/s", ["300 km/s", "3,000 km/s", "30,000 km/s"], 2),
        ("What is the largest organ of the human body?", "Skin", ["Liver", "Brain", "Lungs"], 2),
        ("Red blood cells carry which gas around the body?", "Oxygen", ["Carbon dioxide only", "Nitrogen", "Helium"], 1),
        ("Insulin is produced by which organ?", "Pancreas", ["Liver", "Kidney", "Spleen"], 2),
        ("What is the longest bone in the human body?", "Femur", ["Tibia", "Humerus", "Spine"], 2),
        ("Why can't sound travel through space?", "There is no medium to carry it", ["It moves too slowly", "It is absorbed by light", "Space is too cold"], 2),
        ("What is the chemical formula of water?", "H₂O", ["HO₂", "H₂O₂", "OH"], 1),
        ("Table salt is chemically known as:", "Sodium chloride", ["Potassium chloride", "Sodium carbonate", "Calcium chloride"], 2),
        ("Which pigment makes plants green?", "Chlorophyll", ["Carotene", "Melanin", "Keratin"], 1),
        ("A pH of 7 indicates a solution is:", "Neutral", ["Acidic", "Alkaline", "Saturated"], 2),
        ("You see lightning before hearing thunder because:", "Light travels faster than sound", ["Thunder happens later", "Sound is blocked by clouds", "Eyes react faster than ears"], 2),
        ("How many chromosomes does a typical human cell have?", "46", ["23", "44", "48"], 2),
        ("How many chambers does the human heart have?", "Four", ["Two", "Three", "Six"], 1),
        ("The speed of sound in air is roughly:", "343 m/s", ["34 m/s", "3,430 m/s", "1,000 m/s"], 3),
        ("Ice floats on water because ice is:", "Less dense than water", ["Colder than water", "Heavier than water", "Purer than water"], 2),
        ("Which vitamin does human skin produce in sunlight?", "Vitamin D", ["Vitamin C", "Vitamin A", "Vitamin B12"], 2),
        ("What type of energy is stored in a stretched spring?", "Elastic potential energy", ["Kinetic energy", "Thermal energy", "Chemical energy"], 2),
        ("Which state of matter has a fixed volume but no fixed shape?", "Liquid", ["Solid", "Gas", "Plasma"], 1),
        ("Evaporation happens faster when the temperature is:", "Higher", ["Lower", "Constant", "Below freezing"], 1),
        ("The process by which plants lose water through leaves is:", "Transpiration", ["Condensation", "Respiration", "Fermentation"], 3),
    ]
    for prompt, ans, wrong, diff in facts:
        add("science", prompt, ans, wrong, diff)


# ------------------------------------------------------------- validate ----
def validate():
    ids = set()
    for q in QS:
        assert q["id"] not in ids, f"duplicate id {q['id']}"
        ids.add(q["id"])
        assert len(q["options"]) == 4, f"{q['id']}: needs 4 options"
        assert len(set(q["options"])) == 4, f"{q['id']}: duplicate options"
        assert 0 <= q["correctIndex"] < 4, f"{q['id']}: bad index"
        assert q["difficulty"] in (1, 2, 3), f"{q['id']}: bad difficulty"


def main():
    gen_math()
    gen_patterns()
    gen_reasoning()
    gen_verbal()
    gen_knowledge()
    gen_science()
    validate()

    root = Path(__file__).resolve().parent.parent
    (root / "Mindspar/Resources/questions.json").write_text(
        json.dumps(QS, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    rows = ",\n".join(
        json.dumps([q["id"], q["domain"], q["difficulty"], q["prompt"],
                    q["options"], q["correctIndex"]], ensure_ascii=False)
        for q in QS)
    (root / "web/questions.js").write_text(
        "// GENERATED by tools/generate_questions.py — do not edit by hand.\n"
        "// Format: [id, domain, difficulty(1–3), prompt, options[4], correctIndex]\n"
        f"export const QUESTIONS = [\n{rows}\n];\n", encoding="utf-8")

    by_domain = {}
    for q in QS:
        by_domain.setdefault(q["domain"], []).append(q["difficulty"])
    print(f"total: {len(QS)}")
    for d, diffs in sorted(by_domain.items()):
        print(f"  {d:10s} {len(diffs):4d}  (d1={diffs.count(1)} d2={diffs.count(2)} d3={diffs.count(3)})")


if __name__ == "__main__":
    main()
