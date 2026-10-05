// Ordinary enhancement only. Blessed enhancement has its own confirmation/rules.
export function enhancementExplanation(config, separator = ' / ') {
    const percent = value => `${Number((value * 100).toFixed(2))}%`;
    return `성공 ${percent(config.successRate)}${separator}${config.destroyChanceOnFail > 0
        ? `실패한 경우 파괴 ${percent(config.destroyChanceOnFail)}` : '안전'}`;
}
