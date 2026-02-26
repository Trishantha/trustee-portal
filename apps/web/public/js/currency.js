/**
 * Currency Configuration and Utilities
 * Multi-currency support for Trustee Portal
 */

// Currency configuration
const CURRENCY_CONFIG = {
    // Default currency
    default: 'GBP',
    
    // Available currencies
    currencies: {
        GBP: {
            code: 'GBP',
            symbol: '£',
            name: 'British Pound',
            locale: 'en-GB',
            position: 'before', // symbol before or after amount
            decimal_places: 2
        },
        USD: {
            code: 'USD',
            symbol: '$',
            name: 'US Dollar',
            locale: 'en-US',
            position: 'before',
            decimal_places: 2
        },
        EUR: {
            code: 'EUR',
            symbol: '€',
            name: 'Euro',
            locale: 'de-DE',
            position: 'after',
            decimal_places: 2
        },
        CAD: {
            code: 'CAD',
            symbol: 'C$',
            name: 'Canadian Dollar',
            locale: 'en-CA',
            position: 'before',
            decimal_places: 2
        },
        AUD: {
            code: 'AUD',
            symbol: 'A$',
            name: 'Australian Dollar',
            locale: 'en-AU',
            position: 'before',
            decimal_places: 2
        }
    }
};

// Get current currency from organization settings or default
function getCurrentCurrency() {
    // Try to get from organization settings
    if (window.currentOrganization && window.currentOrganization.currency) {
        return window.currentOrganization.currency;
    }
    // Try to get from localStorage
    const saved = localStorage.getItem('currency');
    if (saved && CURRENCY_CONFIG.currencies[saved]) {
        return saved;
    }
    // Return default
    return CURRENCY_CONFIG.default;
}

// Set current currency
function setCurrentCurrency(currencyCode) {
    if (CURRENCY_CONFIG.currencies[currencyCode]) {
        localStorage.setItem('currency', currencyCode);
        if (window.currentOrganization) {
            window.currentOrganization.currency = currencyCode;
        }
        return true;
    }
    return false;
}

// Format amount with currency
function formatCurrency(amount, currencyCode = null) {
    const code = currencyCode || getCurrentCurrency();
    const config = CURRENCY_CONFIG.currencies[code] || CURRENCY_CONFIG.currencies[CURRENCY_CONFIG.default];
    
    const numAmount = parseFloat(amount) || 0;
    const formatted = numAmount.toLocaleString(config.locale, {
        minimumFractionDigits: config.decimal_places,
        maximumFractionDigits: config.decimal_places
    });
    
    if (config.position === 'before') {
        return `${config.symbol}${formatted}`;
    } else {
        return `${formatted} ${config.symbol}`;
    }
}

// Format amount without symbol (just the number)
function formatAmount(amount, currencyCode = null) {
    const code = currencyCode || getCurrentCurrency();
    const config = CURRENCY_CONFIG.currencies[code] || CURRENCY_CONFIG.currencies[CURRENCY_CONFIG.default];
    
    const numAmount = parseFloat(amount) || 0;
    return numAmount.toLocaleString(config.locale, {
        minimumFractionDigits: config.decimal_places,
        maximumFractionDigits: config.decimal_places
    });
}

// Get currency symbol
function getCurrencySymbol(currencyCode = null) {
    const code = currencyCode || getCurrentCurrency();
    const config = CURRENCY_CONFIG.currencies[code] || CURRENCY_CONFIG.currencies[CURRENCY_CONFIG.default];
    return config.symbol;
}

// Get all available currencies
function getAvailableCurrencies() {
    return Object.values(CURRENCY_CONFIG.currencies);
}

// Currency selector HTML
function getCurrencySelectorHTML(id = 'currencySelector', currentValue = null) {
    const current = currentValue || getCurrentCurrency();
    const currencies = getAvailableCurrencies();
    
    return `
        <select id="${id}" class="currency-selector" onchange="handleCurrencyChange(this.value)">
            ${currencies.map(c => `
                <option value="${c.code}" ${current === c.code ? 'selected' : ''}>
                    ${c.symbol} ${c.code} - ${c.name}
                </option>
            `).join('')}
        </select>
    `;
}

// Handle currency change
function handleCurrencyChange(currencyCode) {
    setCurrentCurrency(currencyCode);
    // Reload page to apply new currency
    window.location.reload();
}

// Export for use in other files
window.CurrencyConfig = CURRENCY_CONFIG;
window.getCurrentCurrency = getCurrentCurrency;
window.setCurrentCurrency = setCurrentCurrency;
window.formatCurrency = formatCurrency;
window.formatAmount = formatAmount;
window.getCurrencySymbol = getCurrencySymbol;
window.getAvailableCurrencies = getAvailableCurrencies;
window.getCurrencySelectorHTML = getCurrencySelectorHTML;
window.handleCurrencyChange = handleCurrencyChange;
