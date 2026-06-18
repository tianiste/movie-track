export function getCorrectionKey(record) {
    const title = (record.title || record.rawTitle || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\bs\d{1,2}\s*e\d{1,4}\b|\b\d{1,2}\s*x\s*\d{1,4}\b|\bseason\s*\d{1,2}\b|\b(?:episode|ep)\s*\d{1,4}\b/gi, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return title ? `${record.hostname.replace(/^www\./i, '').toLowerCase()}|${title}` : null;
}
export function applyCorrectionRule(record, rule) {
    if (!rule) {
        return record;
    }
    return {
        ...record,
        manualTitle: rule.title,
        manualMediaType: rule.mediaType,
        manualSeason: rule.sourceSeason === record.season ? rule.season : null
    };
}
//# sourceMappingURL=corrections.js.map