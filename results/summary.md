# Does TDD really cost your coding agent 8×?

Replication of [Böckeler's TDD-in-the-agent-loop experiment](https://martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html). 18 agent runs on `claude-sonnet-5`, total spend $18.58. Generated 2026-08-15.

## Headline

| task | TDD vs no-tests (raw tokens) | TDD vs no-tests (actual cost) | TDD vs spec-first (cost) | Thoughtworks reported |
|---|---|---|---|---|
| small | 10.00× | 6.05× | 4.37× | 8.50× |
| medium | 71.50× | 24.61× | 11.05× | 2.96× |
| large | 101.77× | 23.60× | 10.23× | 4.89× |

> Raw tokens = `input + output + cacheRead + cacheWrite` weighted equally, the metric the original study reports. Cost prices those same tokens at published rates (cache reads at 0.1×).

## Per task and arm

| task | arm | n | raw tokens | output | cost | turns | test runs | src loc | test loc | hold-out |
|---|---|---|---|---|---|---|---|---|---|---|
| small | tdd | 2 | 785,296 | 8,377 | $0.484 | 33 | 15 | 18 | 42 | 15.0/15 (100%) |
| small | spec-first | 2 | 98,764 | 2,732 | $0.111 | 7 | 1 | 18 | 109 | 15.0/15 (100%) |
| small | no-tests | 2 | 78,542 | 1,694 | $0.080 | 5 | 0 | 18 | 0 | 15.0/15 (100%) |
| small | reference | 1 | — | — | — | — | — | 150 | 0 | 15.0/15 (100%) |
| medium | tdd | 2 | 6,218,580 | 32,858 | $2.819 | 119 | 56 | 105 | 147 | 21.0/21 (100%) |
| medium | spec-first | 2 | 132,931 | 8,699 | $0.255 | 6 | 1 | 122 | 206 | 21.0/21 (100%) |
| medium | no-tests | 2 | 86,972 | 2,919 | $0.115 | 5 | 0 | 120 | 0 | 21.0/21 (100%) |
| medium | reference | 1 | — | — | — | — | — | 150 | 0 | 21.0/21 (100%) |
| large | tdd | 2 | 11,559,024 | 47,697 | $4.760 | 175 | 80 | 197 | 265 | 29.0/29 (100%) |
| large | spec-first | 2 | 165,262 | 18,143 | $0.466 | 7 | 1 | 205 | 394 | 29.0/29 (100%) |
| large | no-tests | 2 | 113,575 | 6,450 | $0.202 | 6 | 0 | 169 | 0 | 29.0/29 (100%) |
| large | reference | 1 | — | — | — | — | — | 150 | 0 | 29.0/29 (100%) |

## Source figures being replicated

| task size | reported TDD token multiplier | runs behind it |
|---|---|---|
| small | 8.50× | 2 vs 2 |
| medium | 2.96× | 6 vs 2 |
| large | 4.89× | 2 vs 2 |

The widely repeated "~3× on bigger tasks" is the **medium** figure. The large task was 4.89×.

