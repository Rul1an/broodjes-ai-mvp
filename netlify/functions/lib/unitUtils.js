// --- Quantity Parsing ---
function parseQuantityAndUnit(quantityString) {
    if (!quantityString || typeof quantityString !== 'string') {
        return { value: NaN, unit: null };
    }
    quantityString = quantityString.toLowerCase().trim();
    const numberMatch = quantityString.match(/^[\d.,]+/);
    if (!numberMatch) {
        if (['snufje', 'naar smaak', 'beetje'].includes(quantityString)) {
            return { value: NaN, unit: quantityString };
        }
        return { value: NaN, unit: null };
    }
    let value = parseFloat(numberMatch[0].replace(',', '.'));
    if (isNaN(value)) {
        return { value: NaN, unit: null };
    }
    let unit = quantityString.substring(numberMatch[0].length).trim();
    switch (unit) {
        case 'g': case 'gram': unit = 'g'; break;
        case 'kg': case 'kilogram': unit = 'kg'; break;
        case 'l': case 'liter': unit = 'l'; break;
        case 'ml': case 'milliliter': unit = 'ml'; break;
        case 'el': case 'eetlepel': case 'eetlepels': unit = 'el'; break;
        case 'tl': case 'theelepel': case 'theelepels': unit = 'tl'; break;
        case 'st': case 'stk': case 'stuk': case 'stuks': unit = 'stuks'; break;
        case '': if (Number.isInteger(value)) { unit = 'stuks'; } else { unit = null; } break;
        // Keep original unit if not matched
    }
    return { value, unit };
}

// --- Unit Conversion ---
function normalizeUnit(unit) {
    if (!unit) return null;
    unit = unit.toLowerCase().trim();
    switch (unit) {
        case 'gram': case 'gr': return 'g';
        case 'kilogram': return 'kg';
        case 'milliliter': return 'ml';
        case 'liter': return 'l';
        case 'eetlepel': case 'eetlepels': return 'el'; // Approx volume
        case 'theelepel': case 'theelepels': return 'tl'; // Approx volume
        case 'stuk': case 'stk': case 'plakje': case 'plakjes': return 'stuks'; // Normalize count units
        default: return unit; // Return original if no specific normalization
    }
}

function getConvertedQuantity(value, fromUnitRaw, toUnitRaw) {
    const fromUnit = normalizeUnit(fromUnitRaw);
    const toUnit = normalizeUnit(toUnitRaw);

    if (!fromUnit || !toUnit || fromUnit === toUnit) {
        return value; // No conversion needed or possible
    }

    // Weight Conversions
    if (fromUnit === 'g' && toUnit === 'kg') return value / 1000;
    if (fromUnit === 'kg' && toUnit === 'g') return value * 1000;

    // Volume Conversions
    if (fromUnit === 'ml' && toUnit === 'l') return value / 1000;
    if (fromUnit === 'l' && toUnit === 'ml') return value * 1000;

    // TODO: Add approximate volume conversions if needed (el/tl to ml/l)
    // e.g., if (fromUnit === 'el' && toUnit === 'ml') return value * 15; // Approx 15ml/el

    // If units are different but not handled by conversion rules, return NaN
    console.warn(`Unit conversion not implemented between '${fromUnitRaw}' and '${toUnitRaw}'`);
    return NaN;
}

module.exports = {
    parseQuantityAndUnit,
    normalizeUnit,
    getConvertedQuantity
};
